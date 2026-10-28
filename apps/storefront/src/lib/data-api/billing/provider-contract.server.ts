import "server-only";
import type Stripe from "stripe";
import { DATA_API_SUBSCRIPTION_TYPE } from "@/lib/payments/checkout-session-kind";
import { DATA_API_PLANS } from "../plans";
import { DATA_API_PAID_PLAN_IDS, type DataApiBillingConfig, type DataApiPaidPlanId } from "./config.server";

/**
 * What the data-API routes check on Stripe before they send an account there,
 * after PRISM's provider contract (lib/prism-signals/stripe/provider-contract.server.ts).
 * The configuration's own checks say an id is well formed; these say the
 * object it names is the one the catalogue sells. Problems are codes only:
 * no id, amount or account detail.
 */

export type DataApiPriceProblem =
  | "price_not_active"
  | "price_is_live"
  | "wrong_price"
  | "wrong_currency"
  | "wrong_amount"
  | "not_recurring"
  | "wrong_interval"
  | "metered_usage"
  | "wrong_product";

/** The price Checkout would sell for `plan`, retrieved with its product
 * expanded: active, test mode, the configured id, the plan's own currency and
 * amount (plans.ts), monthly, licensed (one seat, never metered), and a product
 * whose metadata names the data-API subscription and this plan, as
 * scripts/data-api-stripe-setup.ts creates it. A swapped Pro/Business id,
 * another product's test price or a changed amount all fail here. */
export function dataApiPriceProblems(
  price: Stripe.Price,
  plan: DataApiPaidPlanId,
  config: DataApiBillingConfig,
): readonly DataApiPriceProblem[] {
  const catalogue = DATA_API_PLANS[plan].price;
  const problems: DataApiPriceProblem[] = [];
  if (price.active !== true) problems.push("price_not_active");
  if (price.livemode !== false) problems.push("price_is_live");
  if (price.id !== config.prices[plan]) problems.push("wrong_price");
  if (price.currency !== catalogue.currency.toLowerCase()) problems.push("wrong_currency");
  if (price.unit_amount !== catalogue.amountPence) problems.push("wrong_amount");
  if (price.type !== "recurring" || price.recurring === null) {
    problems.push("not_recurring");
  } else {
    if (price.recurring.interval !== catalogue.interval || price.recurring.interval_count !== 1) problems.push("wrong_interval");
    if (price.recurring.usage_type !== "licensed") problems.push("metered_usage");
  }
  const product = price.product;
  const metadata = typeof product === "object" && product !== null && !("deleted" in product && product.deleted) ? product.metadata : null;
  if (metadata?.type !== DATA_API_SUBSCRIPTION_TYPE || metadata?.plan !== plan) problems.push("wrong_product");
  return Object.freeze(problems);
}

export type DataApiPortalProblem =
  | "portal_not_active"
  | "portal_is_live"
  | "wrong_portal_configuration"
  | "cancellation_disabled"
  | "cancellation_not_at_period_end"
  | "plan_switching_unverified"
  | "unconfigured_price_offered"
  | "quantity_changes_enabled";

/** The pinned portal configuration (DATA_API_STRIPE_PORTAL_CONFIGURATION),
 * retrieved with features.subscription_update.products expanded: active, test
 * mode, the configured id, cancellation on and only at period end, and, where
 * plan switching is on, no price but the two configured ones and no quantity
 * change. A switch to any other price, or another quantity, would leave a
 * subscription no plan answers. */
export function dataApiPortalConfigurationProblems(
  portal: Stripe.BillingPortal.Configuration,
  config: DataApiBillingConfig,
): readonly DataApiPortalProblem[] {
  const problems = new Set<DataApiPortalProblem>();
  if (portal.active !== true) problems.add("portal_not_active");
  if (portal.livemode !== false) problems.add("portal_is_live");
  if (config.portalConfigurationId === null || portal.id !== config.portalConfigurationId) problems.add("wrong_portal_configuration");
  const cancel = portal.features.subscription_cancel;
  if (!cancel.enabled) problems.add("cancellation_disabled");
  else if (cancel.mode !== "at_period_end") problems.add("cancellation_not_at_period_end");
  const update = portal.features.subscription_update;
  if (update.enabled) {
    if (update.default_allowed_updates.includes("quantity")) problems.add("quantity_changes_enabled");
    // An includable field: absent unless expanded, and then nothing can be checked.
    if (!Array.isArray(update.products)) {
      problems.add("plan_switching_unverified");
    } else {
      const configured = new Set(DATA_API_PAID_PLAN_IDS.map(plan => config.prices[plan]));
      if (update.products.some(product => product.prices.some(id => !configured.has(id)))) problems.add("unconfigured_price_offered");
      if (update.products.some(product => product.adjustable_quantity?.enabled === true)) problems.add("quantity_changes_enabled");
    }
  }
  return Object.freeze([...problems]);
}
