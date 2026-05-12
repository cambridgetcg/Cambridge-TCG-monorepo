/**
 * PATCH /api/portfolio/cards/[id]/sacred — toggle the sacred flag.
 *
 * From `docs/connections/the-unseen.md` passage #8 — cards that are
 * not data. Only the card's owner can set or unset the flag. The flag
 * is binary; the toggle is deliberate.
 *
 * Body: { is_sacred: boolean }
 * Returns: { ok: true, is_sacred: boolean }
 *
 * See `docs/methodology/sacred.md` for the customer-facing recipe.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  let body: { is_sacred?: unknown };
  try {
    body = (await request.json()) as { is_sacred?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body.is_sacred !== "boolean") {
    return NextResponse.json(
      { error: "is_sacred must be true or false." },
      { status: 400 },
    );
  }

  try {
    const r = await query(
      `UPDATE portfolio_cards
          SET is_sacred = $3, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING is_sacred`,
      [id, session.user.id, body.is_sacred],
    );
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "Card not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, is_sacred: r.rows[0].is_sacred });
  } catch (err) {
    console.error("[portfolio/sacred] write failed:", err);
    const message = err instanceof Error ? err.message : "save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
