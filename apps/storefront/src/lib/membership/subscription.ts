// Subscription lifecycle helpers — extracted so the cancel/resume/portal
// route handlers and the E2E test exercise identical logic without
// re-mocking Stripe per scenario.
//
// All functions return a discriminated-union result; route handlers
// translate `{ ok:false, reason, status }` into NextResponse JSON.

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

// Schedule cancellation at period end — user keeps Platinum until the
// current billing period elapses, then drops back to spend-based tier.
// Idempotent: re-cancelling an already-scheduled cancellation is a
// no-op success.
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
