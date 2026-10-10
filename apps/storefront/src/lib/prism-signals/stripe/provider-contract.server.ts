import "server-only";
import type Stripe from "stripe";
import type { PrismStripeSandboxConfigV1 } from "./config.server";

export type PrismStripePriceProblemV1 =
  | "price_not_active"
  | "price_is_live"
  | "wrong_price"
  | "wrong_product"
  | "wrong_currency"
  | "wrong_amount"
  | "wrong_billing_scheme"
  | "not_recurring"
  | "wrong_interval"
  | "metered_usage";

function providerId(value: string | { readonly id: string }): string {
  return typeof value === "string" ? value : value.id;
}

/** Exact remote attestation required before a new Checkout reservation. */
export function prismStripePriceProblems(
  price: Stripe.Price,
  config: PrismStripeSandboxConfigV1,
): readonly PrismStripePriceProblemV1[] {
  const problems: PrismStripePriceProblemV1[] = [];
  if (!price.active) problems.push("price_not_active");
  if (price.livemode) problems.push("price_is_live");
  if (price.id !== config.priceId) problems.push("wrong_price");
  if (providerId(price.product) !== config.productId) {
    problems.push("wrong_product");
  }
  if (price.currency !== config.currency) problems.push("wrong_currency");
  if (price.unit_amount !== config.unitAmountMinor) problems.push("wrong_amount");
  if (price.billing_scheme !== "per_unit") {
    problems.push("wrong_billing_scheme");
  }
  if (price.type !== "recurring" || price.recurring === null) {
    problems.push("not_recurring");
  } else {
    if (
      price.recurring.interval !== config.interval ||
      price.recurring.interval_count !== 1
    ) {
      problems.push("wrong_interval");
    }
    if (price.recurring.usage_type !== "licensed") {
      problems.push("metered_usage");
    }
  }
  return Object.freeze(problems);
}

export type PrismStripePortalProblemV1 =
  | "portal_not_active"
  | "portal_is_live"
  | "wrong_portal_configuration"
  | "payment_method_update_disabled"
  | "invoice_history_disabled"
  | "cancellation_disabled"
  | "cancellation_not_at_period_end"
  | "customer_update_enabled"
  | "plan_switching_enabled";

/** The dedicated portal may manage cards/invoices and cancel only at period end. */
export function prismStripePortalConfigurationProblems(
  portal: Stripe.BillingPortal.Configuration,
  config: PrismStripeSandboxConfigV1,
): readonly PrismStripePortalProblemV1[] {
  const problems: PrismStripePortalProblemV1[] = [];
  if (!portal.active) problems.push("portal_not_active");
  if (portal.livemode) problems.push("portal_is_live");
  if (
    config.portalConfigurationId === null ||
    portal.id !== config.portalConfigurationId
  ) {
    problems.push("wrong_portal_configuration");
  }
  if (!portal.features.payment_method_update.enabled) {
    problems.push("payment_method_update_disabled");
  }
  if (!portal.features.invoice_history.enabled) {
    problems.push("invoice_history_disabled");
  }
  if (!portal.features.subscription_cancel.enabled) {
    problems.push("cancellation_disabled");
  } else if (portal.features.subscription_cancel.mode !== "at_period_end") {
    problems.push("cancellation_not_at_period_end");
  }
  if (portal.features.subscription_update.enabled) {
    problems.push("plan_switching_enabled");
  }
  if (portal.features.customer_update.enabled) {
    problems.push("customer_update_enabled");
  }
  return Object.freeze(problems);
}

export type PrismStripeAccountProblemV1 = "wrong_account";

/** Proves the key resolves to the one separately configured test account. */
export function prismStripeAccountProblems(
  account: Pick<Stripe.Account, "id">,
  config: PrismStripeSandboxConfigV1,
): readonly PrismStripeAccountProblemV1[] {
  return account.id === config.accountId
    ? Object.freeze([])
    : Object.freeze(["wrong_account"] as const);
}
