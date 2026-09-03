import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { PrismStripeSandboxConfigV1 } from "./config.server";
import {
  prismStripeAccountProblems,
  prismStripePortalConfigurationProblems,
  prismStripePriceProblems,
} from "./provider-contract.server";

vi.mock("server-only", () => ({}));

const config = {
  priceId: "price_prismtest123",
  productId: "prod_prismtest123",
  accountId: "acct_prismtest123",
  portalConfigurationId: "bpc_prismtest123",
  currency: "gbp",
  unitAmountMinor: 500,
  interval: "month",
} as PrismStripeSandboxConfigV1;

function price(overrides: Record<string, unknown> = {}): Stripe.Price {
  return {
    id: config.priceId,
    active: true,
    livemode: false,
    product: config.productId,
    currency: "gbp",
    unit_amount: 500,
    billing_scheme: "per_unit",
    type: "recurring",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
    ...overrides,
  } as Stripe.Price;
}

function portal(overrides: Record<string, unknown> = {}) {
  return {
    id: config.portalConfigurationId,
    active: true,
    livemode: false,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: false },
      subscription_update: { enabled: false },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
    ...overrides,
  } as Stripe.BillingPortal.Configuration;
}

describe("PRISM Stripe remotely attested provider contract", () => {
  it("accepts only the exact active £5 licensed monthly test Price", () => {
    expect(prismStripePriceProblems(price(), config)).toEqual([]);
    expect(prismStripePriceProblems(price({
      active: false,
      livemode: true,
      product: "prod_foreign123",
      currency: "usd",
      unit_amount: 999,
      recurring: {
        interval: "year",
        interval_count: 1,
        usage_type: "metered",
      },
    }), config)).toEqual(expect.arrayContaining([
      "price_not_active",
      "price_is_live",
      "wrong_product",
      "wrong_currency",
      "wrong_amount",
      "wrong_interval",
      "metered_usage",
    ]));
  });

  it("limits the exact test portal to cards, invoices, and period-end cancel", () => {
    expect(prismStripePortalConfigurationProblems(portal(), config)).toEqual([]);
    expect(prismStripePortalConfigurationProblems(portal({
      livemode: true,
      features: {
        payment_method_update: { enabled: false },
        invoice_history: { enabled: false },
        customer_update: { enabled: true },
        subscription_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "immediately" },
      },
    }), config)).toEqual(expect.arrayContaining([
      "portal_is_live",
      "payment_method_update_disabled",
      "invoice_history_disabled",
      "customer_update_enabled",
      "plan_switching_enabled",
      "cancellation_not_at_period_end",
    ]));
  });

  it("binds provider calls to the one configured account", () => {
    expect(prismStripeAccountProblems({ id: config.accountId }, config)).toEqual([]);
    expect(prismStripeAccountProblems({ id: "acct_foreign123" }, config)).toEqual([
      "wrong_account",
    ]);
  });
});
