import { describe, expect, it } from "vitest";
import { PRICING_PLANS } from "../../../app/constants/pricing-contract";
import { entitlementValuesForPlanKey } from "../../../app/constants/entitlement-contract";
import {
  ENTITLEMENT_BOOLEAN_FIELDS,
  ENTITLEMENT_NUMERIC_FIELDS,
  FREE_FIRST_CATALOG_ID,
  REQUIRED_SHOP_ENTITLEMENT_COLUMNS,
  assertExpectedShopCount,
  assertRequiredColumns,
  mergeEntitlementsWithoutReduction,
  parseBackfillArgs,
  planShopBackfill,
  resolvePlanSignals,
  type ExistingEntitlements,
  type PlanSignal,
  type ShopBackfillInput,
} from "../../../scripts/lib/free-first-entitlement-backfill";

const NOW = new Date("2026-07-23T12:00:00.000Z");

describe("free-first entitlement backfill CLI guardrails", () => {
  it("is dry-run by default", () => {
    expect(parseBackfillArgs([])).toEqual({
      mode: "dry-run",
      expectedShops: undefined,
      batchSize: 50,
      help: false,
    });
  });

  it("requires an exact expected shop count for apply", () => {
    expect(() => parseBackfillArgs(["--apply"])).toThrow(
      "--apply requires --expected-shops",
    );

    const options = parseBackfillArgs([
      "--apply",
      "--expected-shops",
      "42",
      "--batch-size=100",
    ]);
    expect(options.mode).toBe("apply");
    expect(options.expectedShops).toBe(42);
    expect(options.batchSize).toBe(100);
    expect(() => assertExpectedShopCount(options, 41)).toThrow(
      "source union contains 41 shops",
    );
    expect(() => assertExpectedShopCount(options, 42)).not.toThrow();
  });

  it("rejects conflicting modes, oversized batches, and unknown flags", () => {
    expect(() =>
      parseBackfillArgs(["--dry-run", "--verify"]),
    ).toThrow("Choose exactly one mode");
    expect(() => parseBackfillArgs(["--batch-size", "101"])).toThrow(
      "cannot exceed 100",
    );
    expect(() => parseBackfillArgs(["--surprise"])).toThrow(
      "Unknown argument",
    );
  });

  it("fails schema preflight when a required entitlement column is absent", () => {
    const withoutOrders = REQUIRED_SHOP_ENTITLEMENT_COLUMNS.filter(
      (column) => column !== "limitMaxOrders",
    );
    expect(() =>
      assertRequiredColumns(
        "ShopEntitlements",
        withoutOrders,
        REQUIRED_SHOP_ENTITLEMENT_COLUMNS,
      ),
    ).toThrow("missing columns: limitMaxOrders");
  });
});

describe("strict active plan resolution", () => {
  it("normalizes known legacy identifiers into the free-first catalogue", () => {
    const resolved = resolvePlanSignals([
      signal("BillingSubscription", "ACTIVE", "RewardsPro Starter"),
    ]);
    expect(resolved).toEqual({
      planKey: "pro",
      billingName: PRICING_PLANS.pro.billingName,
      planSource: "SUBSCRIPTION",
      resolvedFrom: `${FREE_FIRST_CATALOG_ID}:BillingSubscription`,
    });
  });

  it("uses Free only when no source reports an active subscription", () => {
    const resolved = resolvePlanSignals([
      signal("AppSubscription", "CANCELLED", "unknown-old-plan"),
      signal("ShopSettings", "INACTIVE", "unknown-settings-plan"),
    ]);
    expect(resolved.planKey).toBe("free");
    expect(resolved.planSource).toBe("DEFAULT");
  });

  it("aborts on any unknown active plan, including a lower-precedence source", () => {
    expect(() =>
      resolvePlanSignals([
        signal("AppSubscription", "ACTIVE", "RewardsPro Pro"),
        signal("BillingSubscription", "ACTIVE", "mystery-paid-plan"),
      ]),
    ).toThrow("Unknown RewardsPro plan: mystery-paid-plan");
  });

  it("aborts when active sources disagree instead of risking a downgrade", () => {
    expect(() =>
      resolvePlanSignals([
        signal("AppSubscription", "ACTIVE", "RewardsPro Pro"),
        signal("BillingSubscription", "ACTIVE", "RewardsPro Max"),
      ]),
    ).toThrow("Conflicting active plan records");
  });

  it("aborts when an active record has no plan identifier", () => {
    expect(() =>
      resolvePlanSignals([
        signal("AppSubscription", "ACTIVE", null),
      ]),
    ).toThrow("active but has no plan identifier");
  });
});

