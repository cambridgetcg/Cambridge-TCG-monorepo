import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * POST /api/cart/refresh
 * Body: { cardIds: number[] }
 * Returns: { prices: Record<number, number> } — current DB price for each card ID.
 * Used by the cart context to detect and apply price changes since items were added.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardIds } = await req.json() as { cardIds: number[] };

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  // Clamp to reasonable batch size
  const ids = cardIds.slice(0, 500).map(Number).filter((n) => Number.isFinite(n) && n > 0);

  const rows = await db
    .select({ id: cards.id, price: cards.price })
    .from(cards)
    .where(inArray(cards.id, ids));

  const prices: Record<number, number> = {};
  for (const row of rows) {
    if (row.price != null) prices[row.id] = row.price;
  }

  return NextResponse.json({ prices });
}
