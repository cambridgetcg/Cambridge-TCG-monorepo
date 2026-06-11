import { query } from "@/lib/db";
import type {
  UserVerification,
  TradeDispute,
  DisputeMessage,
  DisputeEvidence,
  EscrowPayment,
  VerificationDocument,
} from "./types";

// ══════════════════════════════════════════════════════════════
// VERIFICATION
// ══════════════════════════════════════════════════════════════

export async function submitVerification(userId: string, data: {
  fullLegalName: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county?: string;
  postcode: string;
  phone?: string;
  bankSortCode?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
}): Promise<UserVerification> {
  // On resubmit after rejection, bump resubmitted_count so admin can
  // see how many passes this case has had. Fresh submission (no prior
  // row) starts at 0.
  const result = await query(
    `INSERT INTO user_verifications (user_id, full_legal_name, date_of_birth,
      address_line1, address_line2, city, county, postcode, country,
      phone, bank_sort_code, bank_account_number, bank_account_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'GB',$9,$10,$11,$12)
     ON CONFLICT (user_id) DO UPDATE SET
       full_legal_name=$2, date_of_birth=$3, address_line1=$4, address_line2=$5,
       city=$6, county=$7, postcode=$8, phone=$9, bank_sort_code=$10,
       bank_account_number=$11, bank_account_name=$12,
       status='pending',
       rejected_at=NULL, rejected_reason=NULL,
       resubmitted_count = CASE
         WHEN user_verifications.status = 'rejected'
           THEN user_verifications.resubmitted_count + 1
         ELSE user_verifications.resubmitted_count
       END,
       updated_at=NOW()
     RETURNING *`,
    [userId, data.fullLegalName, data.dateOfBirth, data.addressLine1,
     data.addressLine2 || null, data.city, data.county || null, data.postcode.toUpperCase().trim(),
     data.phone || null, data.bankSortCode || null,
     data.bankAccountNumber || null, data.bankAccountName || null]
  );
  return result.rows[0] as UserVerification;
}

export async function getVerification(userId: string): Promise<UserVerification | null> {
  const result = await query(`SELECT * FROM user_verifications WHERE user_id = $1`, [userId]);
  return result.rows[0] as UserVerification ?? null;
}

export async function isUserVerified(userId: string): Promise<boolean> {
  const result = await query(`SELECT is_verified FROM users WHERE id = $1`, [userId]);
  return result.rows[0]?.is_verified === true;
}

export async function approveVerification(userId: string, notes?: string): Promise<void> {
  await query(
    `UPDATE user_verifications SET status='verified', verified_at=NOW(), admin_notes=$2, updated_at=NOW() WHERE user_id=$1`,
    [userId, notes || null]
  );
  await query(`UPDATE users SET is_verified=true, country='GB' WHERE id=$1`, [userId]);
}

export async function rejectVerification(userId: string, reason: string): Promise<void> {
  await query(
    `UPDATE user_verifications
        SET status='rejected',
            rejected_reason=$2,
            rejected_at=NOW(),
            updated_at=NOW()
      WHERE user_id=$1`,
    [userId, reason]
  );
}

// ── Verification documents ──

export async function addVerificationDocument(
  userId: string,
  data: { docType: string; url: string; s3Key: string; mimeType?: string | null },
): Promise<VerificationDocument> {
  const r = await query(
    `INSERT INTO verification_documents (user_id, doc_type, url, s3_key, mime_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, data.docType, data.url, data.s3Key, data.mimeType ?? null],
  );
  return r.rows[0] as VerificationDocument;
}

export async function listVerificationDocuments(userId: string): Promise<VerificationDocument[]> {
  const r = await query(
    `SELECT * FROM verification_documents WHERE user_id = $1 ORDER BY uploaded_at DESC`,
    [userId],
  );
  return r.rows as VerificationDocument[];
}

export async function deleteVerificationDocument(docId: string, userId: string): Promise<boolean> {
  // Soft guard: only the owning user can delete their own doc.
  const r = await query(
    `DELETE FROM verification_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
    [docId, userId],
  );
  return r.rows.length > 0;
}

