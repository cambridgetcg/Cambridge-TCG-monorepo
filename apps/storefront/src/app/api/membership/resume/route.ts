/**
 * POST /api/membership/resume — the user takes back the paid floor.
 *
 * The inverse of /api/membership/cancel. If the cancellation hasn't yet
 * elapsed, this clears `cancel_at_period_end` on the Stripe subscription
 * and on our mirror row. The next billing cycle proceeds as before; the
 * user never falls through to the spend-based ladder.
 *
 * Valid only while `subscription_cancel_at_period_end = true` AND the
 * period hasn't elapsed. Once the cancel takes effect, the subscription
 * is gone — resume becomes /api/membership/subscribe (a fresh Checkout
 * session, fresh stripe_subscription_id, fresh trial state if any).
 *
 * The intent: cancel and resume together form a "pause + reconsider"
 * affordance. We don't punish the user for changing their mind during
 * the grace window. After the boundary, the choice is real.
 *
 * Reads the same tier-resolution priority chain as cancel. See the
 * docstring on cancel/route.ts for the full story of what membership
 * cancellation means in this platform.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resumeSubscription } from "@/lib/membership/subscription";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await resumeSubscription(session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
