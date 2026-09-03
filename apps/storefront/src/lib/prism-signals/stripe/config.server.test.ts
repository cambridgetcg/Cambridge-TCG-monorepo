import { describe, expect, it, vi } from "vitest";
import {
  PRISM_STRIPE_API_VERSION,
  PrismStripeConfigurationError,
  inspectPrismStripeSandboxConfig,
  prismStripeSandboxPublicPosture,
  readPrismStripeSandboxConfig,
  type PrismStripeEnvironmentV1,
} from "./config.server";

vi.mock("server-only", () => ({}));

function environment(
  overrides: Partial<PrismStripeEnvironmentV1> = {},
): PrismStripeEnvironmentV1 {
  return {
    PRISM_STRIPE_POSTURE: "stripe-test-v1",
    PRISM_STRIPE_SECRET_KEY: `rk_test_${"r".repeat(32)}`,
    PRISM_STRIPE_KEY_PERMISSION_ATTESTATION: "prism-runtime-rk-v1",
    PRISM_STRIPE_WEBHOOK_SECRET: `whsec_${"b".repeat(32)}`,
    PRISM_STRIPE_ACCOUNT_ID: "acct_prismtest123",
    PRISM_STRIPE_API_VERSION: PRISM_STRIPE_API_VERSION,
    PRISM_STRIPE_ALL_PRICE_ID: "price_prismtest123",
    PRISM_STRIPE_EXPECTED_PRODUCT_ID: "prod_prismtest123",
    PRISM_STRIPE_PORTAL_CONFIGURATION_ID: "bpc_prismtest123",
    PRISM_STRIPE_REFERENCE_SECRET:
      "valid-fixture-reference-secret-for-tests-only",
    PRISM_STRIPE_CHECKOUT_INTAKE: "enabled",
    PRISM_STRIPE_WEBHOOK_PROCESSING: "enabled",
    ...overrides,
  };
}

describe("PRISM Stripe sandbox configuration", () => {
  it("accepts only a complete pinned test-account posture", () => {
    const config = readPrismStripeSandboxConfig(environment());
    expect(config).toMatchObject({
      environment: "test",
      apiVersion: "2026-02-25.clover",
      currency: "gbp",
      unitAmountMinor: 500,
      interval: "month",
      checkoutIntakeEnabled: true,
      webhookProcessingEnabled: true,
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.secretKey).toMatch(/^rk_test_/);
  });

  it.each([
    { PRISM_STRIPE_SECRET_KEY: `sk_test_${"a".repeat(32)}` },
    { PRISM_STRIPE_SECRET_KEY: `sk_live_${"a".repeat(32)}` },
    { PRISM_STRIPE_KEY_PERMISSION_ATTESTATION: "unreviewed" },
    { PRISM_STRIPE_WEBHOOK_SECRET: "whsec_short" },
    { PRISM_STRIPE_ACCOUNT_ID: "acct_" },
    { PRISM_STRIPE_API_VERSION: "2025-01-01.acacia" },
    { PRISM_STRIPE_ALL_PRICE_ID: "prod_wrongkind123" },
    { PRISM_STRIPE_EXPECTED_PRODUCT_ID: "price_wrongkind123" },
    { PRISM_STRIPE_REFERENCE_SECRET: "short" },
  ])("rejects credential/schema drift %#", (drift) => {
    expect(() => readPrismStripeSandboxConfig(environment(drift))).toThrow(
      PrismStripeConfigurationError,
    );
  });

  it("keeps lifecycle processing readable when acquisition controls drift", () => {
    const config = readPrismStripeSandboxConfig(
      environment({
        PRISM_STRIPE_PORTAL_CONFIGURATION_ID: "wrong",
        PRISM_STRIPE_CHECKOUT_INTAKE: "typo",
      }),
    );
    expect(config.webhookProcessingEnabled).toBe(true);
    expect(config.checkoutIntakeEnabled).toBe(false);
    expect(config.portalConfigurationId).toBeNull();
    expect(prismStripeSandboxPublicPosture(environment({
      PRISM_STRIPE_PORTAL_CONFIGURATION_ID: "wrong",
    }))).toEqual({
      configured: true,
      processing_available: true,
      checkout_available: false,
      portal_available: false,
      reason: "portal_unconfigured",
    });
  });

  it("returns a bounded non-secret fail-closed posture", () => {
    expect(inspectPrismStripeSandboxConfig({})).toEqual({
      ok: false,
      reason: "not_configured",
    });
    const posture = prismStripeSandboxPublicPosture(environment());
    expect(posture).toEqual({
      configured: true,
      processing_available: true,
      checkout_available: true,
      portal_available: true,
      reason: "available",
    });
    expect(JSON.stringify(posture)).not.toMatch(/rk_test|whsec|price_|prod_|bpc_|acct_/);
  });
});
