import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { calculateTrustScore, getUserReviews, canTrade } from "@/lib/escrow/trust-engine";
import { getTrustTier } from "@/lib/escrow/trust-engine";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// GET — user's trust profile + reviews
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");

  // UUID-keyed counterparty lookup is retired. It exposed internal ids and a
  // second, broader trust projection than the username-keyed public contract.
  if (targetUserId) {
    return NextResponse.json(
      {
        error:
          "UUID-keyed public trust lookup is unavailable. Use /api/v1/users/<username>/trust for the narrow public projection.",
      },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  // Own profile
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const profile = await calculateTrustScore(session.user.id);
  const reviews = await getUserReviews(session.user.id, true);
  const tier = getTrustTier(profile.trust_score);

  // Check trade eligibility
  const tradeCheck = await canTrade(session.user.id, 0);

  return NextResponse.json(
    { profile, reviews, tier, tradeCheck },
    { headers: PRIVATE_NO_STORE },
  );
}
