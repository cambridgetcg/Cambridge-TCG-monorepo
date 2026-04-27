// No-fault returns lib.
//
// Sits adjacent to the dispute system but with different semantics:
// disputes are fault claims (admin adjudicates); returns are the
// "I just want to send it back" path. Sellers opt in per listing via
// market_orders.accepts_returns; that flag is snapshotted onto the
// trade row at creation so listing edits can't retroactively change
// a trade's return eligibility.
//
// Money movement is admin-mediated: seller can accept, buyer can
// ship, seller can confirm receipt, but the refund is issued by
// admin to prevent the seller-keeps-card-and-money attack.
//
// All state-mutating functions return:
//   { ok: true, value } | { ok: false, reason, status }
// Same discriminated-union shape as offers.ts and the rest of the
// codebase. Notification dedup keys: <returnId>:<status>.

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { formatPrice } from "@/lib/format";
import type { ReturnStatus } from "./return-timeline";
import { logReturnTransition } from "./return-lifecycle-log";

export interface MarketReturn {
  id: string;
  trade_id: string;
  buyer_id: string;
  seller_id: string;
  reason: string;
  message: string | null;
  decline_reason: string | null;
  status: ReturnStatus;
  refund_amount: string | null;
  return_tracking_carrier: string | null;
  return_tracking_number: string | null;
  created_at: string;
  responded_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  refunded_at: string | null;
  resolved_at: string | null;
  expires_at: string;
  refunded_by_admin: string | null;
  // Joined for list pages
  card_name?: string | null;
  sku?: string;
  trade_price?: string;
  trade_quantity?: number;
  buyer_username?: string | null;
  buyer_name?: string | null;
  seller_username?: string | null;
  seller_name?: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Reasons the buyer can pick. Loose taxonomy — returns are no-fault,
// so the categories are about why they're returning, not who's at
// fault. Used by the UI's chip selector.
export const RETURN_REASONS = [
  { value: "changed_mind", label: "Changed my mind" },
  { value: "minor_condition", label: "Condition not as good as expected (no dispute)" },
  { value: "wrong_card", label: "Wrong card — happy to return" },
  { value: "no_longer_needed", label: "No longer need it" },
  { value: "other", label: "Other (explain)" },
] as const;

const REASON_VALUES = new Set(RETURN_REASONS.map((r) => r.value));

// ── Internal: load a return with joined trade metadata ──
async function loadReturn(returnId: string): Promise<MarketReturn | null> {
  const r = await query(
    `SELECT r.*, t.price AS trade_price, t.quantity AS trade_quantity, t.sku,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_returns r
       JOIN market_trades t ON t.id = r.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE r.id = $1`,
    [returnId],
  );
  return (r.rows[0] as MarketReturn) ?? null;
}

// ── Buyer: open a return request ──
//
// Validates: trade exists, buyer is the trade's buyer, trade is
// 'completed', accepts_returns=true on the trade snapshot, return
// window hasn't elapsed, no other active return on this trade.
export async function requestReturn(input: {
  buyerId: string;
  tradeId: string;
  reason: string;
  message?: string;
}): Promise<Result<MarketReturn>> {
  if (!REASON_VALUES.has(input.reason as typeof RETURN_REASONS[number]["value"])) {
    return { ok: false, reason: "Invalid return reason.", status: 400 };
  }
  if (input.reason === "other" && (!input.message || input.message.trim().length < 10)) {
    return { ok: false, reason: "Please describe the reason (10+ chars).", status: 400 };
  }

  const tradeRows = await query(
    `SELECT id, buyer_id, seller_id, escrow_status, completed_at,
            accepts_returns, return_window_days, sku
       FROM market_trades WHERE id = $1`,
    [input.tradeId],
  );
  if (tradeRows.rows.length === 0) {
    return { ok: false, reason: "Trade not found.", status: 404 };
  }
  const trade = tradeRows.rows[0];

  if (trade.buyer_id !== input.buyerId) {
    return { ok: false, reason: "Only the buyer can request a return.", status: 403 };
  }
  if (trade.escrow_status !== "completed") {
    return {
      ok: false,
      reason: `Returns are only available on completed trades (this is ${trade.escrow_status}).`,
      status: 409,
    };
  }
  if (!trade.accepts_returns) {
    return {
      ok: false,
      reason: "This seller doesn't accept returns on this listing.",
      status: 403,
    };
  }
  if (!trade.completed_at) {
    return { ok: false, reason: "Trade has no completion timestamp.", status: 409 };
  }
  // Window expiry
  const completedAt = new Date(trade.completed_at).getTime();
  const windowMs = trade.return_window_days * 24 * 60 * 60 * 1000;
  if (Date.now() > completedAt + windowMs) {
    return {
      ok: false,
      reason: `The ${trade.return_window_days}-day return window has elapsed.`,
      status: 409,
    };
  }

  // One active return per trade
  const existing = await query(
    `SELECT id FROM market_returns
      WHERE trade_id = $1
        AND status NOT IN ('declined', 'cancelled', 'expired', 'refunded')`,
    [input.tradeId],
  );
  if (existing.rows.length > 0) {
    return {
      ok: false,
      reason: "An active return already exists on this trade.",
      status: 409,
    };
  }

  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS).toISOString();
  const inserted = await query(
    `INSERT INTO market_returns
       (trade_id, buyer_id, seller_id, reason, message, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.tradeId, input.buyerId, trade.seller_id,
     input.reason, input.message?.trim() || null, expiresAt],
  );
  const ret = inserted.rows[0] as MarketReturn;

  // Notify the seller. Card name resolved through loadReturn so the
  // notification body matches what the seller will see in their list.
  const full = await loadReturn(ret.id);
  await notify({
    userId: trade.seller_id,
    kind: "return.requested",
    title: `Return requested on ${full?.card_name || trade.sku}`,
    body: input.message
      ? input.message.slice(0, 160)
      : `Buyer reason: ${RETURN_REASONS.find((r) => r.value === input.reason)?.label || input.reason}. You have 7 days to respond.`,
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${ret.id}:requested`,
  });

  void logReturnTransition({
    returnId: ret.id,
    action: "requested",
    actorId: input.buyerId,
    actorLabel: "buyer",
    reason: input.reason,
    metadata: { trade_id: input.tradeId, message: input.message?.slice(0, 200) ?? null },
  });

  // Return-abuse detector — serial returners. ≥4 returns in 30d is
  // the threshold; same flag-only severity as cancel-abuse.
  void detectReturnAbuse(input.buyerId).catch((err) =>
    console.error("[returns] abuse detection failed:", err),
  );

  return { ok: true, value: full! };
}

