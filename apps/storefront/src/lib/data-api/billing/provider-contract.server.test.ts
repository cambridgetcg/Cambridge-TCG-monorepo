import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DATA_API_PLANS } from "../plans";
import { readDataApiBillingConfig } from "./config.server";
import { dataApiPortalConfigurationProblems, dataApiPriceProblems } from "./provider-contract.server";

const ENV = {
  DATA_API_STRIPE_SECRET_KEY: "rk_test_fixture_dataapi_0000001",
  DATA_API_STRIPE_WEBHOOK_SECRET: "whsec_fixture_dataapi_00000001",
  DATA_API_STRIPE_PRICE_PRO: "price_dataapipro0001",
  DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapibiz0001",
};
const config = readDataApiBillingConfig({ ...ENV, DATA_API_STRIPE_PORTAL_CONFIGURATION: "bpc_dataapiportal01" });

/** A price as Stripe returns it with its product expanded, as the setup script makes it. */
function price(plan: "pro" | "business", overrides: Record<string, unknown> = {}, product: Record<string, unknown> = {}): Stripe.Price {
  return {
    id: config.prices[plan], object: "price", active: true, livemode: false, type: "recurring", billing_scheme: "per_unit",
    currency: "gbp", unit_amount: DATA_API_PLANS[plan].price.amountPence,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed", meter: null, trial_period_days: null },
    product: { id: `ctcg_data_api_${plan}`, object: "product", active: true, livemode: false, metadata: { type: "data_api_subscription", plan, catalogue: "data-api-plans/2026-10-28.1" }, ...product },
    ...overrides,
  } as unknown as Stripe.Price;
}

function portal(overrides: { cancel?: Record<string, unknown>; update?: Record<string, unknown>; top?: Record<string, unknown> } = {}): Stripe.BillingPortal.Configuration {
  return {
    id: "bpc_dataapiportal01", object: "billing_portal.configuration", active: true, livemode: false, is_default: false,
    features: {
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none", cancellation_reason: { enabled: false, options: [] }, ...overrides.cancel },
      subscription_update: {
        enabled: true, default_allowed_updates: ["price"], proration_behavior: "none",
        products: [
          { product: "ctcg_data_api_pro", prices: [config.prices.pro], adjustable_quantity: { enabled: false, maximum: null, minimum: 1 } },
          { product: "ctcg_data_api_business", prices: [config.prices.business], adjustable_quantity: { enabled: false, maximum: null, minimum: 1 } },
        ],
        ...overrides.update,
      },
      payment_method_update: { enabled: true }, invoice_history: { enabled: true }, customer_update: { enabled: false, allowed_updates: [] },
    },
    ...overrides.top,
  } as unknown as Stripe.BillingPortal.Configuration;
}

describe("data-API price attestation before checkout", () => {
  it("accepts each plan's own price, as the setup script creates it", () => {
    expect(dataApiPriceProblems(price("pro"), "pro", config)).toEqual([]);
    expect(dataApiPriceProblems(price("business"), "business", config)).toEqual([]);
  });

  it.each<[string, "pro" | "business", Stripe.Price, string[]]>([
    ["an archived price", "pro", price("pro", { active: false }), ["price_not_active"]],
    ["a live price", "pro", price("pro", { livemode: true }), ["price_is_live"]],
    ["the Business price sold as Pro (swapped variables)", "pro", price("business"), ["wrong_price", "wrong_amount", "wrong_product"]],
    ["another currency", "pro", price("pro", { currency: "eur" }), ["wrong_currency"]],
    ["another amount", "business", price("business", { unit_amount: DATA_API_PLANS.business.price.amountPence + 1 }), ["wrong_amount"]],
    ["a tiered price with no unit amount", "pro", price("pro", { unit_amount: null, billing_scheme: "tiered" }), ["wrong_amount"]],
    ["a one-off price", "pro", price("pro", { type: "one_time", recurring: null }), ["not_recurring"]],
    ["a yearly price", "pro", price("pro", { recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } }), ["wrong_interval"]],
    ["a two-monthly price", "pro", price("pro", { recurring: { interval: "month", interval_count: 2, usage_type: "licensed" } }), ["wrong_interval"]],
    ["a metered price", "pro", price("pro", { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }), ["metered_usage"]],
    ["another product's test price", "pro", price("pro", {}, { metadata: { type: "prism_signals_subscription" } }), ["wrong_product"]],
    ["the other plan's product", "pro", price("pro", {}, { metadata: { type: "data_api_subscription", plan: "business" } }), ["wrong_product"]],
    ["a product not expanded", "pro", price("pro", { product: "ctcg_data_api_pro" }), ["wrong_product"]],
    ["a deleted product", "pro", price("pro", { product: { id: "ctcg_data_api_pro", object: "product", deleted: true } }), ["wrong_product"]],
  ])("refuses %s", (_label, plan, given, problems) => {
    expect(dataApiPriceProblems(given, plan, config)).toEqual(problems);
  });
});

describe("data-API portal configuration attestation", () => {
  it("accepts the pinned configuration: the two plans' prices only, no quantity change, cancellation at period end", () => {
    expect(dataApiPortalConfigurationProblems(portal(), config)).toEqual([]);
    // Plan switching off altogether is fine too; cancellation stays.
    expect(dataApiPortalConfigurationProblems(portal({ update: { enabled: false, products: undefined } }), config)).toEqual([]);
  });

  it.each<[string, Stripe.BillingPortal.Configuration, string[]]>([
    ["an inactive configuration", portal({ top: { active: false } }), ["portal_not_active"]],
    ["a live configuration", portal({ top: { livemode: true } }), ["portal_is_live"]],
    ["another configuration (the account default, say)", portal({ top: { id: "bpc_accountdefault1", is_default: true } }), ["wrong_portal_configuration"]],
    ["cancellation off", portal({ cancel: { enabled: false } }), ["cancellation_disabled"]],
    ["immediate cancellation", portal({ cancel: { mode: "immediately" } }), ["cancellation_not_at_period_end"]],
    ["quantity among the allowed updates", portal({ update: { default_allowed_updates: ["price", "quantity"] } }), ["quantity_changes_enabled"]],
    ["an adjustable quantity", portal({ update: { products: [{ product: "ctcg_data_api_pro", prices: [config.prices.pro], adjustable_quantity: { enabled: true, maximum: 99, minimum: 1 } }] } }), ["quantity_changes_enabled"]],
    ["another price offered", portal({ update: { products: [{ product: "prod_prism", prices: ["price_prismtest0001"], adjustable_quantity: { enabled: false, maximum: null, minimum: 1 } }] } }), ["unconfigured_price_offered"]],
    ["a retired price still offered beside the plan's", portal({ update: { products: [{ product: "ctcg_data_api_pro", prices: [config.prices.pro, "price_retiredpro01"], adjustable_quantity: { enabled: false, maximum: null, minimum: 1 } }] } }), ["unconfigured_price_offered"]],
    ["products not expanded, so unverifiable", portal({ update: { products: undefined } }), ["plan_switching_unverified"]],
  ])("refuses %s", (_label, given, problems) => {
    expect(dataApiPortalConfigurationProblems(given, config)).toEqual(problems);
  });

  it("refuses every configuration while none is pinned", () => {
    expect(dataApiPortalConfigurationProblems(portal(), readDataApiBillingConfig(ENV))).toEqual(["wrong_portal_configuration"]);
  });
});
