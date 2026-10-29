import type Stripe from "stripe";

/**
 * Data-API subscriptions (docs/plans/tcg-data-platform/paid-data-api.md §6).
 * Their Checkout Sessions, subscriptions and the subscriptions' invoices
 * carry this metadata.type, and only POST /api/webhooks/stripe/data-api acts
 * on them: retail fulfilment, the reconcile cron and the main webhook's
 * subscription handlers leave them alone.
 */
export const DATA_API_SUBSCRIPTION_TYPE = "data_api_subscription";

export function isDedicatedCheckoutSessionType(type: string | null | undefined): boolean {
  // Retired retail Checkout Sessions are deliberately untyped. Treat every
  // present type as owned by a dedicated flow, including future/unknown
  // values, so a new module can never silently mint retail orders/rewards.
  return Boolean(type);
}

export function checkoutSessionOwner(
  session: Stripe.Checkout.Session,
): "retail" | "market_trade" | "dedicated" {
  if (session.metadata?.type === "market_trade_payment") return "market_trade";
  if (
    session.metadata?.b2b_channel === "wholesale"
    || isDedicatedCheckoutSessionType(session.metadata?.type)
  ) {
    return "dedicated";
  }
  return "retail";
}

type MetadataCarrier = { metadata?: Stripe.Metadata | null } | null | undefined;

/**
 * Whether a subscription or invoice belongs to the data-API stack. A
 * subscription carries the type itself; an invoice carries a copy of its
 * subscription's metadata (parent.subscription_details in the pinned API
 * version, subscription_details in older event payloads). Charges, refunds,
 * disputes and payment intents carry no copy, so they cannot be told apart
 * from the object alone.
 */
export function isDataApiSubscriptionObject(object: unknown): boolean {
  if (typeof object !== "object" || object === null) return false;
  const value = object as MetadataCarrier & {
    parent?: { subscription_details?: MetadataCarrier } | null;
    subscription_details?: MetadataCarrier;
  };
  return [
    value.metadata,
    value.parent?.subscription_details?.metadata,
    value.subscription_details?.metadata,
  ].some((metadata) => metadata?.type === DATA_API_SUBSCRIPTION_TYPE);
}
