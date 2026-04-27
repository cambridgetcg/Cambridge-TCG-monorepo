export type OrderStatus =
  | "submitted"
  | "quoted"
  | "confirmed"
  | "paid"
  | "ordered"
  | "shipped"
  | "delivered"
  | "cancelled";

/**
 * Allowed status transitions via the admin status PATCH endpoint.
 *
 * Note: "submitted → quoted" is intentionally excluded here — that transition
 * happens only through the stock-check/complete or items PATCH (quote) routes,
 * which perform price calculations and item adjustments.
 */
const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  submitted: ["cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: ["ordered", "cancelled"],
  ordered: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function getAllowedNextStatuses(from: OrderStatus): OrderStatus[] {
  return allowedTransitions[from] ?? [];
}