export async function listPendingVerifications(): Promise<(UserVerification & { email: string })[]> {
  const result = await query(
    `SELECT v.*, u.email FROM user_verifications v JOIN users u ON v.user_id=u.id
     WHERE v.status='pending' ORDER BY v.created_at ASC`
  );
  return result.rows as (UserVerification & { email: string })[];
}

export async function listAllVerifications(): Promise<(UserVerification & { email: string })[]> {
  const result = await query(
    `SELECT v.*, u.email FROM user_verifications v JOIN users u ON v.user_id=u.id
     ORDER BY v.created_at DESC`
  );
  return result.rows as (UserVerification & { email: string })[];
}

// ══════════════════════════════════════════════════════════════
// DISPUTES
// ══════════════════════════════════════════════════════════════

export async function raiseDispute(tradeId: string, userId: string, reason: string, description: string): Promise<TradeDispute> {
  // Persist the reason on the trade row (separate from escrow_status, which
  // is set by updateEscrowStatus below — that path also sends both parties
  // the "dispute opened" email via the market email module).
  await query(
    `UPDATE market_trades SET dispute_reason=$2, updated_at=NOW() WHERE id=$1`,
    [tradeId, reason]
  );

  const result = await query(
    `INSERT INTO trade_disputes (trade_id, raised_by, reason, description) VALUES ($1,$2,$3,$4) RETURNING *`,
    [tradeId, userId, reason, description]
  );

  // Cascade to the trade lifecycle (and trigger emails) via the market layer.
  // Imported lazily to avoid a static cross-module cycle if the market db
  // ever needs to call into trust.
  const { updateEscrowStatus } = await import("@/lib/market/db");
  await updateEscrowStatus(tradeId, "disputed", {
    adminNotes: `Dispute raised: ${reason}`,
  });

  return result.rows[0] as TradeDispute;
}

export async function getDispute(disputeId: string): Promise<TradeDispute | null> {
  const result = await query(
    `SELECT d.*, u.name as raiser_name, u.email as raiser_email,
       t.price as trade_price, bu.name as buyer_name, su.name as seller_name,
       o.card_name
     FROM trade_disputes d
     JOIN users u ON d.raised_by=u.id
     JOIN market_trades t ON d.trade_id=t.id
     JOIN users bu ON t.buyer_id=bu.id
     JOIN users su ON t.seller_id=su.id
     LEFT JOIN market_orders o ON t.bid_order_id=o.id
     WHERE d.id=$1`,
    [disputeId]
  );
  return result.rows[0] as TradeDispute ?? null;
}

export async function getDisputeByTrade(tradeId: string): Promise<TradeDispute | null> {
  const result = await query(
    `SELECT d.*, u.name as raiser_name, u.email as raiser_email
     FROM trade_disputes d JOIN users u ON d.raised_by=u.id
     WHERE d.trade_id=$1 ORDER BY d.created_at DESC LIMIT 1`,
    [tradeId]
  );
  return result.rows[0] as TradeDispute ?? null;
}

export async function listDisputes(status?: string): Promise<TradeDispute[]> {
  const params: unknown[] = [];
  let where = "";
  if (status) { params.push(status); where = `WHERE d.status=$1`; }

  const result = await query(
    `SELECT d.*, u.name as raiser_name, u.email as raiser_email,
       t.price as trade_price, bu.name as buyer_name, su.name as seller_name,
       o.card_name
     FROM trade_disputes d
     JOIN users u ON d.raised_by=u.id
     JOIN market_trades t ON d.trade_id=t.id
     JOIN users bu ON t.buyer_id=bu.id
     JOIN users su ON t.seller_id=su.id
     LEFT JOIN market_orders o ON t.bid_order_id=o.id
     ${where} ORDER BY d.created_at DESC`,
    params
  );
  return result.rows as TradeDispute[];
}

// User-facing list — disputes the caller is party to (either raised or
// the counterparty on the trade). Powers /account/disputes and
// /account/trades/[id]'s dispute panel.
export async function listMyDisputes(userId: string): Promise<TradeDispute[]> {
  const result = await query(
    `SELECT d.*, u.name as raiser_name, u.email as raiser_email,
       t.price as trade_price, bu.name as buyer_name, su.name as seller_name,
       o.card_name
     FROM trade_disputes d
     JOIN users u ON d.raised_by=u.id
     JOIN market_trades t ON d.trade_id=t.id
     JOIN users bu ON t.buyer_id=bu.id
     JOIN users su ON t.seller_id=su.id
     LEFT JOIN market_orders o ON t.bid_order_id=o.id
     WHERE t.buyer_id = $1 OR t.seller_id = $1
     ORDER BY d.created_at DESC`,
    [userId]
  );
  return result.rows as TradeDispute[];
}

