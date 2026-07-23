// Auction cancellation flow.
//
// Two paths:
//   - Seller self-cancel: only allowed in pending_review, scheduled, or live
//     with zero bids. Once any bid lands on a live auction, the seller can no
//     longer rip the listing — admin override only. (Protects active bidders.)
//   - Admin cancel: allowed at any pre-paid status with a reason.
//
// Side effects on success: lifecycle log row, governance log entry (admin
// path), trust recompute, and notification fan-out to active bidders.
//
// Out of scope: refunds — admin cancels of paid auctions must run the
// refund flow first (the gate below rejects paid auctions outright).

import { query } from "@/lib/db";
import { logAuctionTransition } from "./lifecycle-log";
import { logAdminAction } from "@/lib/admin/governance-log";
import { calculateTrustScore } from "@/lib/escrow/trust-engine";
import { notify } from "@/lib/notifications/db";

export interface CancelResult {
  ok: boolean;
  reason?: string;
  status?: number;
}

interface AuctionRow {
  id: string;
  title: string;
  seller_user_id: string | null;
  status: string;
  bid_count: number;
}

const CANCELLABLE_STATUSES = new Set(["draft", "pending_review", "scheduled", "live"]);

export async function cancelAuction(opts: {
  auctionId: string;
  /** Identity of the caller — null if invoked from a system context. */
  actorUserId: string | null;
  isAdmin: boolean;
  reason: string;
}): Promise<CancelResult> {
  const reason = (opts.reason ?? "").trim();
  if (!reason) return { ok: false, reason: "Cancellation reason required.", status: 400 };
  if (reason.length > 500) return { ok: false, reason: "Reason too long (max 500 chars).", status: 400 };

  const r = await query(
    `SELECT id, title, seller_user_id, status, bid_count
       FROM auctions WHERE id = $1`,
    [opts.auctionId],
  );
  const a = r.rows[0] as AuctionRow | undefined;
  if (!a) return { ok: false, reason: "Auction not found.", status: 404 };

  if (!CANCELLABLE_STATUSES.has(a.status)) {
    return {
      ok: false,
      reason: `Cannot cancel an auction in status ${a.status}.` +
        (a.status === "paid" || a.status === "ended" ? " Refund flow required first." : ""),
      status: 409,
    };
  }

  // Authorisation. Admin path is permissive; seller path is restricted.
  if (!opts.isAdmin) {
    if (!a.seller_user_id || a.seller_user_id !== opts.actorUserId) {
      return { ok: false, reason: "Only the seller or an admin can cancel.", status: 403 };
    }
    if (a.status === "live" && a.bid_count > 0) {
      return {
        ok: false,
        reason: "Live auctions with bids can only be cancelled by an admin.",
        status: 403,
      };
    }
  }

  // Atomic flip — guard with status IN (...) so two concurrent callers
  // can't both succeed and double-emit downstream.
  const flipped = await query(
    `UPDATE auctions
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status = ANY($2::text[])
      RETURNING id`,
    [a.id, Array.from(CANCELLABLE_STATUSES)],
  );
  if (flipped.rows.length === 0) {
    return { ok: false, reason: "Auction state changed — refresh and retry.", status: 409 };
  }

  const actorLabel = opts.isAdmin ? "admin:auction-cancel" : "seller:self";

  // Lifecycle row — single source of truth for the journey + admin views.
  void logAuctionTransition({
    auctionId: a.id,
    action: "cancelled",
    actorId: opts.actorUserId,
    actorLabel,
    reason,
    metadata: { bid_count_at_cancel: a.bid_count, by: opts.isAdmin ? "admin" : "seller" },
  });

  // Governance log — admin actions are reportable; seller self-cancels
  // ride only on the lifecycle log. Same split we used in chargebacks.
  if (opts.isAdmin) {
    void logAdminAction({
      actorLabel,
      targetUserId: a.seller_user_id,
      targetKind: "auction",
      targetId: a.id,
      action: "auction.cancelled",
      beforeValue: { status: a.status, bid_count: a.bid_count },
      afterValue: { status: "cancelled" },
      reason,
    });
  }

  // Notify any active bidders that the listing they were on died. The
  // unique constraint on (user_id, kind, reference_id) in the
  // notifications table dedupes naturally if this gets retried.
  if (a.bid_count > 0) {
    const bidders = await query(
      `SELECT DISTINCT user_id FROM auction_bids
        WHERE auction_id = $1 AND status = 'active' AND is_best_offer = false`,
      [a.id],
    );
    for (const row of bidders.rows) {
      void notify({
        userId: row.user_id,
        kind: "auction.cancelled",
        title: `Auction cancelled: ${a.title}`,
        body: `The seller cancelled this listing. Reason: ${reason.slice(0, 140)}`,
        linkUrl: `/auctions/${a.id}`,
        referenceType: "auction",
        referenceId: a.id,
      }).catch((err) => console.error("[auction/cancel] notify failed:", err));
    }
  }

  // Trust recompute on the seller. A cancellation by itself isn't a hit,
  // but the score function reads the cancel rate from lifecycle log
  // history — which includes the row we just wrote — so recompute now.
  if (a.seller_user_id) {
    void calculateTrustScore(a.seller_user_id).catch(() => { /* ignore */ });
  }

  return { ok: true };
}
