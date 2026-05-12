import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logPriceChange } from "@/lib/price-change-log";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { price } = await req.json() as { price: number };

  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "Price must be a finite positive number" }, { status: 400 });
  }

  const cardId = parseInt(id);

  // Capture before-value for the price-change log. See
  // docs/connections/the-pricing-arrow.md (S17, Act 4 — the Archive's
  // missing log). Phase 2 of kingdom-049.
  const [existing] = await db
    .select({ price: cards.price, baseGbp: cards.baseGbp })
    .from(cards)
    .where(eq(cards.id, cardId));

  if (!existing) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(cards)
    .set({ price, lastSyncedAt: new Date() })
    .where(eq(cards.id, cardId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Witnesses' Book discipline (S13): catch-without-rethrow inside the
  // helper. The price has already changed; the log entry is the audit
  // trail, not the act.
  await logPriceChange({
    cardId,
    action: "admin_edit",
    source: "admin",
    actorLabel: session.user.email ? `admin:${session.user.email}` : "admin",
    before: { price: existing.price, baseGbp: existing.baseGbp },
    after: { price: updated.price, baseGbp: updated.baseGbp },
  });

  return NextResponse.json(updated);
}
