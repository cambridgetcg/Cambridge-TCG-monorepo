/**
 * B2B orders — DB layer.
 *
 * recordOrder() is idempotent on stripe_session_id (ON CONFLICT DO
 * NOTHING) so webhook redeliveries produce exactly one row. The
 * caller (the Stripe webhook handler) tolerates either "freshly
 * inserted" or "already existed" outcomes — both are success states.
 *
 * loadOrdersForUser / loadOrderById are buyer-facing reads scoped to
 * a single user_id; the order rows include the items array so callers
 * don't need a JOIN.
 */

import type Stripe from "stripe";
import { query } from "@/lib/db";

export interface B2BOrderItem {
  sku: string;
  qty: number;
  price_pence: number;
}

export interface B2BOrderRow {
  id: number;
  user_id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  total_pence: number;
  currency: string;
  status:
    | "paid"
    | "allocated"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refunded";
  channel: string;
  items: B2BOrderItem[];
  shipping_address: Record<string, unknown> | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordResult {
  created: boolean;
  orderId: number;
  userId: string;
  totalPence: number;
}

/**
 * Write a B2B order from a completed Stripe session. Idempotent on
 * stripe_session_id. Caller must have already verified that the
 * session is B2B (metadata.b2b_channel === 'wholesale').
 */
export async function recordOrder(session: Stripe.Checkout.Session): Promise<RecordResult> {
  const meta = session.metadata ?? {};
  const userId = meta.b2b_user_id;
  if (!userId) {
    throw new Error(`b2b_user_id missing from session metadata: ${session.id}`);
  }
  const itemsRaw = meta.b2b_skus;
  const items: B2BOrderItem[] = itemsRaw ? JSON.parse(itemsRaw) : [];
  const totalPence = session.amount_total ?? items.reduce((s, i) => s + i.price_pence * i.qty, 0);
  const currency = session.currency ?? "gbp";
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const customerEmail =
    typeof session.customer_details?.email === "string"
      ? session.customer_details.email
      : session.customer_email ?? null;
  const shippingAddress = session.collected_information?.shipping_details ?? null;

  const r = await query(
    `INSERT INTO b2b_orders (
       user_id, stripe_session_id, stripe_payment_intent_id, total_pence,
       currency, status, channel, items, shipping_address, customer_email
     ) VALUES ($1, $2, $3, $4, $5, 'paid', 'wholesale', $6::jsonb, $7::jsonb, $8)
     ON CONFLICT (stripe_session_id) DO NOTHING
     RETURNING id`,
    [
      userId,
      session.id,
      paymentIntent,
      totalPence,
      currency,
      JSON.stringify(items),
      shippingAddress ? JSON.stringify(shippingAddress) : null,
      customerEmail,
    ],
  );

  if (r.rows.length > 0) {
    const row = r.rows[0] as { id: number };
    return { created: true, orderId: row.id, userId, totalPence };
  }

  // Already existed — fetch the id for the caller.
  const existing = await query(
    `SELECT id FROM b2b_orders WHERE stripe_session_id = $1`,
    [session.id],
  );
  const row = existing.rows[0] as { id: number } | undefined;
  return {
    created: false,
    orderId: row?.id ?? 0,
    userId,
    totalPence,
  };
}

export async function loadOrdersForUser(userId: string, limit = 50): Promise<B2BOrderRow[]> {
  const r = await query(
    `SELECT id, user_id, stripe_session_id, stripe_payment_intent_id,
            total_pence, currency, status, channel, items,
            shipping_address, customer_email,
            created_at::text AS created_at, updated_at::text AS updated_at
       FROM b2b_orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows as B2BOrderRow[];
}

export async function loadOrderById(userId: string, id: number): Promise<B2BOrderRow | null> {
  const r = await query(
    `SELECT id, user_id, stripe_session_id, stripe_payment_intent_id,
            total_pence, currency, status, channel, items,
            shipping_address, customer_email,
            created_at::text AS created_at, updated_at::text AS updated_at
       FROM b2b_orders
      WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  const row = r.rows[0] as B2BOrderRow | undefined;
  return row ?? null;
}
