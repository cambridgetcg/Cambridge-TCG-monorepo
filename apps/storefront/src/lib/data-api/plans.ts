/**
 * Data-API plan catalogue (docs/plans/tcg-data-platform/paid-data-api.md §4).
 *
 * Every plan sells the same derived market data (ctcg.market-derived/v1),
 * never a provider's own prices; plans differ in scale and permitted use.
 * The free floor is meant to be enough for a collector or a small shop
 * (Yu, 2026-07-23, for RewardsPro). Prices are an agent's proposal: Yu sets
 * the final ones, and nothing is on sale until Yu says so. The admission
 * record is DATA_API_PAID_PLANS in lib/release/commercial-retirement.ts
 * (plan §6), not here.
 *
 * Server-agnostic: no database, environment or Stripe access. Bump
 * DATA_API_PLANS_VERSION when any value below changes.
 */

export const DATA_API_PLANS_VERSION = "data-api-plans/2026-10-28.1" as const;

export const DATA_API_PLAN_IDS = ["free", "pro", "business"] as const;
export type DataApiPlanId = (typeof DATA_API_PLAN_IDS)[number];

export type DataApiFeature = "reference-prices" | "reference-history" | "indices" | "premiums" | "daily-export";
const ALL_FEATURES: readonly DataApiFeature[] = Object.freeze(["reference-prices", "reference-history", "indices", "premiums", "daily-export"]);

export interface DataApiLimits {
  requestsPerMinutePerKey: number;
  requestsPerMonthPerAccount: number;
  /** Reference and index history served; null is the full history. */
  historyDays: number | null;
  maxActiveKeys: number;
}

export interface DataApiPlan extends DataApiLimits {
  id: DataApiPlanId;
  name: string;
  /** Monthly, GBP minor units (pence), excluding VAT. */
  price: { amountPence: number; currency: "GBP"; interval: "month"; vat: "excluded"; proposed: true };
  features: readonly DataApiFeature[];
  permittedUse: string;
}

export interface DataApiEntitlement extends DataApiLimits {
  planId: DataApiPlanId;
  catalogueVersion: typeof DATA_API_PLANS_VERSION;
  features: readonly DataApiFeature[];
}

const price = (amountPence: number) => ({ amountPence, currency: "GBP", interval: "month", vat: "excluded", proposed: true }) as const;

export const DATA_API_PLANS: Readonly<Record<DataApiPlanId, Readonly<DataApiPlan>>> = Object.freeze({
  free: Object.freeze({
    id: "free", name: "Free", price: price(0),
    requestsPerMinutePerKey: 30, requestsPerMonthPerAccount: 100_000, historyDays: 365, maxActiveKeys: 5,
    features: ALL_FEATURES,
    permittedUse: "Your own use, including pricing your own stock.",
  }),
  pro: Object.freeze({
    id: "pro", name: "Pro", price: price(1200),
    requestsPerMinutePerKey: 120, requestsPerMonthPerAccount: 1_000_000, historyDays: null, maxActiveKeys: 10,
    features: ALL_FEATURES,
    permittedUse: "Internal business use and apps.",
  }),
  business: Object.freeze({
    id: "business", name: "Business", price: price(6000),
    requestsPerMinutePerKey: 600, requestsPerMonthPerAccount: 10_000_000, historyDays: null, maxActiveKeys: 25,
    features: ALL_FEATURES,
    permittedUse: "Commercial redisplay, with attribution.",
  }),
});

/** The limits an account holds. null (no active subscription) is free.
 * Anything else unknown, undefined included, is a programming error rather
 * than a quiet change of plan. */
export function entitlementFor(planId: DataApiPlanId | null): DataApiEntitlement {
  const id = planId === null ? "free" : planId;
  if (!(DATA_API_PLAN_IDS as readonly string[]).includes(id)) throw new TypeError(`Unknown data-API plan: ${String(id)}`);
  const plan = DATA_API_PLANS[id];
  return Object.freeze({
    planId: plan.id, catalogueVersion: DATA_API_PLANS_VERSION,
    requestsPerMinutePerKey: plan.requestsPerMinutePerKey, requestsPerMonthPerAccount: plan.requestsPerMonthPerAccount,
    historyDays: plan.historyDays, maxActiveKeys: plan.maxActiveKeys, features: plan.features,
  });
}
