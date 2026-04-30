/**
 * Record a paid Stripe checkout session as a customer_orders row.
 *
 * Single source of truth for the INSERT — used by:
 *   1. The Stripe webhook (`/api/webhooks/stripe`, on
 *      checkout.session.completed) — primary path, fires immediately
 *      after Stripe confirms payment.
 *   2. The `/order-confirmation` page — defensive backup, fires when the
 *      customer's browser returns from Stripe checkout. Useful if the
 *      webhook is misconfigured or hasn't been delivered yet.
 *   3. The hourly reconciliation cron — sweeps paid sessions in case
 *      both 1 and 2 missed (e.g. customer closed the tab on Stripe's
 *      page before the redirect; webhook also failed).
 *
 * All call sites are idempotent on `stripe_session_id` UNIQUE — first
 * writer wins, subsequent calls return `{ created: false }`.
 *
 * Pure-record only. Does NOT trigger:
 *   - Stock commit (webhook does this)
 *   - Wholesale sale report (webhook does this)
 *   - Membership rewards (webhook does this)
 *   - Email queue / notifications (webhook does this)
 *
 * Those are intentionally left to the webhook so we don't duplicate side
 * effects when /order-confirmation also records. The webhook is still the
 * canonical fulfilment path; this file's job is "make sure the order
 * shows up in the admin dashboard even if the webhook flakes."
 */

import type Stripe from "stripe";
import { query } from "@/lib/db";

export interface RecordResult {
  /** true if a new row was inserted, false if a row already existed. */
  created: boolean;
  /** The Stripe session id we attempted to record. */
  sessionId: string;
  /** Resolved user id if the customer email matched a users row. */
  userId: string | null;
  /** Email used when looking up the user (lowercased). */
  email: string;
  /** Total in pounds (Stripe `amount_total / 100`). */
  totalGbp: number;
}

export async function recordOrderFromStripeSession(
  session: Stripe.Checkout.Session,
): Promise<RecordResult> {
  // Stripe types treat shipping_details as deprecated in newer versions
  // but it's still populated; collected_information is the newer path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shipping =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).collected_information?.shipping_details ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).shipping_details ??
    null;

  const email =
    session.customer_details?.email || session.customer_email || "";
  const name = session.customer_details?.name || "";
  const total = (session.amount_total || 0) / 100;
  const shippingAddr = shipping?.address
    ? [
        shipping.address.line1,
        shipping.address.line2,
        shipping.address.city,
        shipping.address.postal_code,
        shipping.address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  let skus: Array<{ sku: string; qty: number; price_gbp: number; name?: string }> = [];
  try {
    skus = session.metadata?.skus ? JSON.parse(session.metadata.skus) : [];
  } catch {
    // metadata is best-effort; ignore parse failures
  }

  // Look up matching user by email if any. Guest orders → user_id null.
  let userId: string | null = null;
  if (email) {
    const u = await query(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    if (u.rows.length > 0) userId = (u.rows[0] as { id: string }).id;
  }

  const result = await query(
    `INSERT INTO customer_orders
       (user_id, stripe_session_id, stripe_payment_intent, customer_email,
        customer_name, status, total_gbp, currency, shipping_name,
        shipping_address, items)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (stripe_session_id) DO NOTHING
     RETURNING id`,
    [
      userId,
      session.id,
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null,
      email.toLowerCase(),
      name,
      "completed",
      total.toFixed(2),
      session.currency || "gbp",
      shipping?.name || name,
      shippingAddr,
      JSON.stringify(skus),
    ],
  );

  return {
    created: result.rows.length > 0,
    sessionId: session.id,
    userId,
    email: email.toLowerCase(),
    totalGbp: total,
  };
}
