/**
 * Subscription lifecycle helpers — Stripe is authoritative; we mirror.
 *
 * ── The asymmetry this module embodies ──────────────────────────────────
 *
 * Stripe owns the truth about whether a customer's subscription is active,
 * scheduled-to-cancel, past-due, or cancelled. Our `users` table mirrors
 * that truth via webhook reconciliation (and via these direct mutations
 * when an admin or the user themselves takes an action through our UI).
 *
 * The functions here represent gestures the *user* takes through our
 * surface (cancel, resume, open portal). For each, the contract is:
 *
 *   1. Read our mirror row to confirm the gesture is valid.
 *   2. Call Stripe with the requested change. Stripe is the source of
 *      truth; if it rejects, the gesture failed and our row is unchanged.
 *   3. On Stripe success, write the change back to our mirror so the
 *      next page load reflects what just happened (without waiting for
 *      the webhook).
 *
 * This three-step ordering is substrate-honest: we never claim a state
 * change before Stripe acknowledges it. See docs/principles/substrate-honesty.md.
 *
 * Webhook handlers in /api/webhooks/stripe/* are the OTHER write path —
 * Stripe-initiated state changes (renewal, payment failed, cancellation
 * effective) flow back to us through them. Reconciliation between this
 * module's writes and the webhook writes is intentional: both paths
 * converge on the same columns (`subscription_status`,
 * `subscription_cancel_at_period_end`, `subscription_expires_at`).
 *
 * ── Where this meets the rest of the platform ───────────────────────────
 *
 *   /api/membership/cancel  — user clicks "cancel"; calls cancelSubscription
 *   /api/membership/resume  — user clicks "keep my subscription"
 *   /api/membership/portal  — Stripe Customer Portal for payment-method,
 *                             invoices, self-cancel
 *   recalculateTier()       in db.ts — reads OUR mirrored fields to decide
 *                             which tier the user qualifies for. The mirror
 *                             must be honest, or the tier ladder is wrong.
 *   subscription_lifecycle_log
 *                           the audit-trail substrate proposed in kingdom-044.
 *                           When it lands, every helper here appends a row
 *                           naming the gesture, the actor (user vs admin vs
 *                           Stripe-webhook-via-X), and the before/after.
 *
 * All functions return a discriminated-union result; route handlers
 * translate `{ ok:false, reason, status }` into NextResponse JSON.
 */

import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// Discriminated union — TS narrows correctly on `result.ok`.
export type SubscriptionResult =
  | { ok: true; cancelAt?: string }
  | { ok: false; reason: string; status: number };

interface UserRow {
  subscription_stripe_id: string | null;
  subscription_status: string | null;
  subscription_cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

async function fetchUserSub(userId: string): Promise<UserRow | null> {
  const r = await query(
    `SELECT subscription_stripe_id, subscription_status,
            subscription_cancel_at_period_end, stripe_customer_id
       FROM users WHERE id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

/**
 * cancelSubscription — schedule a graceful end to the paid floor.
 *
 * Stripe semantics: `cancel_at_period_end = true` keeps the subscription
 * active and Platinum's perks intact until the current billing period
 * ends. At the period boundary, Stripe transitions the sub to `canceled`
 * and emits `customer.subscription.deleted` — our webhook handler picks
 * that up and clears `subscription_status` to `canceled`. The next time
 * `recalculateTier` runs, Priority 1 (paid tier) fails its
 * `subscription_status === 'active'` check, and the user falls through
 * to Priority 2 (spend-based).
 *
 * This is the gentler of the two cancellations Stripe supports. The
 * harder one (`cancel()` immediately) we don't expose — the user
 * shouldn't lose perks they've already paid for in the current cycle.
 *
 * Idempotent: re-cancelling an already-scheduled cancellation is a
 * no-op success at Stripe's level. Our mirror updates are also idempotent.
 *
 * Errors are surfaced verbatim to the route handler so the user can see
 * what went wrong (Stripe's error messages are usually actionable).
 */
export async function cancelSubscription(userId: string): Promise<SubscriptionResult> {
  const u = await fetchUserSub(userId);
  if (!u) return { ok: false, reason: "User not found.", status: 404 };
  if (!u.subscription_stripe_id) {
    return { ok: false, reason: "No active subscription to cancel.", status: 404 };
  }
  if (u.subscription_status !== "active") {
    return {
      ok: false,
      reason: `Subscription is ${u.subscription_status ?? "inactive"}, nothing to cancel.`,
      status: 409,
    };
  }

  const stripe = getStripe();
  let updated;
  try {
    updated = await stripe.subscriptions.update(u.subscription_stripe_id, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Stripe cancel failed.",
      status: 500,
    };
  }

  const cancelAt = updated.cancel_at
    ? new Date(updated.cancel_at * 1000).toISOString()
    : null;

  await query(
    `UPDATE users
        SET subscription_cancel_at_period_end = true,
            subscription_expires_at = COALESCE(to_timestamp($2), subscription_expires_at),
            updated_at = NOW()
      WHERE id = $1`,
    [userId, updated.cancel_at],
  );

  return { ok: true, cancelAt: cancelAt ?? undefined };
}

// Undo a scheduled cancellation. Only valid if cancel_at_period_end
// is currently true and the period hasn't elapsed.
export async function resumeSubscription(userId: string): Promise<SubscriptionResult> {
  const u = await fetchUserSub(userId);
  if (!u) return { ok: false, reason: "User not found.", status: 404 };
  if (!u.subscription_stripe_id) {
    return { ok: false, reason: "No subscription to resume.", status: 404 };
  }
  if (!u.subscription_cancel_at_period_end) {
    return { ok: false, reason: "Subscription is not scheduled to cancel.", status: 409 };
  }

  const stripe = getStripe();
  try {
    await stripe.subscriptions.update(u.subscription_stripe_id, {
      cancel_at_period_end: false,
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Stripe resume failed.",
      status: 500,
    };
  }

  await query(
    `UPDATE users
        SET subscription_cancel_at_period_end = false,
            updated_at = NOW()
      WHERE id = $1`,
    [userId],
  );
  return { ok: true };
}

// Generate a Stripe Customer Portal session URL. The portal lets users
// update payment method, view invoices, and self-cancel — everything
// our DIY UI doesn't cover. Falls back to a clear error when no
// stripe_customer_id exists yet (user hasn't completed a Checkout).
export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: string; status: number };

export async function createPortalSession(
  userId: string,
  returnUrl: string,
): Promise<PortalResult> {
  const u = await fetchUserSub(userId);
  if (!u) return { ok: false, reason: "User not found.", status: 404 };
  if (!u.stripe_customer_id) {
    return {
      ok: false,
      reason: "No Stripe customer on file. Subscribe first to set one up.",
      status: 404,
    };
  }

  const stripe = getStripe();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: u.stripe_customer_id,
      return_url: returnUrl,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    // Common cause: portal not configured in the Stripe Dashboard.
    // Surface the message so the operator knows what to fix.
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Portal session failed.",
      status: 500,
    };
  }
}
