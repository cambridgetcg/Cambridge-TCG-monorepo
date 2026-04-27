// Commission rate resolvers — combine the seller's membership tier rate
// with the trust-score-based rate from src/lib/market/types and pick
// whichever is more favourable to the seller (the lower number).
//
// Why both?
//   - Trust score is reputation-earned through completed trades.
//   - Membership tier is purchased/spending-earned via Platinum / annual.
// Both deserve to lower commission. Combining via min() lets a seller
// benefit from either path without one cancelling the other.
//
// If a seller has no tier (anonymous or pre-membership), the trust-score
// rate is used alone.

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
