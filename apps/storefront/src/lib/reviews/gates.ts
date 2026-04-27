// Review submission integrity gates.
//
// Without these, a malicious reviewer can:
//   - Review themselves (self-credibility farming)
//   - Review someone they never traded with (review-bombing setup)
//   - Burst-submit reviews at scale (manipulation)
//   - Review a trade still in dispute (revenge timing)
//
// Each gate throws a typed ReviewGateError; the route handler returns
// 4xx with the message. Pattern matches TrustGateError / TrustGateError
// from the market module.

import { query } from "@/lib/db";

export class ReviewGateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewGateError";
    this.code = code;
  }
}

const MAX_REVIEWS_PER_DAY = 5;

export interface SubmissionContext {
  reviewerId: string;
  revieweeId: string;
  tradeId: string;
}

/**
 * Validate that the (reviewer, reviewee, trade) tuple is allowed to
 * produce a review. Returns silently when allowed; throws ReviewGate
 * Error when not.
 */
export async function assertReviewAllowed(ctx: SubmissionContext): Promise<void> {
  // 1. No self-reviews — caught here even though the trade gate below
  //    would also reject (a trade can't have buyer=seller).
  if (ctx.reviewerId === ctx.revieweeId) {
    throw new ReviewGateError("self_review", "You cannot review yourself.");
  }

  // 2. The trade must exist, must include both parties, and must be in
  //    a terminal state (completed or refunded). 'awaiting_*' / 'disputed'
  //    states haven't resolved yet — review timing-windows like that
  //    invite revenge-after-bad-news patterns.
  const tradeRes = await query(
    `SELECT buyer_id, seller_id, escrow_status
       FROM market_trades WHERE id = $1`,
    [ctx.tradeId],
  );
  if (tradeRes.rows.length === 0) {
    throw new ReviewGateError("no_trade", "Trade not found.");
  }
  const t = tradeRes.rows[0];
  const reviewerInTrade = ctx.reviewerId === t.buyer_id || ctx.reviewerId === t.seller_id;
  const revieweeInTrade = ctx.revieweeId === t.buyer_id || ctx.revieweeId === t.seller_id;
  if (!reviewerInTrade || !revieweeInTrade) {
    throw new ReviewGateError(
      "not_party",
      "You can only review someone you traded with on this trade.",
    );
  }
  const TERMINAL = ["completed", "refunded"];
  if (!TERMINAL.includes(t.escrow_status)) {
    throw new ReviewGateError(
      "trade_not_terminal",
      "Wait until the trade is completed or refunded before leaving a review.",
    );
  }

  // 3. Rate limit: ≤ MAX_REVIEWS_PER_DAY per reviewer per UTC day.
  //    Catches burst-submit manipulation; legitimate reviewers will
  //    rarely hit it.
  const todayCountRes = await query(
    `SELECT COUNT(*)::int AS n
       FROM trade_reviews
      WHERE reviewer_id = $1
        AND created_at >= (NOW() AT TIME ZONE 'UTC')::date`,
    [ctx.reviewerId],
  );
  const todayCount = todayCountRes.rows[0]?.n ?? 0;
  if (todayCount >= MAX_REVIEWS_PER_DAY) {
    throw new ReviewGateError(
      "rate_limit",
      `You've submitted ${MAX_REVIEWS_PER_DAY} reviews today — the daily limit. Try again tomorrow.`,
    );
  }

  // 4. UNIQUE(trade_id, reviewer_id) on the table prevents
  //    duplicate-per-trade reviews; we surface a friendly error
  //    BEFORE the INSERT throws so the UI can render it cleanly.
  const dupRes = await query(
    `SELECT 1 FROM trade_reviews WHERE trade_id = $1 AND reviewer_id = $2 LIMIT 1`,
    [ctx.tradeId, ctx.reviewerId],
  );
  if (dupRes.rows.length > 0) {
    throw new ReviewGateError(
      "already_reviewed",
      "You've already reviewed this trade.",
    );
  }
}
