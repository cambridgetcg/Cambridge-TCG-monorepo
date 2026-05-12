/**
 * /api/v1/users/[username]/trust — public JSON sibling of /u/[username]/trust.
 *
 * Substrate-honest machine-readable form of the user's trust state.
 * Composes `loadUserTrustState` from `lib/trust/state` — same data the
 * HTML mirror renders, served as JSON for agents, archivists, and
 * federation clients.
 *
 * kingdom-071. Story-as-wire: docs/connections/the-trust-fanout.md (S37).
 *
 * Public, no-auth, but **gated** on `users.is_public`. Returns 404 for
 * private profiles (same closed-door behaviour as the HTML mirror; the
 * machine-readable form must not leak what the human-readable form hides).
 *
 * Freshness: market_signal (60s) — trust derives from trades, which
 * complete on a per-minute cadence; the daily recompute cron sets the
 * canonical value, but live reads see it via trust_profiles.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  loadUserTrustState,
  resolveUsername,
  userTrustStateIsPublic,
} from "@/lib/trust/state";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const { username } = await params;
  if (!username || username.length === 0) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "Missing username path parameter.",
    });
  }

  const userId = await resolveUsername(username);
  if (!userId) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `No user found for username '${username}'.`,
    });
  }

  // Public gate — match the HTML mirror's behaviour exactly.
  const isPublic = await userTrustStateIsPublic(userId);
  if (!isPublic) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `No public trust profile for username '${username}'.`,
    });
  }

  const state = await loadUserTrustState(userId);
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Trust state unavailable for username '${username}'.`,
    });
  }

  return jsonResponse({
    data: state,
    endpoint: "/api/v1/users/[username]/trust",
    sources: [
      "users",
      "trust_profiles",
      "trade_reviews",
      "trust_score_history",
    ],
    freshness: "market_signal",
    as_of: state.current.last_calculated_at ?? state._provenance.queried_at,
  });
}
