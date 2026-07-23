import { describe, expect, it } from "vitest";

import {
  entitlementValuesForKnownPlan,
  entitlementValuesForPlanKey,
} from "~/constants/entitlement-contract";

function featureEntries(entitlements: ReturnType<typeof entitlementValuesForPlanKey>) {
  return Object.entries(entitlements).filter(([key]) =>
    key.startsWith("feature"),
  );
}

describe("RewardsPro entitlement contract", () => {
  it("gives Free every core feature without white-label or priority support", () => {
    const entitlements = entitlementValuesForPlanKey("free");
    const differentiators = new Set([
      "featureWhiteLabel",
      "featurePrioritySupport",
    ]);

    expect(entitlements.featureWhiteLabel).toBe(false);
    expect(entitlements.featurePrioritySupport).toBe(false);

    for (const [feature, enabled] of featureEntries(entitlements)) {
      if (!differentiators.has(feature)) {
        expect(enabled, `${feature} should be available on Free`).toBe(true);
      }
    }
  });

  it("reserves white-label controls and priority support for Corporate", () => {
    const entitlements = entitlementValuesForPlanKey("ultra");

    expect(entitlements.featureWhiteLabel).toBe(true);
    expect(entitlements.featurePrioritySupport).toBe(true);
    expect(featureEntries(entitlements).every(([, enabled]) => enabled)).toBe(
      true,
    );
  });

  it("projects exact Free and Corporate capacities into persisted entitlements", () => {
    expect(entitlementValuesForPlanKey("free")).toMatchObject({
      limitMaxOrders: 1_000,
      limitMaxTiers: 5,
      limitMaxAutomations: 5,
      limitMaxCustomersSync: 10_000,
      limitMaxHistoricalDays: 365,
      limitMaxTierProducts: 5,
      limitMaxEmails: 1_000,
      limitMaxActiveRaffles: 3,
      limitMaxActiveMysteryBoxes: 3,
      limitMaxActiveChallenges: 5,
      limitMaxCampaigns: 5,
      limitMaxAutomationFlows: 3,
    });

    expect(entitlementValuesForPlanKey("ultra")).toMatchObject({
      limitMaxOrders: 100_000,
      limitMaxTiers: 999_999,
      limitMaxAutomations: 999_999,
      limitMaxCustomersSync: 999_999,
      limitMaxHistoricalDays: 999_999,
      limitMaxTierProducts: 999_999,
      limitMaxEmails: 100_000,
      limitMaxActiveRaffles: 999_999,
      limitMaxActiveMysteryBoxes: 999_999,
      limitMaxActiveChallenges: 999_999,
      limitMaxCampaigns: 999_999,
      limitMaxAutomationFlows: 999_999,
    });
  });

  it("rejects unknown paid-plan identifiers instead of downgrading to Free", () => {
    expect(() => entitlementValuesForKnownPlan("RewardsPro Mystery")).toThrow(
      "Unknown RewardsPro plan: RewardsPro Mystery",
    );
  });
});