// Single dispute by trade id for the parties involved. Used by the
// /account/trades/[id] page to embed its dispute panel.
export async function getDisputeByTradeForUser(
  tradeId: string,
  userId: string,
): Promise<TradeDispute | null> {
  const result = await query(
    `SELECT d.*, u.name as raiser_name, u.email as raiser_email,
       t.price as trade_price, bu.name as buyer_name, su.name as seller_name,
       o.card_name
     FROM trade_disputes d
     JOIN users u ON d.raised_by=u.id
     JOIN market_trades t ON d.trade_id=t.id
     JOIN users bu ON t.buyer_id=bu.id
     JOIN users su ON t.seller_id=su.id
     LEFT JOIN market_orders o ON t.bid_order_id=o.id
     WHERE d.trade_id = $1 AND (t.buyer_id = $2 OR t.seller_id = $2)
     ORDER BY d.created_at DESC LIMIT 1`,
    [tradeId, userId]
  );
  return (result.rows[0] as TradeDispute) ?? null;
}

// Whether a user is a party to a dispute's trade. Used as the auth
// gate on dispute detail + message routes so they only let parties
// (or admins) see/post. Returns true for both buyer and seller.
export async function userCanAccessDispute(disputeId: string, userId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM trade_disputes d
       JOIN market_trades t ON d.trade_id = t.id
      WHERE d.id = $1 AND (t.buyer_id = $2 OR t.seller_id = $2)
      LIMIT 1`,
    [disputeId, userId]
  );
  return result.rows.length > 0;
}

// Status change with COALESCE-stamped timestamps. Mirrors the pattern
// used by updateSubmissionStatus / updateQuoteStatus so the customer
// timeline renders consistent "first-reached" times.
const DISPUTE_TIMESTAMP_COL: Record<string, string> = {
  under_review:      "under_review_at",
  awaiting_evidence: "awaiting_evidence_at",
  escalated:         "escalated_at",
};

export async function setDisputeStatus(
  disputeId: string,
  status: string,
): Promise<TradeDispute | null> {
  const tsCol = DISPUTE_TIMESTAMP_COL[status];
  const setExtra = tsCol ? `, ${tsCol} = COALESCE(${tsCol}, NOW())` : "";
  const r = await query(
    `UPDATE trade_disputes SET status = $1, updated_at = NOW()${setExtra}
      WHERE id = $2 RETURNING *`,
    [status, disputeId]
  );
  return (r.rows[0] as TradeDispute) ?? null;
}

// Dispute raiser withdraws an unresolved dispute. Trade returns to
// whatever its escrow_status was before the dispute (the UI surfaces
// this as "trade continues" — the buyer chose to drop the issue).
// Safe no-op when the dispute is already resolved.
export async function withdrawDispute(disputeId: string, userId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const dispute = await query(
    `SELECT id, trade_id, raised_by, status FROM trade_disputes WHERE id = $1`,
    [disputeId]
  );
  if (dispute.rows.length === 0) return { ok: false, reason: "not found" };
  const d = dispute.rows[0];
  if (d.raised_by !== userId) return { ok: false, reason: "only the raiser can withdraw" };
  if (["resolved_buyer", "resolved_seller", "resolved_split", "closed"].includes(d.status)) {
    return { ok: false, reason: "already resolved" };
  }

  await query(
    `UPDATE trade_disputes SET status='closed', withdrawn_at=NOW(), updated_at=NOW()
      WHERE id=$1`,
    [disputeId]
  );

  // Flip the trade back to 'awaiting_shipment' — buyer withdrew, seller
  // continues the chain. updateEscrowStatus also clears dispute_reason
  // on the trade row so the UI stops showing the disputed badge.
  const { updateEscrowStatus } = await import("@/lib/market/db");
  await updateEscrowStatus(d.trade_id, "awaiting_shipment", {
    adminNotes: "Buyer withdrew the dispute.",
  });

  return { ok: true };
}

export async function resolveDispute(disputeId: string, data: {
  resolutionType: "refund_buyer" | "release_seller" | "split" | "return_card";
  resolutionNotes: string;
  refundAmount?: number;
}): Promise<TradeDispute> {
  const statusMap: Record<string, string> = {
    refund_buyer: "resolved_buyer",
    release_seller: "resolved_seller",
    split: "resolved_split",
    return_card: "resolved_buyer",
  };

  const result = await query(
    `UPDATE trade_disputes SET status=$2, resolution_type=$3, resolution_notes=$4,
     refund_amount=$5, resolved_at=NOW(), resolved_by_admin=true, updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [disputeId, statusMap[data.resolutionType], data.resolutionType,
     data.resolutionNotes, data.refundAmount?.toFixed(2) ?? null]
  );
  const dispute = result.rows[0] as TradeDispute;

  // Cascade onto the trade: refund_buyer / split → refunded, others → completed.
  // updateEscrowStatus also fires the resolution emails to both parties.
  const tradeStatus =
    data.resolutionType === "refund_buyer" || data.resolutionType === "split"
      ? "refunded"
      : "completed";
  const { updateEscrowStatus } = await import("@/lib/market/db");
  await updateEscrowStatus(dispute.trade_id, tradeStatus, {
    adminNotes: `Dispute resolved (${data.resolutionType}): ${data.resolutionNotes}`,
  });

  // Recompute trust for both parties now that the outcome is final.
  // Without this the score lies until something else triggers a refresh
  // (a profile view, a review submission). Fire-and-forget — score
  // recomputes are idempotent.
  try {
    const tradeRes = await query(
      `SELECT buyer_id, seller_id FROM market_trades WHERE id = $1`,
      [dispute.trade_id],
    );
    const trade = tradeRes.rows[0];
    if (trade) {
      const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
      void calculateTrustScore(trade.buyer_id).catch((err) => {
        console.error(`[dispute/resolve] buyer trust recompute failed:`, err);
      });
      void calculateTrustScore(trade.seller_id).catch((err) => {
        console.error(`[dispute/resolve] seller trust recompute failed:`, err);
      });
    }
  } catch (err) {
    console.error(`[dispute/resolve] trust recompute lookup failed:`, err);
  }

  return dispute;
}

