// Shop-order fulfilment lib.
//
// Migration 0055 added tracking_number / carrier / shipped_at /
// delivered_at columns to customer_orders, and the customer-facing
// /account/orders page renders them. But until now there was no
// admin write path for ordinary checkout orders — only the bounty
// and prize redemption flows wrote those columns. Regular shop
// orders sat at status='completed' forever with NULL tracking.
//
// This lib closes that gap. Same discriminated-union return shape
// as the rest of the codebase. Notifications fire to the customer
// (via the user_id on the order if the email matched a user at
// webhook time; otherwise the email-only order silently skips the
// in-app notification — the customer-facing email layer covers
// that case).

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { buildTrackingUrl } from "@/lib/shipping/carriers";

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

export interface CustomerOrder {
  id: number;
  user_id: string | null;
  stripe_session_id: string | null;
  customer_email: string;
  customer_name: string | null;
  status: string;
  total_gbp: string;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
}

// States from which a 'ship' action makes sense. 'partially_shipped'
// is included so a re-ship (e.g., add a second tracking number for
// a split shipment) doesn't hard-error.
const SHIPPABLE_STATES = new Set(["completed", "processing", "redemption_pending", "partially_shipped"]);

// ── markShipped ──
//
// Stamps tracking + shipped_at + status='shipped'. If the order's
// matched user_id is known, fires order.shipped notification with
// a body that includes the tracking link. Idempotent on retry via
// the (user, kind, ref_type, ref_id) dedup key on notifications.

export async function markShipped(input: {
  orderId: number;
  carrier: string;
  trackingNumber: string;
  adminLabel: string;
  notes?: string;
}): Promise<Result<CustomerOrder>> {
  if (!input.carrier?.trim() || !input.trackingNumber?.trim()) {
    return { ok: false, reason: "Carrier and tracking number required.", status: 400 };
  }

  const row = await query(
    `SELECT id, user_id, customer_email, customer_name, status, total_gbp,
            tracking_number, carrier, shipped_at, delivered_at, notes,
            stripe_session_id, items
       FROM customer_orders WHERE id = $1`,
    [input.orderId],
  );
  if (row.rows.length === 0) {
    return { ok: false, reason: "Order not found.", status: 404 };
  }
  const order = row.rows[0];

  if (!SHIPPABLE_STATES.has(order.status)) {
    return {
      ok: false,
      reason: `Order is ${order.status} — can't ship from this state.`,
      status: 409,
    };
  }
  // 'completed' is overloaded: it's both the pre-ship state (Stripe
  // just completed) AND the post-delivery terminal state (after
  // markDelivered sets delivered_at). SHIPPABLE_STATES allows
  // 'completed' so brand-new orders can be shipped — but gate on
  // delivered_at to prevent re-shipping a delivered order.
  if (order.delivered_at) {
    return {
      ok: false,
      reason: "Order is already delivered — can't re-ship.",
      status: 409,
    };
  }

  await query(
    `UPDATE customer_orders
        SET tracking_number = $2,
            carrier = $3,
            shipped_at = COALESCE(shipped_at, NOW()),
            status = 'shipped',
            notes = CASE WHEN $4::text IS NULL THEN notes ELSE $4 END
      WHERE id = $1`,
    [input.orderId, input.trackingNumber.trim(), input.carrier.trim(),
     input.notes?.trim() ?? null],
  );

  // Audit trail via the existing governance log helper.
  try {
    const { logAdminAction } = await import("@/lib/admin/governance-log");
    await logAdminAction({
      actorLabel: input.adminLabel,
      targetUserId: order.user_id,
      targetKind: "customer_order",
      targetId: String(input.orderId),
      action: "order_shipped",
      beforeValue: { status: order.status, tracking_number: order.tracking_number },
      afterValue: { status: "shipped", tracking_number: input.trackingNumber, carrier: input.carrier },
      reason: input.notes ?? null,
    });
  } catch (err) {
    console.error("[shop/fulfilment] governance log failed:", err);
  }

  // Customer notification — only when we know the user_id (webhook
  // matched the email at order time). Email-only orders (guest
  // checkout, mismatched-account) get the email layer's tracking
  // link from sendShippedEmail elsewhere; no in-app row to write.
  if (order.user_id) {
    const trackUrl = buildTrackingUrl(input.carrier.trim(), input.trackingNumber.trim());
    await notify({
      userId: order.user_id,
      kind: "order.shipped",
      title: `Your order has shipped — ${input.carrier} ${input.trackingNumber}`,
      body: trackUrl
        ? `Track your shipment: ${trackUrl}`
        : "We'll update you when it arrives.",
      linkUrl: "/account/orders",
      referenceType: "customer_order",
      referenceId: `${input.orderId}:shipped`,
    });
  }

  const updated = await query(
    `SELECT * FROM customer_orders WHERE id = $1`, [input.orderId]);
  return { ok: true, value: updated.rows[0] as CustomerOrder };
}