describe("monotonic free-first entitlement planning", () => {
  it("creates the generous Free projection for a shop without entitlements", () => {
    const plan = planShopBackfill(input(), NOW);
    expect(plan.entitlementAction).toBe("create");
    expect(plan.effectivePlan).toBe(PRICING_PLANS.free.billingName);
    expect(plan.entitlements).toEqual(entitlementValuesForPlanKey("free"));
    expect(plan.entitlements.limitMaxOrders).toBe(1_000);
    expect(
      ENTITLEMENT_BOOLEAN_FIELDS.every(
        (field) => plan.entitlements[field] === true ||
          field === "featureWhiteLabel" ||
          field === "featurePrioritySupport",
      ),
    ).toBe(true);
  });

  it("preserves an active override byte-for-byte and only plans a current lock clear", () => {
    const existing = existingEntitlements({
      effectivePlan: "Private Founders Deal",
      planSource: "OVERRIDE",
      hasOverride: true,
      overrideExpiry: "2026-08-01T00:00:00.000Z",
      overrideNote: "Do not replace",
      overrideBy: "ops@example.com",
      limitMaxOrders: 88_888,
    });
    const plan = planShopBackfill(
      input({
        existing,
        currentUsage: {
          planLimit: 500,
          planName: "Old",
          isLocked: true,
          lockedAt: "2026-07-20T00:00:00.000Z",
          lockReason: "legacy hard cap",
        },
        planSignals: [
          signal("AppSubscription", "ACTIVE", "RewardsPro Max"),
        ],
      }),
      NOW,
    );

    expect(plan.entitlementAction).toBe("preserve-active-override");
    expect(plan.clearExpiredOverride).toBe(false);
    expect(plan.effectivePlan).toBe("Private Founders Deal");
    expect(plan.entitlements.limitMaxOrders).toBe(88_888);
    expect(plan.usageAction).toBe("update-and-unlock");
    expect(plan.desiredUsageLimit).toBe(88_888);
  });

  it("clears an expired override while never reducing a boolean or numeric value", () => {
    const existing = existingEntitlements({
      effectivePlan: "Expired Custom Deal",
      planSource: "OVERRIDE",
      hasOverride: true,
      overrideExpiry: "2026-07-01T00:00:00.000Z",
      overrideNote: "Expired",
      overrideBy: "ops@example.com",
      featureWhiteLabel: true,
      limitMaxOrders: 40_000,
      limitMaxTiers: 100,
    });
    const plan = planShopBackfill(input({ existing }), NOW);

    expect(plan.entitlementAction).toBe("update");
    expect(plan.clearExpiredOverride).toBe(true);
    expect(plan.effectivePlan).toBe(PRICING_PLANS.free.billingName);
    expect(plan.entitlements.featureWhiteLabel).toBe(true);
    expect(plan.entitlements.limitMaxOrders).toBe(40_000);
    expect(plan.entitlements.limitMaxTiers).toBe(100);
  });

  it("takes the union/max field-by-field for rollout safety", () => {
    const free = entitlementValuesForPlanKey("free");
    const corporate = entitlementValuesForPlanKey("ultra");
    const unusualExisting = {
      ...free,
      featureWhiteLabel: true,
      limitMaxEmails: corporate.limitMaxEmails + 1,
      limitMaxOrders: 1,
    };
    const merged = mergeEntitlementsWithoutReduction(
      unusualExisting,
      corporate,
    );

    expect(merged.featureWhiteLabel).toBe(true);
    expect(merged.limitMaxEmails).toBe(corporate.limitMaxEmails + 1);
    expect(merged.limitMaxOrders).toBe(corporate.limitMaxOrders);
    for (const field of ENTITLEMENT_NUMERIC_FIELDS) {
      expect(merged[field]).toBeGreaterThanOrEqual(unusualExisting[field]);
      expect(merged[field]).toBeGreaterThanOrEqual(corporate[field]);
    }
  });

  it("is idempotent after the desired projection and current usage are present", () => {
    const first = planShopBackfill(
      input({
        planSignals: [
          signal("AppSubscription", "ACTIVE", "RewardsPro Pro Annual"),
        ],
      }),
      NOW,
    );
    const existing = existingEntitlements({
      ...first.entitlements,
      effectivePlan: first.effectivePlan,
      planSource: first.resolved.planSource,
      resolvedFrom: first.resolved.resolvedFrom,
    });

    const second = planShopBackfill(
      input({
        existing,
        planSignals: [
          signal("AppSubscription", "ACTIVE", "RewardsPro Pro Annual"),
        ],
        currentUsage: {
          planLimit: first.entitlements.limitMaxOrders,
          planName: first.effectivePlan,
          isLocked: false,
          lockedAt: null,
          lockReason: null,
        },
      }),
      NOW,
    );

    expect(second.entitlementAction).toBe("none");
    expect(second.usageAction).toBe("none");
  });

  it("rejects malformed persisted override timestamps", () => {
    expect(() =>
      planShopBackfill(
        input({
          existing: existingEntitlements({
            hasOverride: true,
            overrideExpiry: "not-a-date",
          }),
        }),
        NOW,
      ),
    ).toThrow("Invalid overrideExpiry");
  });
});

function signal(
  source: PlanSignal["source"],
  status: string | null,
  planName: string | null,
): PlanSignal {
  return { source, status, planName };
}

function input(
  overrides: Partial<ShopBackfillInput> = {},
): ShopBackfillInput {
  return {
    shop: "small-shop.myshopify.com",
    planSignals: [],
    existing: null,
    currentUsage: null,
    ...overrides,
  };
}

function existingEntitlements(
  overrides: Partial<ExistingEntitlements> = {},
): ExistingEntitlements {
  return {
    id: "ent-1",
    effectivePlan: PRICING_PLANS.free.billingName,
    planSource: "DEFAULT",
    hasOverride: false,
    overrideExpiry: null,
    overrideNote: null,
    overrideBy: null,
    resolvedFrom: `${FREE_FIRST_CATALOG_ID}:default`,
    ...entitlementValuesForPlanKey("free"),
    ...overrides,
  };
}
