import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  RETAIL_CHECKOUT_RETIRED_AT_UNIX,
  isLegacyRetailCheckoutSession,
} from "./checkout-session-kind";

function session(
  metadata: Stripe.Metadata | null,
  created = RETAIL_CHECKOUT_RETIRED_AT_UNIX - 1,
): Pick<Stripe.Checkout.Session, "created" | "metadata"> {
  return { created, metadata };
}

describe("isLegacyRetailCheckoutSession", () => {
  it("accepts only a pre-retirement session with positive retail SKU evidence", () => {
    expect(isLegacyRetailCheckoutSession(session({
      skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]),
    }))).toBe(true);
    expect(isLegacyRetailCheckoutSession(session(
      { skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]) },
      RETAIL_CHECKOUT_RETIRED_AT_UNIX,
    ))).toBe(true);
    expect(isLegacyRetailCheckoutSession(session(null))).toBe(false);
    expect(isLegacyRetailCheckoutSession(session({}))).toBe(false);
    expect(isLegacyRetailCheckoutSession(session({ skus: "[]" }))).toBe(false);
    expect(isLegacyRetailCheckoutSession(session({ skus: "not-json" }))).toBe(false);
  });

  it.each([
    "market_trade_payment",
    "market_lot_payment",
    "auction_payment",
    "tier_subscription",
    "platinum_subscription",
    "future_named_payment_flow",
  ])("keeps named flow %s out of customer_orders", (type) => {
    expect(isLegacyRetailCheckoutSession(session({ type }))).toBe(false);
  });

  it("keeps B2B sessions out even when they have no metadata.type", () => {
    expect(isLegacyRetailCheckoutSession(session({ b2b_channel: "wholesale" }))).toBe(false);
  });

  it("treats present-but-empty ownership markers as non-retail", () => {
    expect(isLegacyRetailCheckoutSession(session({
      type: "",
      skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]),
    }))).toBe(false);
    expect(isLegacyRetailCheckoutSession(session({
      b2b_channel: "",
      skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]),
    }))).toBe(false);
  });

  it("rejects every newly-created untyped session after the till retired", () => {
    expect(isLegacyRetailCheckoutSession(session(
      { skus: JSON.stringify([{ sku: "OP-OP01-001-JP", qty: 1 }]) },
      RETAIL_CHECKOUT_RETIRED_AT_UNIX + 1,
    ))).toBe(false);
  });
});
