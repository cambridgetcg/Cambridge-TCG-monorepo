// Pre-payment trade cancellation handshake.
//
// Sits between the matched-trade state (escrow_status='awaiting_payment'
// or sometimes 'paid' but not yet shipped) and the dispute system.
// Disputes are fault claims; this is "let's both agree to back out
// before the timer fires."
//
// Approval is the load-bearing op: it cancels the trade AND restores
// filled_quantity on both order rows AND notifies the requester, all
// in one transaction (same restoration shape as sweepExpired's
// payment-timeout path in @/lib/market/db).
//
// Discriminated-union returns mirror offers/returns/saved-searches/
// messages: { ok: true, value } | { ok: false, reason, status }.

import { query, transaction } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { formatPrice } from "@/lib/format";
import { CANCEL_REASONS, type CancelStatus, type CancelReason } from "./cancel-timeline";

export interface TradeCancellation {
  id: string;
  trade_id: string;
  requester_id: string;
  requester_role: "buyer" | "seller";
  reason: string;
  message: string | null;
  decline_reason: string | null;
  status: CancelStatus;
  created_at: string;
  resolved_at: string | null;
  expires_at: string;
  // Joined for list pages
  card_name?: string | null;
  sku?: string;
  trade_price?: string;
  trade_quantity?: number;
  buyer_id?: string;
  seller_id?: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

const REASON_VALUES = new Set(CANCEL_REASONS.map((r) => r.value));

// Trade states where a cancellation handshake is meaningful. Outside
// these, the trade's already moved beyond a clean rollback (shipped,
// completed, disputed, refunded, etc).
const CANCELLABLE_STATES = new Set([
  "awaiting_payment",
  "paid",                // edge case — buyer paid, seller hasn't shipped
  "awaiting_shipment",
]);

// ── Internal: load with joined trade metadata ──
async function loadCancel(cancelId: string): Promise<TradeCancellation | null> {
  const r = await query(
    `SELECT c.*, t.price AS trade_price, t.quantity AS trade_quantity,
            t.buyer_id, t.seller_id, t.sku,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_trade_cancellations c
       JOIN market_trades t ON t.id = c.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE c.id = $1`,
    [cancelId],
  );
  return (r.rows[0] as TradeCancellation) ?? null;
}

// ── Request a cancellation ──
//
// Requester must be a party to the trade. Trade must be in a
// cancellable state. UNIQUE partial idx prevents concurrent double-
// requests from creating two pending rows.

export async function requestCancel(input: {
  tradeId: string;
  requesterId: string;
  reason: string;
  message?: string;
}): Promise<Result<TradeCancellation>> {
  if (!REASON_VALUES.has(input.reason as CancelReason)) {
    return { ok: false, reason: "Invalid cancel reason.", status: 400 };
  }
  if (input.reason === "other" && (!input.message || input.message.trim().length < 10)) {
    return { ok: false, reason: "Please describe (10+ chars) when reason is 'other'.", status: 400 };
  }

  const t = await query(
    `SELECT id, buyer_id, seller_id, escrow_status, sku
       FROM market_trades WHERE id = $1`,
    [input.tradeId],
  );
  if (t.rows.length === 0) {
    return { ok: false, reason: "Trade not found.", status: 404 };
  }
  const trade = t.rows[0];

  let role: "buyer" | "seller";
  if (trade.buyer_id === input.requesterId) role = "buyer";
  else if (trade.seller_id === input.requesterId) role = "seller";
  else return { ok: false, reason: "You are not a party to this trade.", status: 403 };

  if (!CANCELLABLE_STATES.has(trade.escrow_status)) {
    return {
      ok: false,
      reason: `Trade is ${trade.escrow_status} — too late to cancel via handshake. Open a dispute instead.`,
      status: 409,
    };
  }

  // INSERT — UNIQUE partial idx (one_pending) gates double-creation.
  // 23P01-style violations surface here as 23505 from PG.
  let row: TradeCancellation;
  try {
    const r = await query(
      `INSERT INTO market_trade_cancellations
         (trade_id, requester_id, requester_role, reason, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.tradeId, input.requesterId, role,
       input.reason, input.message?.trim() || null],
    );
    row = r.rows[0] as TradeCancellation;
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return {
        ok: false,
        reason: "A cancel request is already pending on this trade.",
        status: 409,
      };
    }
    throw err;
  }

  // Notify the OTHER party. Card name resolved through loadCancel
  // for body consistency.
  const full = await loadCancel(row.id);
  const otherUserId = role === "buyer" ? trade.seller_id : trade.buyer_id;
  const reasonLabel = CANCEL_REASONS.find((r) => r.value === input.reason)?.label || input.reason;
  await notify({
    userId: otherUserId,
    kind: "trade_cancel.requested",
    title: `${role === "buyer" ? "Buyer" : "Seller"} requested to cancel ${full?.card_name || trade.sku}`,
    body: input.message
      ? input.message.slice(0, 160)
      : `Reason: ${reasonLabel}. Decide within 12h or the request expires (trade continues).`,
    linkUrl: "/account/trades",
    referenceType: "trade_cancel",
    referenceId: `${row.id}:requested`,
  });

  return { ok: true, value: full! };
}

// ── Approve (other side) ──
//
// Load-bearing op. In one transaction:
//   1. Update cancel row → status='approved', resolved_at=NOW()
//   2. Update market_trades → escrow_status='cancelled'
//   3. Restore filled_quantity on bid AND ask orders by trade.qty
//      (and re-open them if they're now under-filled)
//
// Mirrors sweepExpired's payment-timeout restoration exactly.

export async function approveCancel(
  cancelId: string, approverId: string,
): Promise<Result<TradeCancellation>> {
  const c = await loadCancel(cancelId);
  if (!c) return { ok: false, reason: "Cancel request not found.", status: 404 };
  if (c.status !== "requested") {
    return { ok: false, reason: `Request is ${c.status} — can't approve.`, status: 409 };
  }
  if (c.requester_id === approverId) {
    return {
      ok: false,
      reason: "You can't approve your own cancellation request — the other party must approve.",
      status: 403,
    };
  }
  // Approver must be the OTHER party (not the requester, not a stranger).
  const otherId = c.requester_role === "buyer" ? c.seller_id : c.buyer_id;
  if (otherId !== approverId) {
    return { ok: false, reason: "Not your request to approve.", status: 403 };
  }

  // Restoration tx
  const txResult = await transaction(async (q) => {
    // Mark cancel approved
    await q(
      `UPDATE market_trade_cancellations
          SET status='approved', resolved_at=NOW(), updated_at=NOW()
        WHERE id = $1 AND status = 'requested'`,
      [cancelId],
    );

    // Cancel the trade. Only flip if still in a cancellable state —
    // race-safe.
    const tradeUpdate = await q(
      `UPDATE market_trades
          SET escrow_status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND escrow_status::text = ANY($2::text[])
        RETURNING bid_order_id, ask_order_id, quantity`,
      [c.trade_id, Array.from(CANCELLABLE_STATES)],
    );
    if (tradeUpdate.rows.length === 0) {
      // Trade moved on between load and approve; back out the cancel mark.
      // Returning a sentinel triggers rollback (transaction will be rolled
      // back by throwing, so we throw a known error).
      throw new Error("__TRADE_MOVED_PAST_CANCELLATION__");
    }
    const { bid_order_id, ask_order_id, quantity } = tradeUpdate.rows[0];

    // Restore both orders. Same logic as sweepExpired's payment-timeout
    // path — bid and ask both regain filled_quantity, and the status
    // flips back to 'open' or 'partially_filled' as appropriate.
    for (const orderId of [bid_order_id, ask_order_id]) {
      await q(
        `UPDATE market_orders
            SET filled_quantity = GREATEST(filled_quantity - $1, 0),
                status = CASE
                  WHEN GREATEST(filled_quantity - $1, 0) = 0 THEN 'open'
                  WHEN GREATEST(filled_quantity - $1, 0) < quantity THEN 'partially_filled'
                  ELSE status
                END,
                updated_at = NOW()
          WHERE id = $2 AND status IN ('filled', 'partially_filled')`,
        [quantity, orderId],
      );
    }

    return { committed: true };
  }).catch((err) => {
    if (err instanceof Error && err.message === "__TRADE_MOVED_PAST_CANCELLATION__") {
      return { committed: false as const };
    }
    throw err;
  });

  if (!txResult.committed) {
    return {
      ok: false,
      reason: "Trade has already moved past cancellation. Open a dispute instead.",
      status: 409,
    };
  }

  // Notify the requester. Money owed back wasn't paid yet (we're
  // pre-payment) so no refund copy.
  await notify({
    userId: c.requester_id,
    kind: "trade_cancel.approved",
    title: `Cancellation approved on ${c.card_name || c.sku}`,
    body: "The other party agreed. Trade is cancelled and the listing is back on the book.",
    linkUrl: "/account/trades",
    referenceType: "trade_cancel",
    referenceId: `${cancelId}:approved`,
  });

  // Lifecycle row for the trade itself (the cancellation row is its
  // own audit chain in market_trade_cancellations). Trust recompute
  // for both parties — the trust engine reads cancel history.
  void import("./lifecycle-log").then(({ logTradeTransition }) =>
    logTradeTransition({
      tradeId: c.trade_id,
      action: "cancelled",
      actorId: approverId,
      actorLabel: c.requester_role === "buyer" ? "buyer:cancel-handshake" : "seller:cancel-handshake",
      reason: c.reason,
      metadata: { cancel_id: cancelId, requester_id: c.requester_id, requester_role: c.requester_role },
    }),
  );
  if (c.buyer_id) {
    void import("@/lib/escrow/trust-engine").then(({ calculateTrustScore }) =>
      calculateTrustScore(c.buyer_id!).catch(() => { /* ignore */ }),
    );
  }
  if (c.seller_id) {
    void import("@/lib/escrow/trust-engine").then(({ calculateTrustScore }) =>
      calculateTrustScore(c.seller_id!).catch(() => { /* ignore */ }),
    );
  }

  // Cancel-abuse detector — same pattern as auctions. Fires only on
  // the requester (the one who initiated the back-out). Threshold
  // ≥3 self-requested cancels in 14 days lands a flag.
  void detectTradeCancelAbuse(c.requester_id).catch((err) =>
    console.error("[trade-cancel] abuse detection failed:", err),
  );

  return { ok: true, value: (await loadCancel(cancelId))! };
}

async function detectTradeCancelAbuse(requesterId: string): Promise<void> {
  const r = await query(
    `SELECT COUNT(*)::int AS cnt
       FROM market_trade_cancellations
      WHERE requester_id = $1
        AND status = 'approved'
        AND resolved_at >= NOW() - INTERVAL '14 days'`,
    [requesterId],
  );
  const cnt = r.rows[0]?.cnt ?? 0;
  if (cnt < 3) return;

  const today = new Date().toISOString().slice(0, 10);
  const { emitSignal, SIGNAL_DEFS } = await import("@/lib/fraud/detection");
  await emitSignal({
    userId: requesterId,
    def: SIGNAL_DEFS.TRADE_CANCEL_ABUSE,
    description: `${cnt} approved cancellations initiated in the last 14 days`,
    dedupeKey: `trade-cancel-abuse:${requesterId}:${today}`,
  });
}

// ── Decline (other side) ──

export async function declineCancel(
  cancelId: string, approverId: string, reason?: string,
): Promise<Result<TradeCancellation>> {
  const c = await loadCancel(cancelId);
  if (!c) return { ok: false, reason: "Cancel request not found.", status: 404 };
  if (c.status !== "requested") {
    return { ok: false, reason: `Request is ${c.status} — can't decline.`, status: 409 };
  }
  if (c.requester_id === approverId) {
    return { ok: false, reason: "You can't decline your own request.", status: 403 };
  }
  const otherId = c.requester_role === "buyer" ? c.seller_id : c.buyer_id;
  if (otherId !== approverId) {
    return { ok: false, reason: "Not your request to decline.", status: 403 };
  }

  await query(
    `UPDATE market_trade_cancellations
        SET status='declined', resolved_at=NOW(),
            decline_reason=$2, updated_at=NOW()
      WHERE id=$1 AND status='requested'`,
    [cancelId, reason?.trim() || null],
  );

  await notify({
    userId: c.requester_id,
    kind: "trade_cancel.declined",
    title: `Cancellation declined on ${c.card_name || c.sku}`,
    body: reason?.slice(0, 200)
      ?? "The other party didn't agree. The trade continues — pay or ship as scheduled.",
    linkUrl: "/account/trades",
    referenceType: "trade_cancel",
    referenceId: `${cancelId}:declined`,
  });

  return { ok: true, value: (await loadCancel(cancelId))! };
}

// ── Withdraw (initiator) ──

export async function withdrawCancel(
  cancelId: string, requesterId: string,
): Promise<Result<TradeCancellation>> {
  const c = await loadCancel(cancelId);
  if (!c) return { ok: false, reason: "Cancel request not found.", status: 404 };
  if (c.requester_id !== requesterId) {
    return { ok: false, reason: "Not your request to withdraw.", status: 403 };
  }
  if (c.status !== "requested") {
    return { ok: false, reason: `Request is ${c.status} — can't withdraw.`, status: 409 };
  }

  await query(
    `UPDATE market_trade_cancellations
        SET status='withdrawn', resolved_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND status='requested'`,
    [cancelId],
  );

  // Notify the OTHER party — they had a decision in their inbox.
  const otherId = c.requester_role === "buyer" ? c.seller_id : c.buyer_id;
  await notify({
    userId: otherId!,
    kind: "trade_cancel.withdrawn",
    title: `Cancel request withdrawn on ${c.card_name || c.sku}`,
    body: "The requester rescinded — trade continues as scheduled.",
    linkUrl: "/account/trades",
    referenceType: "trade_cancel",
    referenceId: `${cancelId}:withdrawn`,
  });

  return { ok: true, value: (await loadCancel(cancelId))! };
}

// ── Sweep: expire stale 'requested' rows past TTL ──

export async function expireCancelRequests(): Promise<{ expired: number }> {
  const r = await query(
    `UPDATE market_trade_cancellations
        SET status='expired', resolved_at=NOW(), updated_at=NOW()
      WHERE status='requested' AND expires_at < NOW()
      RETURNING id, requester_id, trade_id`,
  );
  for (const row of r.rows) {
    const meta = await query(
      `SELECT COALESCE(o.card_name, t.sku) AS card_name
         FROM market_trades t
         LEFT JOIN market_orders o ON o.id = t.bid_order_id
        WHERE t.id = $1`,
      [row.trade_id],
    );
    const label = meta.rows[0]?.card_name || "trade";
    await notify({
      userId: row.requester_id,
      kind: "trade_cancel.expired",
      title: `Cancel request expired on ${label}`,
      body: "The other party didn't respond within 12h. Trade continues to its payment window.",
      linkUrl: "/account/trades",
      referenceType: "trade_cancel",
      referenceId: `${row.id}:expired`,
    });
  }
  return { expired: r.rows.length };
}

// ── List queries ──

export async function listCancelRequestsForUser(
  userId: string,
  options: { activeOnly?: boolean } = {},
): Promise<TradeCancellation[]> {
  const where = options.activeOnly ? `AND c.status = 'requested'` : "";
  const r = await query(
    `SELECT c.*, t.price AS trade_price, t.quantity AS trade_quantity,
            t.buyer_id, t.seller_id, t.sku,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_trade_cancellations c
       JOIN market_trades t ON t.id = c.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE (c.requester_id = $1 OR t.buyer_id = $1 OR t.seller_id = $1)
        ${where}
      ORDER BY c.created_at DESC LIMIT 50`,
    [userId],
  );
  return r.rows as TradeCancellation[];
}

// "Is there a pending cancel on this trade?" — drives the inline
// surface on /account/trades. Returns null if none.
export async function getPendingCancelForTrade(
  tradeId: string,
): Promise<TradeCancellation | null> {
  const r = await query(
    `SELECT c.*, t.price AS trade_price, t.quantity AS trade_quantity,
            t.buyer_id, t.seller_id, t.sku,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_trade_cancellations c
       JOIN market_trades t ON t.id = c.trade_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE c.trade_id = $1 AND c.status = 'requested'`,
    [tradeId],
  );
  return (r.rows[0] as TradeCancellation) ?? null;
}

export async function getCancel(cancelId: string): Promise<TradeCancellation | null> {
  return loadCancel(cancelId);
}

export const CANCELLABLE_TRADE_STATES = Array.from(CANCELLABLE_STATES);

// Add the formatPrice import to satisfy the implicit dependency
// (used in future bodies — kept here so the lib is self-contained).
void formatPrice;
