import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { updateEscrowStatus } from "@/lib/market/db";

// POST — seller confirms dispatch with tracking. Sellers previously had
// no self-serve way to advance the escrow past awaiting_shipment; an
// admin had to do it for them. Global free trade §2.3: the platform
// provides the wiring, the traders run their own logistics.
//
// Routing decides the transition: full-escrow trades ship to Cambridge
// TCG first (shipped_to_ctcg); direct/verified tiers go straight to the
// buyer (shipped_to_buyer). Tracking lands in the matching column via
// the same updateEscrowStatus path admin uses, so lifecycle logging and
// buyer notifications fire identically.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    carrier?: string;
    trackingNumber?: string;
  };
  if (!body.trackingNumber?.trim()) {
    return NextResponse.json({ error: "trackingNumber required." }, { status: 400 });
  }

  const tradeRes = await query(
    `SELECT seller_id, escrow_status, seller_ships_to FROM market_trades WHERE id = $1`,
    [id]
  );
  if (tradeRes.rows.length === 0) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const trade = tradeRes.rows[0];

  if (trade.seller_id !== session.user.id) {
    return NextResponse.json({ error: "Only the seller can confirm dispatch." }, { status: 403 });
  }
  // The webhook stamps 'awaiting_shipment' on payment; 'paid' is the
  // admin-set equivalent. Either means the seller's next move is to ship.
  if (trade.escrow_status !== "awaiting_shipment" && trade.escrow_status !== "paid") {
    return NextResponse.json(
      { error: `Trade is in '${trade.escrow_status}' state — nothing to ship.` },
      { status: 409 }
    );
  }

  // Carrier lands in its own column (migration 0108) so tracking links
  // stay derivable via lib/shipping/carriers.ts; the tracking columns
  // hold the bare number. Rows shipped before 0108 carry the old
  // "Carrier TRACKING" concatenation in the tracking column instead.
  const tracking = body.trackingNumber.trim().slice(0, 100);
  const carrier = body.carrier?.trim().slice(0, 50) || undefined;
  const shipsToCtcg = trade.seller_ships_to === "ctcg";

  const updated = await updateEscrowStatus(
    id,
    shipsToCtcg ? "shipped_to_ctcg" : "shipped_to_buyer",
    {
      ...(shipsToCtcg ? { trackingToCtcg: tracking } : { trackingToBuyer: tracking }),
      carrier,
      actorId: session.user.id,
      actorLabel: "user:seller-ship",
      reason: `Seller confirmed dispatch (${carrier ? `${carrier} ` : ""}${tracking})`,
    }
  );
  if (!updated) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  return NextResponse.json({ trade: updated });
}
