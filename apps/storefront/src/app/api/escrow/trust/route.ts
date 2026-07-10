import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { calculateTrustScore, getUserReviews, canTrade } from "@/lib/escrow/trust-engine";
import { getTrustTier } from "@/lib/escrow/trust-engine";

// GET — user's trust profile + reviews
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");

  // Another user's profile — signed-in participants only, public fields only.
  // Suspension state, trade/daily limits, and fraud flags are participant-only
  // (canTrade surfaces them to the affected user). Read-only on purpose: no
  // calculateTrustScore here — it writes trust_profiles/users on every call,
  // which would let lookups amplify into unbounded writes.
  if (targetUserId) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const result = await query(
      `SELECT user_id, trust_score, seller_score, buyer_score,
              total_trades, completed_trades, avg_rating,
              total_reviews, positive_reviews, negative_reviews
         FROM trust_profiles
        WHERE user_id = $1`,
      [targetUserId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Trust profile not found." }, { status: 404 });
    }
    const profile = result.rows[0];
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
