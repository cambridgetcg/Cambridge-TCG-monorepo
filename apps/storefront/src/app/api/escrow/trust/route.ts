import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { calculateTrustScore, getUserReviews, canTrade } from "@/lib/escrow/trust-engine";
import { getTrustTier } from "@/lib/escrow/trust-engine";

// GET — user's trust profile + reviews
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");

  // Public profile lookup
  if (targetUserId) {
    const profile = await calculateTrustScore(targetUserId);
    const reviews = await getUserReviews(targetUserId);
    const tier = getTrustTier(profile.trust_score);
    return NextResponse.json({ profile, reviews, tier });
  }

  // Own profile
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const profile = await calculateTrustScore(session.user.id);
  const reviews = await getUserReviews(session.user.id);
  const tier = getTrustTier(profile.trust_score);

  // Check trade eligibility
  const tradeCheck = await canTrade(session.user.id, 0);

  return NextResponse.json({ profile, reviews, tier, tradeCheck });
}
