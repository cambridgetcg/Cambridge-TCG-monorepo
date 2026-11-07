/**
 * What the Orders page says about an order's cashback and customer.
 *
 * An order's CASHBACK_EARNED entry records the rate and tier its cashback was
 * worked out at (webhooks.orders.paid.tsx, and both order syncs). The Order
 * row's own cashbackPercent and tierNameAtOrder are written earlier, before
 * the order's tier step, so they say 0% and no tier for a customer whose
 * first tier came with that order.
 */

type CashbackEntry = { metadata?: unknown } | null | undefined;

function entryMetadata(entry: CashbackEntry): Record<string, unknown> {
  const metadata = entry?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
}

/** The cashback percentage the order's cashback was worked out at, or null when nothing records one */
export function cashbackRateUsed(
  order: { cashbackPercent: number | null; cashbackPercentAtOrder: number | null },
  entry: CashbackEntry,
): number | null {
  const recorded = entryMetadata(entry).cashbackPercent;
  if (typeof recorded === "number") return recorded;
  if (order.cashbackPercentAtOrder !== null) return order.cashbackPercentAtOrder;
  return order.cashbackPercent ? order.cashbackPercent : null;
}

/** The tier the order's cashback was worked out at, or null when nothing records one */
export function cashbackTierUsed(order: { tierNameAtOrder: string | null }, entry: CashbackEntry): string | null {
  const recorded = entryMetadata(entry).tierName;
  return typeof recorded === "string" && recorded ? recorded : order.tierNameAtOrder;
}

/**
 * The customer's name, else an email. Every order on the page has a customer
 * (orders/paid and both order syncs skip guest checkouts), so none is called
 * a guest.
 */
export function orderCustomerName(
  customer: { firstName?: string | null; lastName?: string | null; email?: string | null } | null,
  orderEmail: string | null,
): string {
  const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ");
  return name || customer?.email || orderEmail || "No name or email";
}
