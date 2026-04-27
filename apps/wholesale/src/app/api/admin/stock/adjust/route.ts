import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stock as stockService } from "@/lib/stock";
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

  // Set absolute stock via stock service (computes delta internally)
  const [updated] = await db.transaction(async (tx) => {
    const movement = await stockService.writer.setAbsolute(tx, {
      cardId,
      desiredStock,
      note: safeNote ?? `Admin set stock to ${desiredStock}`,
    });

    // Dual-write to stock_adjustments for syncUkStock backward compat
    if (movement) {
      await tx.insert(stockAdjustments).values({
        cardId,
        delta: movement.delta,
        reason: safeReason,
        note: safeNote,
      });
    }

    // Return the updated card
    return tx
      .select({ id: cards.id, stock: cards.stock })
      .from(cards)
      .where(eq(cards.id, cardId));
  });

  if (!updated) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
