"use server";

/**
 * B2B order — operator state transitions.
 *
 * The five legal transitions:
 *   paid       → allocated  (stock confirmed at warehouse)
 *   allocated  → shipped    (courier has the parcel)
 *   shipped    → delivered  (buyer confirmed; or proxy-confirmed)
 *   *          → cancelled  (operator cancel, pre-shipment)
 *   *          → refunded   (post-payment refund processed)
 *
 * Every transition runs through adminAction() so it gates on admin
 * role, writes admin_actions_log, and revalidates the order pages.
 */

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { sfQuery } from "@/lib/admin/db";

type B2BStatus =
  | "paid"
  | "allocated"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

const ALLOWED_TRANSITIONS: Record<B2BStatus, B2BStatus[]> = {
  paid: ["allocated", "cancelled", "refunded"],
  allocated: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

async function transition(input: {
  id: number;
  to: B2BStatus;
  reason?: string;
}) {
  if (!Number.isFinite(input.id) || input.id <= 0) {
    throw new ActionInputError("Invalid order id");
  }
  const current = await sfQuery<{ status: B2BStatus; user_id: string }>(
    `SELECT status, user_id FROM b2b_orders WHERE id = $1`,
    [input.id],
  );
  const row = current.rows[0];
  if (!row) throw new ActionInputError("Order not found");
  const allowed = ALLOWED_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(input.to)) {
    throw new ActionInputError(
      `Cannot transition '${row.status}' → '${input.to}'. Allowed: ${allowed.join(", ") || "(terminal)"}`,
    );
  }
  await sfQuery(
    `UPDATE b2b_orders
        SET status = $1, updated_at = NOW()
      WHERE id = $2`,
    [input.to, input.id],
  );
  return {
    id: input.id,
    user_id: row.user_id,
    from: row.status,
    to: input.to,
  };
}

export async function markAllocated(input: { id: number; reason?: string }) {
  return adminAction({
    action: "b2b_order.allocate",
    targetKind: "b2b_order",
    targetId: String(input.id),
    reason: input.reason,
    revalidate: [`/admin/commerce/b2b-orders`, `/admin/commerce/b2b-orders/${input.id}`],
    run: async () => transition({ id: input.id, to: "allocated", reason: input.reason }),
  });
}

export async function markShipped(input: { id: number; reason?: string }) {
  return adminAction({
    action: "b2b_order.ship",
    targetKind: "b2b_order",
    targetId: String(input.id),
    reason: input.reason,
    revalidate: [`/admin/commerce/b2b-orders`, `/admin/commerce/b2b-orders/${input.id}`],
    run: async () => transition({ id: input.id, to: "shipped", reason: input.reason }),
  });
}

export async function markDelivered(input: { id: number; reason?: string }) {
  return adminAction({
    action: "b2b_order.deliver",
    targetKind: "b2b_order",
    targetId: String(input.id),
    reason: input.reason,
    revalidate: [`/admin/commerce/b2b-orders`, `/admin/commerce/b2b-orders/${input.id}`],
    run: async () => transition({ id: input.id, to: "delivered", reason: input.reason }),
  });
}

export async function cancelOrder(input: { id: number; reason: string }) {
  if (!input.reason?.trim()) {
    throw new ActionInputError("Reason required for cancellation");
  }
  return adminAction({
    action: "b2b_order.cancel",
    targetKind: "b2b_order",
    targetId: String(input.id),
    reason: input.reason,
    revalidate: [`/admin/commerce/b2b-orders`, `/admin/commerce/b2b-orders/${input.id}`],
    run: async () => transition({ id: input.id, to: "cancelled", reason: input.reason }),
  });
}

export async function refundOrder(input: { id: number; reason: string }) {
  if (!input.reason?.trim()) {
    throw new ActionInputError("Reason required for refund");
  }
  return adminAction({
    action: "b2b_order.refund",
    targetKind: "b2b_order",
    targetId: String(input.id),
    reason: input.reason,
    revalidate: [`/admin/commerce/b2b-orders`, `/admin/commerce/b2b-orders/${input.id}`],
    run: async () => transition({ id: input.id, to: "refunded", reason: input.reason }),
  });
}