// Default SLA window for an untriaged dispute, used when the trade carries no
// dispute_window_hours. After this many hours in 'open', the dispute-SLA sweep
// (lib/trust/dispute-sla-sweep.ts) auto-escalates it to the admin priority queue.
export const DEFAULT_DISPUTE_SLA_HOURS = 72;

// Auto-escalate disputes that have sat in 'open' past their response window
// with no admin triage. Flips 'open' → 'escalated' and stamps escalated_at.
//
// SAFETY: a pure status + priority move. NO money is touched and NO escrow
// state changes — only an admin's resolveDispute() ever moves funds. The SLA
// clock is the trade's own dispute_window_hours (seller-tunable), falling back
// to DEFAULT_DISPUTE_SLA_HOURS. Idempotent: only status='open' rows are
// eligible, so each dispute escalates at most once. Rate-capped via `limit`.
export async function escalateStaleDisputes(limit = 100): Promise<{
  escalated: Array<{
    id: string;
    trade_id: string;
    raised_by: string;
    reason: string;
    hours_open: number;
  }>;
}> {
  const result = await query(
    `UPDATE trade_disputes
        SET status = 'escalated',
            escalated_at = COALESCE(escalated_at, NOW()),
            updated_at = NOW()
      WHERE id IN (
        SELECT d.id
          FROM trade_disputes d
          JOIN market_trades t ON t.id = d.trade_id
         WHERE d.status = 'open'
           AND d.created_at
               + make_interval(hours => COALESCE(t.dispute_window_hours, $2)) < NOW()
         ORDER BY d.created_at ASC
         LIMIT $1
      )
      RETURNING id, trade_id, raised_by, reason,
        ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)::int AS hours_open`,
    [limit, DEFAULT_DISPUTE_SLA_HOURS]
  );
  return {
    escalated: result.rows.map((r) => ({
      id: r.id,
      trade_id: r.trade_id,
      raised_by: r.raised_by,
      reason: r.reason,
      hours_open: Number(r.hours_open),
    })),
  };
}

