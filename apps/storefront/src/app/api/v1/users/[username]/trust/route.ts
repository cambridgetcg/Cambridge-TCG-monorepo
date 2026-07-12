import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { loadPublishedTrustState } from "@/lib/trust/public";

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

  return jsonResponse({
    data: state,
    endpoint: "/api/v1/users/[username]/trust",
    sources: ["users", "trust_profiles", "trade_reviews"],
    source_license: ["proprietary", "proprietary", "proprietary"],
    license: "LicenseRef-CambridgeTCG-Public-Display-Only",
    freshness: "market_signal",
    as_of: state.as_of,
    no_cache: true,
    does_not_include: [
      "No internal user id, exact trade value, largest trade, dispute count, cancellation count, account limit, payout rule, commission rule, flag, suspension detail, or private review.",
    ],
  });
}
