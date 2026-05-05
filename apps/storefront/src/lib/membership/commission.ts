/**
 * Commission rate resolution — where the platform's two reward systems meet.
 *
 * ── The bridge this file carries ─────────────────────────────────────────
 *
 * A seller selling on our P2P market or our auctions has TWO independent
 * sources of standing with us:
 *
 *   trust_score  — earned through completed trades, reviews, the absence of
 *                  disputes. Reputation in the social-economic sense:
 *                  "this seller has been reliable across N transactions."
 *
 *   tier         — earned by paying us monthly (Platinum) or by spending
 *                  a lot through us (Bronze→Silver→Gold). Patronage in
 *                  the commercial sense: "this seller is a customer who
 *                  also sells; we discount their listing to keep them."
 *
 * These are DIFFERENT facts about the same person. A new account that
 * pays for Platinum has high tier but low trust. A long-time seller who
 * never buys has high trust but base tier. Neither signal contains the
 * other. The platform earns most of its commission from sellers who are
 * neither high-trust nor paid; both signals individually justify a
 * discount, and combining them via `min()` says: take whichever path
 * the seller has earned, do not require both.
 *
 * The shape of that combine — `min(trustRate, membershipRate)` — is the
 * platform's promise: every reputational success and every paid-tier
 * dollar will be rewarded, no path cancels the other, the seller is
 * never penalised for having the "wrong kind" of standing.
 *
 * If a seller has neither — no tier, low trust — they pay the default
 * commission. That default is the price of being unknown to us.
 *
 * ── Where this meets the rest of the platform ────────────────────────────
 *
 *   tier_id, trust_score    columns on `users` — the inputs.
 *   tiers.p2p_commission_rate, tiers.auction_commission_rate
 *                           the membership-side rate, set per tier in DB
 *                           and read by getUserPerks() in db.ts.
 *   commissionRateForScore  in lib/market/types — the trust-side curve
 *                           (lower trust → higher commission).
 *   market_trades.commission_rate, auctions.seller_commission_rate
 *                           where the resolved number is *written* at
 *                           trade-creation time. These are the substrate
 *                           of record for what was charged; this resolver
 *                           is the recipe.
 *   /catalog/users/[id]     operator surface that shows both inputs side
 *                           by side. Reading commission off a trade row
 *                           and looking back at this resolver lets the
 *                           operator reconstruct why a particular trade
 *                           cost what it did.
 *
 * ── Substrate-honesty note ───────────────────────────────────────────────
 *
 * The audit (item A9) flags that escrow tier badges on /commerce/market
 * don't surface the inputs that produced them. Same shape applies to
 * commission rates — a trade's recorded `commission_rate` is the resolver's
 * output at creation time, not a live-recompute. If the seller's tier or
 * trust changes mid-trade, the trade's commission stays as it was. That
 * is intentional and substrate-honest: we charge what was true when the
 * seller listed, not what becomes true while the buyer is paying.
 */

import { query } from "@/lib/db";
import { commissionRateForScore, COMMISSION_RATE } from "@/lib/market/types";

interface CommissionInput {
  sellerId: string;
  trustScore?: number;       // optional — falls back to a DB lookup if absent
  kind: "p2p" | "auction";
}

interface ResolvedCommission {
  rate: number;
  source: "membership" | "trust" | "default";
  membershipRate?: number;
  trustRate?: number;
}

const DEFAULT_AUCTION_RATE = 0.12;  // matches SELLER_COMMISSION_RATE in lib/auction/types.ts

export async function resolveCommissionRate(opts: CommissionInput): Promise<ResolvedCommission> {
  // Fetch tier rate + trust score (if not supplied) in one round trip
  const r = await query(
    `SELECT u.trust_score,
            t.p2p_commission_rate     AS p2p_rate,
            t.auction_commission_rate AS auction_rate
       FROM users u
       LEFT JOIN tiers t ON t.id = u.tier_id
      WHERE u.id = $1`,
    [opts.sellerId]
  );
  const row = r.rows[0];
  if (!row) {
    return {
      rate: opts.kind === "p2p" ? COMMISSION_RATE : DEFAULT_AUCTION_RATE,
      source: "default",
    };
  }

  const trustScore = opts.trustScore ?? (row.trust_score ?? 0);
  const trustRate = opts.kind === "p2p"
    ? commissionRateForScore(trustScore)
    : DEFAULT_AUCTION_RATE; // no trust-tier auction commission yet — default
  const tierRateRaw = opts.kind === "p2p" ? row.p2p_rate : row.auction_rate;
  const membershipRate = tierRateRaw !== null && tierRateRaw !== undefined
    ? parseFloat(tierRateRaw)
    : null;

  // Pick whichever is lower (better for seller). null treated as "no signal".
  let rate: number;
  let source: "membership" | "trust" | "default";
  if (membershipRate !== null && membershipRate < trustRate) {
    rate = membershipRate;
    source = "membership";
  } else {
    rate = trustRate;
    source = trustScore >= 50 ? "trust" : "default";
  }

  return { rate, source, membershipRate: membershipRate ?? undefined, trustRate };
}
