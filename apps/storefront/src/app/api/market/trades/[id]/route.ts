import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { updateEscrowStatus, listTradePhotos, reviewTradePhoto } from "@/lib/market/db";
import {
  computeAutoCompleteAt,
  defaultDisputeWindowHours,
  isBuyerConfirmableState,
} from "@/lib/market/completion";
import type { EscrowTier } from "@/lib/escrow/service-tiers";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// GET — allowlisted participant view of a single trade. Provider identifiers,
// payout references, admin notes, and unrelated operator fields never leave
// this route. Usernames + user ids support the trade-scoped message channel;
// shipping_address is shared only with the two participants so the seller can
// fulfil and the buyer can review the address they supplied.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const { id } = await params;
  const result = await query(
    `SELECT
       t.id, t.buyer_id, t.seller_id, t.sku, t.price, t.quantity,
       t.seller_payout, t.escrow_status::text AS escrow_status,
       t.seller_shipped_at, t.shipped_to_buyer_at,
       t.tracking_to_buyer, t.carrier,
       t.escrow_tier, t.requires_photos, t.seller_ships_to,
       t.dispute_window_hours, t.payout_hold_days,
       t.payment_expires_at, t.shipping_address,
       t.accepts_returns, t.return_window_days, t.created_at,
       bu.username AS buyer_username,
       su.username AS seller_username,
       o.card_name
     FROM market_trades t
     LEFT JOIN users bu ON t.buyer_id = bu.id
     LEFT JOIN users su ON t.seller_id = su.id
     LEFT JOIN market_orders o ON t.bid_order_id = o.id
     WHERE t.id = $1
       AND (t.buyer_id = $2 OR t.seller_id = $2)`,
    [id, session.user.id]
  );
  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: "Trade not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
  const trade = result.rows[0];
  if (trade.buyer_id !== session.user.id && trade.seller_id !== session.user.id) {
    return NextResponse.json(
      { error: "Trade not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  // Same role annotation as the list endpoint so clients share one contract.
  const current_user_role = trade.buyer_id === session.user.id ? ("buyer" as const) : ("seller" as const);

  // Auto-complete annotation for the buyer-bound leg: dispatch stamp +
  // the trade's own dispute window (tier default when the row predates
  // window stamping). Derived, not stored — the detail page shows it so
  // "waiting" has an honest end date, and the same formula drives the
  // sweep in lib/market/completion.ts.
  let auto_complete_at: string | null = null;
  if (isBuyerConfirmableState(trade.escrow_tier, trade.escrow_status)) {
    const windows = await defaultDisputeWindowHours();
    const fallback = windows[trade.escrow_tier as EscrowTier] ?? windows.full_escrow;
    auto_complete_at = computeAutoCompleteAt(
      trade.shipped_to_buyer_at ?? trade.seller_shipped_at,
      trade.dispute_window_hours,
      fallback,
    )?.toISOString() ?? null;
  }

  const participantTrade = {
    id: trade.id,
    buyer_id: trade.buyer_id,
    seller_id: trade.seller_id,
    sku: trade.sku,
    price: trade.price,
    quantity: trade.quantity,
    seller_payout: trade.seller_payout,
    escrow_status: trade.escrow_status,
    tracking_to_buyer: trade.tracking_to_buyer,
    carrier: trade.carrier,
    escrow_tier: trade.escrow_tier,
    requires_photos: trade.requires_photos,
    seller_ships_to: trade.seller_ships_to,
    dispute_window_hours: trade.dispute_window_hours,
    payout_hold_days: trade.payout_hold_days,
    payment_expires_at: trade.payment_expires_at,
    shipping_address: trade.shipping_address,
    accepts_returns: trade.accepts_returns,
    return_window_days: trade.return_window_days,
    created_at: trade.created_at,
    buyer_username: trade.buyer_username,
    seller_username: trade.seller_username,
    card_name: trade.card_name,
    current_user_role,
    auto_complete_at,
  };

  return NextResponse.json(
    { trade: participantTrade },
    { headers: PRIVATE_NO_STORE },
  );
}

// PATCH — admin: update escrow status, or bulk-review all unreviewed photos.
// Two action shapes supported:
//   { status: "...", trackingToCtcg?, trackingToBuyer?, adminNotes? } — escrow transition
//   { photoReview: "approve" | "reject" }                              — bulk photo decision
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  if (body.photoReview === "approve" || body.photoReview === "reject") {
    const approve = body.photoReview === "approve";
    const photos = await listTradePhotos(id);
    const unreviewed = photos.filter((p) => p.approved === null);
    if (unreviewed.length === 0) {
      return NextResponse.json({ error: "No unreviewed photos for this trade." }, { status: 400 });
    }
    const updated = await Promise.all(unreviewed.map((p) => reviewTradePhoto(p.id, approve)));
    return NextResponse.json({ reviewed: updated.filter(Boolean).length });
  }

  if (!body.status) {
    return NextResponse.json({ error: "Status or photoReview required." }, { status: 400 });
  }

  const trade = await updateEscrowStatus(id, body.status, {
    trackingToCtcg: body.trackingToCtcg,
    trackingToBuyer: body.trackingToBuyer,
    adminNotes: body.adminNotes,
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  return NextResponse.json({ trade });
}
