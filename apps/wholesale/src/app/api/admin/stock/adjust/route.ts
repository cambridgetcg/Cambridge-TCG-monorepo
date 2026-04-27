import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

/** PATCH /api/admin/stock/adjust — Adjust stock for a card (persists through sync) */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    cardId: number;
    stock: number;
    reason?: string;
    note?: string;
  };

  const { cardId, stock, reason, note } = body;

  if (typeof cardId !== "number" || typeof stock !== "number" || stock < 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const validReasons = ["count", "damage", "loss", "found", "correction", "other"] as const;
  const safeReason = validReasons.includes(reason as any) ? (reason as typeof validReasons[number]) : "correction";
  const safeNote = note ? String(note).slice(0, 500) : null;

  const desiredStock = Math.floor(stock);

  // Get current stock to compute delta
  const [current] = await db
    .select({ stock: cards.stock })
    .from(cards)
    .where(eq(cards.id, cardId));

  if (!current) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const delta = desiredStock - current.stock;

  if (delta === 0) {
    return NextResponse.json({ id: cardId, stock: current.stock });
  }

  // Record adjustment and update stock in a transaction
  const [updated] = await db.transaction(async (tx) => {
    await tx.insert(stockAdjustments).values({
      cardId,
      delta,
      reason: safeReason,
      note: safeNote,
    });

    return tx
      .update(cards)
      .set({ stock: desiredStock })
      .where(eq(cards.id, cardId))
      .returning({ id: cards.id, stock: cards.stock });
  });

  return NextResponse.json(updated);
}
