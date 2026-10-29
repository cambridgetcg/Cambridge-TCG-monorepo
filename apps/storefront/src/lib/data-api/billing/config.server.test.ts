import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DATA_API_PAID_PLAN_IDS,
  DATA_API_STRIPE_API_VERSION,
  inspectDataApiBillingConfig,
  planForPrice,
  readDataApiBillingConfig,
  type DataApiBillingEnvironment,
} from "./config.server";

const valid: DataApiBillingEnvironment = {
  DATA_API_STRIPE_SECRET_KEY: "rk_test_fixture_dataapi_0000001",
  DATA_API_STRIPE_WEBHOOK_SECRET: "whsec_fixture_dataapi_00000001",
  DATA_API_STRIPE_PRICE_PRO: "price_dataapipro0001",
  DATA_API_STRIPE_PRICE_BUSINESS: "price_dataapibiz0001",
};

describe("data-API billing configuration", () => {
  it("is not configured when nothing is set, and closed by default", () => {
    expect(inspectDataApiBillingConfig({})).toEqual({ ok: false, reason: "not_configured" });
    expect(inspectDataApiBillingConfig({ DATA_API_CHECKOUT_INTAKE: "test" })).toEqual({ ok: false, reason: "not_configured" });
    expect(readDataApiBillingConfig(valid).intake).toBe("closed");
  });

  it("accepts restricted and secret test keys, trimmed", () => {
    for (const key of ["rk_test_fixture_dataapi_0000001", "sk_test_fixture_dataapi_0000001"]) {
      const config = readDataApiBillingConfig({ ...valid, DATA_API_STRIPE_SECRET_KEY: `  ${key}\n` });
      expect(config).toMatchObject({ environment: "test", apiVersion: DATA_API_STRIPE_API_VERSION, secretKey: key });
      expect(Object.isFrozen(config) && Object.isFrozen(config.prices)).toBe(true);
    }
  });

  it.each([
    "sk_live_fixture_dataapi_0000001",
    "rk_live_fixture_dataapi_0000001",
    "pk_test_fixture_dataapi_0000001",
    "sk_test_short",
    "sk_test_fixture dataapi_0000001",
    "whsec_fixture_dataapi_00000001",
  ])("refuses %s as the secret key: unavailable, never live", (key) => {
    expect(inspectDataApiBillingConfig({ ...valid, DATA_API_STRIPE_SECRET_KEY: key })).toEqual({ ok: false, reason: "invalid_configuration" });
    expect(() => readDataApiBillingConfig({ ...valid, DATA_API_STRIPE_SECRET_KEY: key })).toThrow(/test-mode key/);
  });

  it("names the variable at fault, never its value", () => {
    const live = "sk_live_fixture_dataapi_nameonly_01";
    try {
      readDataApiBillingConfig({ ...valid, DATA_API_STRIPE_SECRET_KEY: live });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).toContain("DATA_API_STRIPE_SECRET_KEY");
      expect(String((error as Error).message)).not.toContain(live);
    }
  });

  it.each<[string, DataApiBillingEnvironment]>([
    ["a missing webhook secret", { ...valid, DATA_API_STRIPE_WEBHOOK_SECRET: "" }],
    ["a webhook secret of the wrong kind", { ...valid, DATA_API_STRIPE_WEBHOOK_SECRET: "sk_test_fixture_dataapi_0000001" }],
    ["a missing Pro price", { ...valid, DATA_API_STRIPE_PRICE_PRO: undefined }],
    ["a product id as the Business price", { ...valid, DATA_API_STRIPE_PRICE_BUSINESS: "prod_dataapibiz0001" }],
    ["one price for both plans", { ...valid, DATA_API_STRIPE_PRICE_BUSINESS: valid.DATA_API_STRIPE_PRICE_PRO }],
  ])("refuses %s", (_label, env) => {
    expect(inspectDataApiBillingConfig(env)).toEqual({ ok: false, reason: "invalid_configuration" });
  });

  it("takes checkout intake from posture.ts: test only when exactly 'test'", () => {
    expect(readDataApiBillingConfig({ ...valid, DATA_API_CHECKOUT_INTAKE: "test" }).intake).toBe("test");
    for (const value of ["", "open", "live", "TEST", "on", undefined]) {
      expect(readDataApiBillingConfig({ ...valid, DATA_API_CHECKOUT_INTAKE: value }).intake).toBe("closed");
    }
  });

  it("pins the billing portal configuration when one is set, and leaves it null (portal and checkout shut) when not", () => {
    expect(readDataApiBillingConfig(valid).portalConfigurationId).toBeNull();
    expect(readDataApiBillingConfig({ ...valid, DATA_API_STRIPE_PORTAL_CONFIGURATION: " bpc_dataapiportal01\n" }).portalConfigurationId).toBe("bpc_dataapiportal01");
    for (const value of ["bpc_", "bps_dataapiportal01", "price_dataapipro0001", "bpc_dataapi portal01"]) {
      expect(inspectDataApiBillingConfig({ ...valid, DATA_API_STRIPE_PORTAL_CONFIGURATION: value })).toEqual({ ok: false, reason: "invalid_configuration" });
      expect(() => readDataApiBillingConfig({ ...valid, DATA_API_STRIPE_PORTAL_CONFIGURATION: value })).toThrow(/DATA_API_STRIPE_PORTAL_CONFIGURATION/);
    }
    // Alone it configures nothing.
    expect(inspectDataApiBillingConfig({ DATA_API_STRIPE_PORTAL_CONFIGURATION: "bpc_dataapiportal01" })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("maps only the configured price ids to plans", () => {
    const config = readDataApiBillingConfig(valid);
    expect(DATA_API_PAID_PLAN_IDS).toEqual(["pro", "business"]);
    expect(planForPrice(config, "price_dataapipro0001")).toBe("pro");
    expect(planForPrice(config, "price_dataapibiz0001")).toBe("business");
    for (const other of ["price_somethingelse1", "", null, undefined, 1200]) expect(planForPrice(config, other)).toBeNull();
  });

  it("has no live-key branch and no fallback to another Stripe integration", () => {
    const source = readFileSync(new URL("./config.server.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/_live_|STRIPE_SECRET_KEY\b(?<!DATA_API_STRIPE_SECRET_KEY)|PRISM_STRIPE/);
    expect(source).not.toMatch(/process\.env\.STRIPE_/);
  });
});
