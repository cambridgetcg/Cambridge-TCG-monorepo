import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addCard, valuatePortfolio, saveSnapshot } from "@/lib/portfolio/db";
import { getListingActions } from "@/lib/portfolio/db";

// GET — valuated portfolio
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const { cards, summary } = await valuatePortfolio(session.user.id);

    // Save daily snapshot
    saveSnapshot(session.user.id, summary.total_value, summary.total_cost, summary.card_count)
      .catch((e) => console.error("[portfolio] Snapshot failed:", e));

    // Add listing actions to each card
    const enriched = cards.map((card) => ({
      ...card,
      listing_actions: getListingActions(card),
    }));

    return NextResponse.json({ cards: enriched, summary });
  } catch (err) {
    console.error("[portfolio] Valuation error:", err);
    return NextResponse.json({ error: "Failed to load portfolio." }, { status: 500 });
  }
}

// POST — add card to portfolio
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.sku?.trim()) {
      return NextResponse.json({ error: "Card SKU required." }, { status: 400 });
    }
    if (!body.quantity || body.quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be at least 1." }, { status: 400 });
    }

    const card = await addCard(session.user.id, {
      sku: body.sku.trim(),
      cardName: body.cardName?.trim(),
      cardNumber: body.cardNumber?.trim(),
      setCode: body.setCode?.trim(),
      setName: body.setName?.trim(),
      imageUrl: body.imageUrl,
      rarity: body.rarity?.trim(),
      condition: body.condition || "NM",
      quantity: body.quantity,
      acquisitionPrice: body.acquisitionPrice,
      acquiredAt: body.acquiredAt,
      notes: body.notes?.trim(),
    });

    return NextResponse.json({ card });
  } catch (err) {
    console.error("[portfolio] Add card error:", err);
    return NextResponse.json({ error: "Failed to add card." }, { status: 500 });
  }
}
