// Bidder trust-tier resolution for the interactive auction detail page.
//
// Kept out of page.tsx so the page stays a thin server shell: it resolves
// each distinct bidder's trust tier from trust_profiles (the same source
// the public /read mirror uses) and returns a user_id → { tier, score }
// map that BidHistory renders as anonymised trust chips. The rendering
// surface (BidHistory in AuctionDetailClient) carries the
// /methodology/trust-score link.

import { query } from "@/lib/db";
import { getTrustTier } from "@/lib/escrow/trust-engine";

export async function loadBidderTiers(
  bidderIds: string[],
): Promise<Record<string, { tier: string | null; score: number | null }>> {
  if (bidderIds.length === 0) return {};
  try {
    const placeholders = bidderIds.map((_, i) => `$${i + 1}`).join(", ");
    const r = await query(
      `SELECT user_id, trust_score FROM trust_profiles WHERE user_id IN (${placeholders})`,
      bidderIds,
    );
    const map: Record<string, { tier: string | null; score: number | null }> = {};
    for (const row of r.rows) {
      const score = row.trust_score != null ? parseFloat(String(row.trust_score)) : null;
      map[String(row.user_id)] = {
        score,
        tier: score != null ? getTrustTier(score).name : null,
      };
    }
    return map;
  } catch {
    return {};
  }
}
