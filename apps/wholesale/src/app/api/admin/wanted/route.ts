import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wantedCards, cards, clients } from "@/lib/db/schema";
import { eq, count, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      cardId: cards.id,
      cardNumber: cards.cardNumber,
      name: cards.name,
      setCode: cards.setCode,
      price: cards.price,
      imageUrl: cards.imageUrl,
      stock: cards.stock,
      demandCount: count(wantedCards.id),
      clientNames: sql<string>`string_agg(${clients.name}, ', ' ORDER BY ${clients.name})`,
    })
    .from(wantedCards)
    .innerJoin(cards, eq(wantedCards.cardId, cards.id))
    .innerJoin(clients, eq(wantedCards.clientId, clients.id))
    .groupBy(cards.id, cards.cardNumber, cards.name, cards.setCode, cards.price, cards.imageUrl, cards.stock)
    .orderBy(desc(count(wantedCards.id)));

  return NextResponse.json(rows);
}
