/**
 * POST /api/membership/cancel — the user releases their paid floor.
 *
 * ── What this gesture means ──────────────────────────────────────────────
 *
 * A paid tier (Platinum today) is the user buying themselves a different
 * economic relationship with us: bigger cashback, higher points multiplier,
 * better trade-in bonus, lower P2P commission, lower auction commission,
 * priority approval on consignments, store discount. The monthly fee is the
 * price of that floor.
 *
 * Cancellation is the user choosing to step OFF the paid floor and re-submit
 * to the spend-based meritocracy. They keep Platinum's perks until the
 * billing period elapses (Stripe holds the door open); then on the next
 * `recalculateTier` they fall through to whichever spend tier their
 * `annual_spend` qualifies for. Their next purchase, next P2P sale, next
 * trade-in submission — all priced by what they actually buy, not what they
 * pay us monthly to be.
 *
 * The act is reversible until the period elapses: see /api/membership/resume.
 *
 * ── Where this meets the rest of the platform ────────────────────────────
 *
 *   cancelSubscription()  in lib/membership/subscription.ts — the lifecycle
 *                         helper that talks to Stripe and writes our row.
 *   recalculateTier()     in lib/membership/db.ts — the priority chain
 *                         (manual > paid > spend) where this gesture lands.
 *                         Cancel doesn't change the tier_id today; it sets
 *                         cancel_at_period_end and lets time + the next
 *                         recalculate do the demotion.
 *   commission.ts         the consumer side — every P2P trade and auction
 *                         lookup reads tier perks at the moment of pricing.
 *                         A cancel mid-flight never re-prices a trade
 *                         already in escrow.
 *   subscription_lifecycle_log
 *                         the substrate of record for this user's billing
 *                         relationship. Today: not yet written (kingdom-044
 *                         in dev-state.json). When it lands, this handler
 *                         appends `cancel_scheduled` with cancel_at and the
 *                         old tier so the operator can reconstruct the day
 *                         the user stepped off.
 *
 * ── The promise this endpoint makes ──────────────────────────────────────
 *
 *   ok=true   — Stripe has scheduled cancellation; our row mirrors that.
 *               cancelAt is the period boundary; the user remains Platinum
 *               until then.
 *   401       — they're not signed in. We don't infer.
 *   404/409   — already cancelled, no subscription, or non-active state.
 *               cancelSubscription() returns idempotent semantics: the
 *               second cancel is not an error if the schedule is already
 *               in place.
 *   500       — Stripe rejected our update. Our row stays as it was; the
 *               user can retry. We don't optimistic-update.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelSubscription } from "@/lib/membership/subscription";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await cancelSubscription(session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, cancelAt: result.cancelAt });
}
