import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MANAGED_PLANS } from "~/constants/billing.constants";
import {
  PRICING_PLANS,
  PUBLIC_PLAN_KEYS,
  getBillingName,
  getPlanFeatureSummary,
  getPlanKey,
  getPlanPrice,
  requireKnownPlanKey,
  type PlanKey,
} from "~/constants/pricing-contract";

describe("RewardsPro pricing contract", () => {
  it("keeps the approved public catalogue, prices, and capacities exact", () => {
    expect(
      PUBLIC_PLAN_KEYS.map((key) => {
        const plan = PRICING_PLANS[key];
        return {
          key,
          displayName: plan.displayName,
          monthlyPrice: plan.monthlyPrice,
          annualPrice: plan.annualPrice,
          limits: plan.limits,
        };
      }),
    ).toEqual([
      {
        key: "free",
        displayName: "Free Forever",
        monthlyPrice: 0,
        annualPrice: null,
        limits: {
          orders: 1_000,
          tiers: 5,
          automations: 5,
          customersSync: 10_000,
          historicalDataDays: 365,
          tierProducts: 5,
          emails: 1_000,
          memberExportRows: 10_000,
          activeRaffles: 3,
          activeMysteryBoxes: 3,
          activeChallenges: 5,
          campaigns: 5,
          automationFlows: 3,
          emailNotifications: true,
          advancedAnalytics: true,
          apiAccess: true,
        },
      },
      {
        key: "pro",
        displayName: "Grow",
        monthlyPrice: 29,
        annualPrice: 290,
        limits: {
          orders: 10_000,
          tiers: 20,
          automations: 25,
          customersSync: 100_000,
          historicalDataDays: 999_999,
          tierProducts: 20,
          emails: 10_000,
          memberExportRows: 100_000,
          activeRaffles: 10,
          activeMysteryBoxes: 10,
          activeChallenges: 25,
          campaigns: 25,
          automationFlows: 15,
          emailNotifications: true,
          advancedAnalytics: true,
          apiAccess: true,
        },
      },
      {
        key: "max",
        displayName: "Scale",
        monthlyPrice: 79,
        annualPrice: 790,
        limits: {
          orders: 25_000,
          tiers: 50,
          automations: 100,
          customersSync: 500_000,
          historicalDataDays: 999_999,
          tierProducts: 50,
          emails: 25_000,
          memberExportRows: 500_000,
          activeRaffles: 25,
          activeMysteryBoxes: 25,
          activeChallenges: 100,
          campaigns: 100,
          automationFlows: 50,
          emailNotifications: true,
          advancedAnalytics: true,
          apiAccess: true,
        },
      },
      {
        key: "ultra",
        displayName: "Corporate",
        monthlyPrice: 499,
        annualPrice: 4_990,
        limits: {
          orders: 100_000,
          tiers: 999_999,
          automations: 999_999,
          customersSync: 999_999,
          historicalDataDays: 999_999,
          tierProducts: 999_999,
          emails: 100_000,
          memberExportRows: 999_999,
          activeRaffles: 999_999,
          activeMysteryBoxes: 999_999,
          activeChallenges: 999_999,
          campaigns: 999_999,
          automationFlows: 999_999,
          emailNotifications: true,
          advancedAnalytics: true,
          apiAccess: true,
        },
      },
    ]);
  });

  it("keeps annual billing identifiers and prices stable", () => {
    expect([
      {
        key: "pro",
        id: getBillingName("pro", "year"),
        price: getPlanPrice("pro", "year"),
      },
      {
        key: "max",
        id: getBillingName("max", "year"),
        price: getPlanPrice("max", "year"),
      },
      {
        key: "ultra",
        id: getBillingName("ultra", "year"),
        price: getPlanPrice("ultra", "year"),
      },
    ]).toEqual([
      { key: "pro", id: "RewardsPro Pro Annual", price: 290 },
      { key: "max", id: "RewardsPro Max Annual", price: 790 },
      { key: "ultra", id: "RewardsPro Ultra Annual", price: 4_990 },
    ]);
  });

  it.each([
    ["Free Forever", "free"],
    ["RewardsPro Free", "free"],
    ["Grow", "pro"],
    ["Starter", "pro"],
    ["proAnnual", "pro"],
    ["RewardsPro Pro Annual", "pro"],
    ["Scale", "max"],
    ["Growth", "max"],
    ["maxAnnual", "max"],
    ["RewardsPro Max Annual", "max"],
    ["Corporate", "ultra"],
    ["Unlimited", "ultra"],
    ["ultraAnnual", "ultra"],
    ["RewardsPro Ultra Annual", "ultra"],
  ] as const)("normalizes the %s identifier to %s", (identifier, planKey) => {
    expect(getPlanKey(identifier)).toBe(planKey);
  });

  it("never decreases a numeric capacity on a higher public plan", () => {
    const numericLimits = Object.entries(PRICING_PLANS.free.limits)
      .filter(([, value]) => typeof value === "number")
      .map(([limit]) => limit) as Array<
        keyof typeof PRICING_PLANS.free.limits
      >;

    for (const limit of numericLimits) {
      const values = PUBLIC_PLAN_KEYS.map(
        (planKey) => PRICING_PLANS[planKey].limits[limit],
      );

      for (let index = 1; index < values.length; index += 1) {
        expect(
          values[index],
          `${String(limit)} decreased between public plan tiers`,
        ).toBeGreaterThanOrEqual(values[index - 1]);
      }
    }
  });

  it("uses fixed pricing with zero trials and no overage billing", () => {
    for (const planKey of PUBLIC_PLAN_KEYS) {
      expect(PRICING_PLANS[planKey].trialDays).toBe(0);
    }

    for (const plan of Object.values(MANAGED_PLANS)) {
      expect(plan.overageRate).toBe(0);
      expect(plan).not.toHaveProperty("usageRate");
      expect(plan).not.toHaveProperty("usageCap");
    }
  });

  it("keeps the public landing's path for existing agreements and offers no plan to buy", () => {
    const landing = readFileSync(
      resolve(process.cwd(), "landing/public/index.html"),
      "utf8",
    );

    // Two frozen stores still hold paid charges from the old app until the owner cancels them in B4
    // (apps/rewards/docs/switch.md, Decision 20). The rebuild that production runs has no billing code
    // and no records page, and the old app's records sit only in schema `rewardspro` until B5, so the
    // landing promises those shops only a way to reach us, linked from the header. Merchant-facing
    // copy doesn't talk about retirement (docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md).
    // This check, the section and its header link go once B4 has cancelled both charges.
    expect(landing).toContain(
      "If your store has an existing paid agreement for RewardsPro, write to us about its records or about cancelling it.",
    );
    expect(landing).toContain('href="/#existing-agreements"');
    expect(landing).toContain('id="existing-agreements"');
    expect(landing).toContain('href="mailto:contact@rewardspro.io"');
    expect(landing).toContain("Existing account support");

    for (const planKey of PUBLIC_PLAN_KEYS) {
      const plan = PRICING_PLANS[planKey];
      expect(landing).not.toContain(`>$${plan.monthlyPrice} <span>/ month</span>`);
    }
    expect(landing).not.toContain("Free Forever includes");
    expect(landing).not.toMatch(/href=["'][^"']*\/(?:signup|subscribe|checkout)(?:[/?#"'])/i);
    expect(landing).not.toContain("$39 ");
    expect(landing).not.toContain("$149 ");
    expect(landing).not.toContain("Trials are available");
  });

  it("calls the monthly order number a guide, since orders past it still earn cashback", () => {
    // orders/paid credits cashback before it counts the order, and nothing locks
    expect(getPlanFeatureSummary("free")).toContain("1,000 orders/month guide (orders past it still earn cashback)");
    expect(getPlanFeatureSummary("enterprise")).toContain("Unlimited orders");
    for (const key of Object.keys(PRICING_PLANS) as PlanKey[]) {
      expect(getPlanFeatureSummary(key).join("\n")).not.toContain("reward-eligible orders");
    }
  });

  it("rejects unknown plans at strict contract boundaries", () => {
    expect(() => requireKnownPlanKey("RewardsPro Mystery")).toThrow(
      "Unknown RewardsPro plan: RewardsPro Mystery",
    );
  });
});