// ── Seller: accept or decline ──

export async function acceptReturn(returnId: string, sellerId: string): Promise<Result<MarketReturn>> {
  const ret = await loadReturn(returnId);
  if (!ret) return { ok: false, reason: "Return not found.", status: 404 };
  if (ret.seller_id !== sellerId) {
    return { ok: false, reason: "Not your return to accept.", status: 403 };
  }
  if (ret.status !== "requested") {
    return { ok: false, reason: `Return is ${ret.status} — can't accept.`, status: 409 };
  }

  // Default refund_amount = full trade total. Admin can adjust later.
  const refundAmount = (parseFloat(ret.trade_price ?? "0") * (ret.trade_quantity ?? 1)).toFixed(2);

  await query(
    `UPDATE market_returns
        SET status='accepted', responded_at=NOW(),
            refund_amount=$2, updated_at=NOW()
      WHERE id=$1`,
    [returnId, refundAmount],
  );

  await notify({
    userId: ret.buyer_id,
    kind: "return.accepted",
    title: `Return accepted on ${ret.card_name || ret.sku}`,
    body: `Refund of ${formatPrice(parseFloat(refundAmount))} will be issued once the seller confirms receipt. Ship the card back and add tracking on /account/returns.`,
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${returnId}:accepted`,
  });

  void logReturnTransition({
    returnId,
    action: "accepted",
    actorId: sellerId,
    actorLabel: "seller",
    reason: `Accepted with refund_amount=${refundAmount}`,
    metadata: { refund_amount: refundAmount },
  });

  return { ok: true, value: (await loadReturn(returnId))! };
}

export async function declineReturn(
  returnId: string, sellerId: string, declineReasonText?: string,
): Promise<Result<MarketReturn>> {
  const ret = await loadReturn(returnId);
  if (!ret) return { ok: false, reason: "Return not found.", status: 404 };
  if (ret.seller_id !== sellerId) {
    return { ok: false, reason: "Not your return to decline.", status: 403 };
  }
  if (ret.status !== "requested") {
    return { ok: false, reason: `Return is ${ret.status} — can't decline.`, status: 409 };
  }

  await query(
    `UPDATE market_returns
        SET status='declined', responded_at=NOW(), resolved_at=NOW(),
            decline_reason=$2, updated_at=NOW()
      WHERE id=$1`,
    [returnId, declineReasonText?.trim() || null],
  );

  await notify({
    userId: ret.buyer_id,
    kind: "return.declined",
    title: `Return declined on ${ret.card_name || ret.sku}`,
    body: declineReasonText?.slice(0, 200)
      ?? "The seller declined your return request. You can open a dispute if you believe there's a fault.",
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${returnId}:declined`,
  });

  void logReturnTransition({
    returnId,
    action: "declined",
    actorId: sellerId,
    actorLabel: "seller",
    reason: declineReasonText?.slice(0, 500) || "Seller declined",
  });

  return { ok: true, value: (await loadReturn(returnId))! };
}

// ── Buyer: ship the card back, add tracking ──

export async function markShipped(input: {
  returnId: string;
  buyerId: string;
  carrier: string;
  trackingNumber: string;
}): Promise<Result<MarketReturn>> {
  const ret = await loadReturn(input.returnId);
  if (!ret) return { ok: false, reason: "Return not found.", status: 404 };
  if (ret.buyer_id !== input.buyerId) {
    return { ok: false, reason: "Not your return to ship.", status: 403 };
  }
  if (ret.status !== "accepted") {
    return { ok: false, reason: `Return is ${ret.status} — can't add tracking.`, status: 409 };
  }
  if (!input.trackingNumber.trim() || !input.carrier.trim()) {
    return { ok: false, reason: "Carrier and tracking number required.", status: 400 };
  }

  await query(
    `UPDATE market_returns
        SET status='shipping', shipped_at=NOW(),
            return_tracking_carrier=$2, return_tracking_number=$3,
            updated_at=NOW()
      WHERE id=$1`,
    [input.returnId, input.carrier.trim(), input.trackingNumber.trim()],
  );

  await notify({
    userId: ret.seller_id,
    kind: "return.shipping",
    title: `Buyer shipped return for ${ret.card_name || ret.sku}`,
    body: `Tracking: ${input.carrier} ${input.trackingNumber}. Confirm receipt when the card arrives.`,
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${input.returnId}:shipping`,
  });

  void logReturnTransition({
    returnId: input.returnId,
    action: "shipped_back",
    actorId: input.buyerId,
    actorLabel: "buyer",
    reason: `Shipped via ${input.carrier}`,
    metadata: { carrier: input.carrier.trim(), tracking: input.trackingNumber.trim() },
  });

  return { ok: true, value: (await loadReturn(input.returnId))! };
}

// ── Seller: confirm receipt (next stop is admin refund) ──

export async function markReceived(returnId: string, sellerId: string): Promise<Result<MarketReturn>> {
  const ret = await loadReturn(returnId);
  if (!ret) return { ok: false, reason: "Return not found.", status: 404 };
  if (ret.seller_id !== sellerId) {
    return { ok: false, reason: "Not your return to receive.", status: 403 };
  }
  if (ret.status !== "shipping") {
    return { ok: false, reason: `Return is ${ret.status} — can't mark received.`, status: 409 };
  }

  await query(
    `UPDATE market_returns
        SET status='received', received_at=NOW(), updated_at=NOW()
      WHERE id=$1`,
    [returnId],
  );

  // Notify buyer that the card arrived. Admin will issue refund next;
  // buyer doesn't act here, but they should know the chain advanced.
  await notify({
    userId: ret.buyer_id,
    kind: "return.received",
    title: `Seller confirmed receipt on ${ret.card_name || ret.sku}`,
    body: "Cambridge TCG will issue your refund shortly.",
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${returnId}:received`,
  });

  void logReturnTransition({
    returnId,
    action: "received",
    actorId: sellerId,
    actorLabel: "seller",
    reason: "Seller confirmed receipt of returned card",
  });

  return { ok: true, value: (await loadReturn(returnId))! };
}

// ── Admin: issue refund (terminal) ──

export async function refundReturn(input: {
  returnId: string;
  adminLabel: string;
  amount?: number;
  note?: string;
}): Promise<Result<MarketReturn>> {
  const ret = await loadReturn(input.returnId);
  if (!ret) return { ok: false, reason: "Return not found.", status: 404 };
  if (ret.status !== "received") {
    return {
      ok: false,
      reason: `Return must be in 'received' before refund (currently ${ret.status}).`,
      status: 409,
    };
  }

  const amount = input.amount ?? parseFloat(ret.refund_amount ?? "0");
  if (!(amount > 0)) {
    return { ok: false, reason: "Refund amount must be positive.", status: 400 };
  }

  await query(
    `UPDATE market_returns
        SET status='refunded', refunded_at=NOW(), resolved_at=NOW(),
            refund_amount=$2, refunded_by_admin=$3, updated_at=NOW()
      WHERE id=$1`,
    [input.returnId, amount.toFixed(2), input.adminLabel],
  );

  // Audit trail via the existing governance log helper. Mirrors how
  // dispute resolutions write to admin_actions_log.
  try {
    const { logAdminAction } = await import("@/lib/admin/governance-log");
    await logAdminAction({
      actorLabel: input.adminLabel,
      targetUserId: ret.buyer_id,
      targetKind: "market_return",
      targetId: input.returnId,
      action: "return_refunded",
      afterValue: { amount, note: input.note },
      reason: input.note ?? null,
    });
  } catch (err) {
    console.error("[returns] governance log failed:", err);
  }

  await notify({
    userId: ret.buyer_id,
    kind: "return.refunded",
    title: `Refund issued: ${formatPrice(amount)} for ${ret.card_name || ret.sku}`,
    body: input.note?.slice(0, 160)
      ?? "Funds will appear on your original payment method within a few business days.",
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${input.returnId}:refunded`,
  });

  void logReturnTransition({
    returnId: input.returnId,
    action: "refunded",
    actorLabel: input.adminLabel,
    reason: input.note?.slice(0, 500) ?? `Refunded ${formatPrice(amount)}`,
    metadata: { amount: amount.toFixed(2) },
  });

  // Trust recompute on both parties — refunds reflect on the seller
  // (failed sale) and lift the buyer's reliability if they cooperated.
  void import("@/lib/escrow/trust-engine").then(async ({ calculateTrustScore }) => {
    await calculateTrustScore(ret.buyer_id).catch(() => { /* ignore */ });
    await calculateTrustScore(ret.seller_id).catch(() => { /* ignore */ });
  });

  return { ok: true, value: (await loadReturn(input.returnId))! };
}

// ── Buyer: cancel before refund ──

export async function cancelReturn(returnId: string, buyerId: string): Promise<Result<MarketReturn>> {
  const ret = await loadReturn(returnId);
  if (!ret) return { ok: false, reason: "Return not found.", status: 404 };
  if (ret.buyer_id !== buyerId) {
    return { ok: false, reason: "Not your return to cancel.", status: 403 };
  }
  // Refunded is terminal — too late to cancel.
  if (ret.status === "refunded" || ret.status === "declined"
      || ret.status === "cancelled" || ret.status === "expired") {
    return { ok: false, reason: `Return is ${ret.status} — can't cancel.`, status: 409 };
  }

  await query(
    `UPDATE market_returns
        SET status='cancelled', resolved_at=NOW(), updated_at=NOW()
      WHERE id=$1`,
    [returnId],
  );

  // Notify seller — they may have been waiting on this in their inbox.
  await notify({
    userId: ret.seller_id,
    kind: "return.cancelled",
    title: `Return cancelled on ${ret.card_name || ret.sku}`,
    body: "Buyer rescinded the return request.",
    linkUrl: "/account/returns",
    referenceType: "market_return",
    referenceId: `${returnId}:cancelled`,
  });

  void logReturnTransition({
    returnId,
    action: "cancelled",
    actorId: buyerId,
    actorLabel: "buyer",
    reason: "Buyer rescinded the return request",
  });

  return { ok: true, value: (await loadReturn(returnId))! };
}

// ── Sweep: expire 'requested' rows past TTL ──

export async function expireReturnRequests(): Promise<{ expired: number }> {
  const r = await query(
    `UPDATE market_returns
        SET status='expired', resolved_at=NOW(), updated_at=NOW()
      WHERE status='requested' AND expires_at < NOW()
      RETURNING id, buyer_id, trade_id`,
  );
  for (const row of r.rows) {
    const tradeInfo = await query(
      `SELECT COALESCE(o.card_name, t.sku) AS card_name
         FROM market_trades t
         LEFT JOIN market_orders o ON o.id = t.bid_order_id
        WHERE t.id = $1`,
      [row.trade_id],
    );
    const label = tradeInfo.rows[0]?.card_name || "card";
    await notify({
      userId: row.buyer_id,
      kind: "return.expired",
      title: `Return request expired on ${label}`,
      body: "The seller didn't respond within 7 days. You can open a dispute if you believe there's a fault.",
      linkUrl: "/account/returns",
      referenceType: "market_return",
      referenceId: `${row.id}:expired`,
    });
    void logReturnTransition({
      returnId: row.id,
      action: "expired",
      actorLabel: "system:return-sweep",
      reason: "TTL elapsed without seller response",
    });
  }
  return { expired: r.rows.length };
}

// Return-abuse detector. Pattern: ≥4 returns requested in 30d from
// the same buyer. Lands a flag for admin review; same severity tier
// as cancel-abuse and lowball-abuse.
async function detectReturnAbuse(buyerId: string): Promise<void> {
  const r = await query(
    `SELECT COUNT(*)::int AS cnt
       FROM market_returns
      WHERE buyer_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'`,
    [buyerId],
  );
  const cnt = r.rows[0]?.cnt ?? 0;
  if (cnt < 4) return;

  const today = new Date().toISOString().slice(0, 10);
  const { emitSignal, SIGNAL_DEFS } = await import("@/lib/fraud/detection");
  await emitSignal({
    userId: buyerId,
    def: SIGNAL_DEFS.RETURN_ABUSE,
    description: `${cnt} return requests in the last 30 days`,
    dedupeKey: `return-abuse:${buyerId}:${today}`,
  });
}

// ── List queries for /account/returns ──

export async function listReturnsForBuyer(
  buyerId: string, options: { activeOnly?: boolean } = {},
): Promise<MarketReturn[]> {
  const where = options.activeOnly
    ? `AND r.status IN ('requested','accepted','shipping','received')`
    : "";
  const result = await query(
    `SELECT r.*, t.price AS trade_price, t.quantity AS trade_quantity, t.sku,
            COALESCE(o.card_name, t.sku) AS card_name,
            su.username AS seller_username, su.name AS seller_name
       FROM market_returns r
       JOIN market_trades t ON t.id = r.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
       LEFT JOIN users su ON su.id = r.seller_id
      WHERE r.buyer_id = $1 ${where}
      ORDER BY r.created_at DESC LIMIT 100`,
    [buyerId],
  );
  return result.rows as MarketReturn[];
}

export async function listReturnsForSeller(
  sellerId: string, options: { activeOnly?: boolean } = {},
): Promise<MarketReturn[]> {
  const where = options.activeOnly
    ? `AND r.status IN ('requested','accepted','shipping','received')`
    : "";
  const result = await query(
    `SELECT r.*, t.price AS trade_price, t.quantity AS trade_quantity, t.sku,
            COALESCE(o.card_name, t.sku) AS card_name,
            bu.username AS buyer_username, bu.name AS buyer_name
       FROM market_returns r
       JOIN market_trades t ON t.id = r.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
       LEFT JOIN users bu ON bu.id = r.buyer_id
      WHERE r.seller_id = $1 ${where}
      ORDER BY r.created_at DESC LIMIT 100`,
    [sellerId],
  );
  return result.rows as MarketReturn[];
}

// "Is this trade currently returnable?" — surfaces an entry button on
// /account/trades. Returns null if no return is allowed; otherwise a
// reason summary the UI can show as a tooltip.
export async function getReturnEligibility(
  tradeId: string, userId: string,
): Promise<{ eligible: boolean; reason?: string; existingReturnId?: string }> {
  const t = await query(
    `SELECT buyer_id, escrow_status, completed_at, accepts_returns, return_window_days
       FROM market_trades WHERE id = $1`, [tradeId]);
  if (t.rows.length === 0) return { eligible: false, reason: "Trade not found." };
  const trade = t.rows[0];
  if (trade.buyer_id !== userId) return { eligible: false, reason: "Not your trade." };
  if (trade.escrow_status !== "completed") return { eligible: false, reason: "Trade not completed." };
  if (!trade.accepts_returns) return { eligible: false, reason: "Seller doesn't accept returns on this listing." };
  if (!trade.completed_at) return { eligible: false, reason: "No completion timestamp." };
  const elapsed = Date.now() - new Date(trade.completed_at).getTime();
  if (elapsed > trade.return_window_days * 24 * 60 * 60 * 1000) {
    return { eligible: false, reason: `${trade.return_window_days}-day return window elapsed.` };
  }
  // Existing active return short-circuits (UI links to the existing).
  const existing = await query(
    `SELECT id FROM market_returns
      WHERE trade_id = $1
        AND status NOT IN ('declined','cancelled','expired','refunded') LIMIT 1`,
    [tradeId]);
  if (existing.rows.length > 0) {
    return { eligible: false, reason: "Active return already open.", existingReturnId: existing.rows[0].id };
  }
  return { eligible: true };
}

export async function getReturn(returnId: string): Promise<MarketReturn | null> {
  return loadReturn(returnId);
}