export async function addDisputeMessage(
  disputeId: string,
  senderId: string | null,
  message: string,
  isAdmin: boolean,
): Promise<DisputeMessage> {
  // Admin messages can have sender_id=null after migration 0057 —
  // previous handlers invented a sender by picking users LIMIT 1,
  // which silently attributed admin replies to whoever happened to be
  // first in the table.
  const result = await query(
    `INSERT INTO dispute_messages (dispute_id, sender_id, is_admin, message) VALUES ($1,$2,$3,$4) RETURNING *`,
    [disputeId, senderId, isAdmin, message]
  );
  return result.rows[0] as DisputeMessage;
}

export async function getDisputeMessages(disputeId: string): Promise<DisputeMessage[]> {
  // LEFT JOIN so admin messages with sender_id=NULL still return.
  // The sender_name column surfaces as null for those; the UI labels
  // them as "Admin" via the is_admin flag.
  const result = await query(
    `SELECT m.*, u.name as sender_name FROM dispute_messages m
     LEFT JOIN users u ON m.sender_id=u.id WHERE m.dispute_id=$1 ORDER BY m.created_at ASC`,
    [disputeId]
  );
  return result.rows as DisputeMessage[];
}

export async function getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
  const result = await query(
    `SELECT * FROM dispute_evidence WHERE dispute_id=$1 ORDER BY created_at ASC`,
    [disputeId]
  );
  return result.rows as DisputeEvidence[];
}

export async function addDisputeEvidence(disputeId: string, userId: string, url: string, s3Key: string, label?: string): Promise<DisputeEvidence> {
  const result = await query(
    `INSERT INTO dispute_evidence (dispute_id, uploaded_by, url, s3_key, label) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [disputeId, userId, url, s3Key, label || null]
  );
  return result.rows[0] as DisputeEvidence;
}

// ══════════════════════════════════════════════════════════════
// ESCROW PAYMENTS
// ══════════════════════════════════════════════════════════════

export async function createEscrowPayment(tradeId: string, amount: number, stripeSessionId: string): Promise<EscrowPayment> {
  const result = await query(
    `INSERT INTO escrow_payments (trade_id, type, stripe_checkout_session, amount, status)
     VALUES ($1,'buyer_payment',$2,$3,'pending') RETURNING *`,
    [tradeId, stripeSessionId, amount.toFixed(2)]
  );
  return result.rows[0] as EscrowPayment;
}

export async function markEscrowPaid(tradeId: string, stripePaymentIntent: string): Promise<void> {
  await query(
    `UPDATE escrow_payments SET status='paid', stripe_payment_intent=$2, paid_at=NOW()
     WHERE trade_id=$1 AND type='buyer_payment'`,
    [tradeId, stripePaymentIntent]
  );
  await query(
    `UPDATE market_trades SET escrow_status='paid', buyer_paid_at=NOW(), stripe_payment_intent=$2, updated_at=NOW()
     WHERE id=$1`,
    [tradeId, stripePaymentIntent]
  );
}

export async function recordSellerPayout(tradeId: string, amount: number, reference: string): Promise<void> {
  await query(
    `INSERT INTO escrow_payments (trade_id, type, amount, status, payout_amount, payout_reference, payout_at)
     VALUES ($1,'seller_payout',$2,'completed',$2,$3,NOW())`,
    [tradeId, amount.toFixed(2), reference]
  );
}

export async function recordRefund(tradeId: string, amount: number, reason: string): Promise<void> {
  await query(
    `UPDATE escrow_payments SET refund_amount=$2, refund_reason=$3, refunded_at=NOW(), status='refunded'
     WHERE trade_id=$1 AND type='buyer_payment'`,
    [tradeId, amount.toFixed(2), reason]
  );
  await query(
    `UPDATE market_trades SET escrow_status='refunded', updated_at=NOW() WHERE id=$1`,
    [tradeId]
  );
}

export async function getEscrowPayments(tradeId: string): Promise<EscrowPayment[]> {
  const result = await query(
    `SELECT * FROM escrow_payments WHERE trade_id=$1 ORDER BY created_at ASC`,
    [tradeId]
  );
  return result.rows as EscrowPayment[];
}