// ── markDelivered ──
//
// Stamps delivered_at + status='completed' (or 'delivered' if the
// schema CHECK supports it; most checkout flows treat 'completed'
// as the terminal state). The customer's bell lights up.

const DELIVERABLE_STATES = new Set(["shipped", "partially_shipped"]);

export async function markDelivered(input: {
  orderId: number;
  adminLabel: string;
}): Promise<Result<CustomerOrder>> {
  const row = await query(
    `SELECT id, user_id, status, tracking_number FROM customer_orders WHERE id = $1`,
    [input.orderId],
  );
  if (row.rows.length === 0) {
    return { ok: false, reason: "Order not found.", status: 404 };
  }
  const order = row.rows[0];

  if (!DELIVERABLE_STATES.has(order.status)) {
    return {
      ok: false,
      reason: `Order is ${order.status} — must be 'shipped' before marking delivered.`,
      status: 409,
    };
  }

  await query(
    `UPDATE customer_orders
        SET delivered_at = COALESCE(delivered_at, NOW()),
            status = 'completed'
      WHERE id = $1`,
    [input.orderId],
  );

  try {
    const { logAdminAction } = await import("@/lib/admin/governance-log");
    await logAdminAction({
      actorLabel: input.adminLabel,
      targetUserId: order.user_id,
      targetKind: "customer_order",
      targetId: String(input.orderId),
      action: "order_delivered",
      beforeValue: { status: order.status },
      afterValue: { status: "completed" },
    });
  } catch (err) {
    console.error("[shop/fulfilment] governance log failed:", err);
  }

  if (order.user_id) {
    await notify({
      userId: order.user_id,
      kind: "order.delivered",
      title: "Your order has been delivered",
      body: "Thanks for shopping with Cambridge TCG. Leave a review or browse new arrivals.",
      linkUrl: "/account/orders",
      referenceType: "customer_order",
      referenceId: `${input.orderId}:delivered`,
    });
  }

  const updated = await query(
    `SELECT * FROM customer_orders WHERE id = $1`, [input.orderId]);
  return { ok: true, value: updated.rows[0] as CustomerOrder };
}

// ── List for admin ──

export async function listOrdersForAdmin(filter: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ orders: CustomerOrder[]; total: number }> {
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const params: unknown[] = [limit, offset];
  let where = "";
  if (filter.status) {
    params.unshift(filter.status);
    where = `WHERE status = $1`;
  }

  const idxLim = params.length - 1;
  const idxOff = params.length;
  const r = await query(
    `SELECT id, user_id, stripe_session_id, customer_email, customer_name,
            status, total_gbp, tracking_number, carrier, shipped_at,
            delivered_at, notes, created_at
       FROM customer_orders
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idxLim} OFFSET $${idxOff}`,
    params,
  );

  const cnt = await query(
    `SELECT COUNT(*)::int AS n FROM customer_orders ${where}`,
    filter.status ? [filter.status] : [],
  );

  return { orders: r.rows as CustomerOrder[], total: cnt.rows[0].n };
}
