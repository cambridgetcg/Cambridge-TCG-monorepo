import type Stripe from "stripe";

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
