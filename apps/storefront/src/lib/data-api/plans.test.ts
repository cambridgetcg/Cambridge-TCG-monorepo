import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
import { MEMBER_KEY_LIMIT, MEMBER_REQUESTS_PER_MINUTE } from "../datafeed/member-keys";
import { DATA_API_PLANS, DATA_API_PLANS_VERSION, DATA_API_PLAN_IDS, entitlementFor, type DataApiPlanId } from "./plans";

const plans = DATA_API_PLAN_IDS.map(id => DATA_API_PLANS[id]);

describe("data-API plan catalogue", () => {
  it("carries the proposed table as integer pence, ex VAT, versioned", () => {
    expect(DATA_API_PLANS_VERSION).toBe("data-api-plans/2026-10-28.1");
    expect(DATA_API_PLAN_IDS).toEqual(["free", "pro", "business"]);
    expect(plans.map(plan => [plan.id, plan.price.amountPence, plan.requestsPerMinutePerKey, plan.requestsPerMonthPerAccount, plan.historyDays, plan.maxActiveKeys])).toEqual([
      ["free", 0, 30, 100_000, 365, 5],
      ["pro", 1200, 120, 1_000_000, null, 10],
      ["business", 6000, 600, 10_000_000, null, 25],
    ]);
    for (const plan of plans) {
      expect(DATA_API_PLANS[plan.id].id).toBe(plan.id);
      expect(Number.isSafeInteger(plan.price.amountPence)).toBe(true);
      expect(plan.price).toMatchObject({ currency: "GBP", interval: "month", vat: "excluded", proposed: true });
      expect(plan.permittedUse.trim()).not.toBe("");
    }
    expect(plans.map(plan => plan.permittedUse)).toEqual([
      "Your own use, including pricing your own stock.",
      "Internal business use and apps.",
      "Commercial redisplay, with attribution.",
    ]);
  });

  it("gives every plan the same derived data; paid tiers only add scale", () => {
    for (const plan of plans) {
      expect(plan.features).toEqual(DATA_API_PLANS.free.features);
      expect(plan.requestsPerMinutePerKey).toBeGreaterThanOrEqual(DATA_API_PLANS.free.requestsPerMinutePerKey);
      expect(plan.requestsPerMonthPerAccount).toBeGreaterThanOrEqual(DATA_API_PLANS.free.requestsPerMonthPerAccount);
      expect(plan.maxActiveKeys).toBeGreaterThanOrEqual(DATA_API_PLANS.free.maxActiveKeys);
      if (plan.historyDays !== null) expect(plan.historyDays).toBeGreaterThanOrEqual(DATA_API_PLANS.free.historyDays!);
    }
    expect(DATA_API_PLANS.free.features).toEqual(["reference-prices", "reference-history", "indices", "premiums", "daily-export"]);
  });

  it("keeps the free floor at today's member key limits", () => {
    expect(DATA_API_PLANS.free.requestsPerMinutePerKey).toBe(MEMBER_REQUESTS_PER_MINUTE);
    expect(DATA_API_PLANS.free.maxActiveKeys).toBe(MEMBER_KEY_LIMIT);
  });

  it("fits every plan's per-minute limit in 0142's own saturating buckets, leaving the free route's alone", () => {
    const sql = readFileSync(new URL("../../../drizzle/0142_data_api_plans.sql", import.meta.url), "utf8");
    const bound = /CREATE TABLE data_api_rate_buckets \([^;]*request_count integer NOT NULL CHECK \(request_count BETWEEN 1 AND (\d+)\)/.exec(sql);
    expect(bound).not.toBeNull();
    expect(Number(bound![1])).toBeGreaterThanOrEqual(Math.max(...plans.map(plan => plan.requestsPerMinutePerKey)) + 1);
    expect(sql).not.toMatch(/ALTER TABLE member_data_rate_buckets/);
  });

  it("is frozen and server-agnostic", () => {
    expect(Object.isFrozen(DATA_API_PLANS)).toBe(true);
    for (const plan of plans) { expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.features)).toBe(true); }
    const source = readFileSync(new URL("./plans.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/process\.env|server-only|stripe\(/i);
  });
});

describe("entitlementFor", () => {
  it("defaults an account without an active subscription to free", () => {
    expect(entitlementFor(null)).toEqual(entitlementFor("free"));
    expect(entitlementFor(null)).toEqual({
      planId: "free", catalogueVersion: DATA_API_PLANS_VERSION,
      requestsPerMinutePerKey: 30, requestsPerMonthPerAccount: 100_000, historyDays: 365, maxActiveKeys: 5,
      features: DATA_API_PLANS.free.features,
    });
  });

  it.each(DATA_API_PLAN_IDS)("returns %s limits without prices or terms", id => {
    const entitlement = entitlementFor(id);
    const plan = DATA_API_PLANS[id];
    expect(entitlement).toMatchObject({
      planId: id, requestsPerMinutePerKey: plan.requestsPerMinutePerKey,
      requestsPerMonthPerAccount: plan.requestsPerMonthPerAccount, historyDays: plan.historyDays, maxActiveKeys: plan.maxActiveKeys,
    });
    expect(entitlement).not.toHaveProperty("price");
    expect(entitlement).not.toHaveProperty("permittedUse");
    expect(Object.isFrozen(entitlement)).toBe(true);
  });

  it.each(["enterprise", "", "FREE", "Pro", undefined])("refuses an unknown plan id %j rather than guessing", id => {
    expect(() => entitlementFor(id as unknown as DataApiPlanId)).toThrow(TypeError);
  });
});
