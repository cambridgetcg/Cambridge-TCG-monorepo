import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cartItems, cards } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export async function GET() {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON, items: [] },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = parseInt(session.user.id);
  const rows = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.clientId, clientId));

  const items = rows.map((r) => ({
    card: {
      id: r.cardId,
      cardNumber: r.cardNumber,
      sku: r.sku,
      name: r.cardName,
      setCode: r.setCode,
      setName: r.setName,
      price: r.price,
    },
    quantity: r.quantity,
  }));

  return NextResponse.json(items);
}

export async function PUT(req: NextRequest) {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    return NextResponse.json(
      { publication_status: "blocked", reason: LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON },
      { status: 503 },
    );
  }
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = parseInt(session.user.id);
  const body = (await req.json()) as {
    items: {
      card: {
        id: number;
        cardNumber: string;
        sku: string;
        name: string;
        setCode: string | null;
        setName: string | null;
        price: number;
      };
      quantity: number;
    }[];
  };

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const now = new Date();

  // Look up real prices from DB to prevent client-supplied price manipulation
  const cardIds = body.items.map((item) => item.card.id);
  const dbCards = cardIds.length > 0
    ? await db.select({ id: cards.id, price: cards.price }).from(cards).where(inArray(cards.id, cardIds))
    : [];
  const priceMap = new Map(dbCards.map((c) => [c.id, c.price]));

  await db.transaction(async (tx) => {
    await tx.delete(cartItems).where(eq(cartItems.clientId, clientId));

    if (body.items.length > 0) {
      await tx.insert(cartItems).values(
        body.items.map((item) => {
          const verifiedPrice = priceMap.get(item.card.id);
          if (verifiedPrice == null) {
            console.warn(`[CART] Card ${item.card.id} not found in DB, using client price as fallback`);
          }
          return {
            clientId,
            cardId: item.card.id,
            quantity: item.quantity,
            cardNumber: item.card.cardNumber,
            sku: item.card.sku,
            cardName: item.card.name,
            setCode: item.card.setCode,
            setName: item.card.setName,
            price: verifiedPrice ?? item.card.price,
            addedAt: now,
            updatedAt: now,
          };
        })
      );
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = parseInt(session.user.id);
  await db.delete(cartItems).where(eq(cartItems.clientId, clientId));

  return NextResponse.json({ ok: true });
}
