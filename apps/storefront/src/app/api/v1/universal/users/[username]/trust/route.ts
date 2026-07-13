import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { TRUST_TIERS } from "@/lib/escrow/types";
import { loadPublishedTrustState } from "@/lib/trust/public";

function epoch(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const { username } = await params;
  const state = await loadPublishedTrustState(username);
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: "Public trust profile not found.",
    });
  }
  const tierOrdinal = TRUST_TIERS.findIndex((tier) => tier.name === state.tier.name);

  return jsonResponse({
    data: {
      "@kind": "user_trust_state",
      "@encoding": "cambridge-tcg/universal/v1",
      "@as_of": { iso: state.as_of, epoch: epoch(state.as_of) },
      identity: {
        username: state.username,
        display_name: state.display_name,
        _note_opaque: "Human-readable public labels; no internal or hashed user id.",
      },
      membership: {
        since: { iso: state.member_since, epoch: epoch(state.member_since) },
      },
      trust: {
        score_ratio: state.trust_score / 100,
        score_int: state.trust_score,
        tier_ordinal: tierOrdinal >= 0 ? tierOrdinal : 0,
        tier_name: state.tier.name,
      },
      trades: { completed: state.completed_trades },
      reviews: {
        average_ratio:
          state.reviews.average == null ? null : state.reviews.average / 5,
        total: state.reviews.total,
        five_star_ratio:
          state.reviews.total > 0
            ? state.reviews.five_star / state.reviews.total
            : null,
      },
    },
    endpoint: "/api/v1/universal/users/[username]/trust",
    sources: ["users", "trust_profiles", "trade_reviews"],
    source_license: ["proprietary", "proprietary", "proprietary"],
    license: "LicenseRef-CambridgeTCG-Public-Display-Only",
    freshness: "market_signal",
    as_of: state.as_of,
    no_cache: true,
    does_not_include: [
      "No internal or hashed user id, exact money, adverse-event counts, operational limits, flags, suspension details, or trajectory.",
    ],
  });
}
