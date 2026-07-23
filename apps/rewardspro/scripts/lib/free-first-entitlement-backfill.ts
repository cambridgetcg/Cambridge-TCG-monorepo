import {
  PRICING_PLANS,
  requireKnownPlanKey,
  type PlanKey,
} from "../../app/constants/pricing-contract";
import {
  entitlementValuesForPlanKey,
  type PlanEntitlementValues,
} from "../../app/constants/entitlement-contract";

export const FREE_FIRST_CATALOG_ID = "free-first-v1";
export const MAX_DATA_API_BATCH_SIZE = 100;
export const DEFAULT_DATA_API_BATCH_SIZE = 50;

export const ENTITLEMENT_BOOLEAN_FIELDS = [
  "featureApiAccess",
  "featureWebhooks",
  "featureWhiteLabel",
  "featureAdvancedReport",
  "featureCustomEmail",
  "featureAnnualEval",
  "featureBulkOps",
  "featureCustomBranding",
  "featurePrioritySupport",
  "featureSubscriptionTiers",
  "featurePurchasableTiers",
  "featureExportData",
  "featureCustomRewards",
  "featureIntegrationKlaviyo",
  "featureIntegrationSendgrid",
  "featureIntegrationJudgeme",
  "featureIntegrationSlack",
  "featureIntegrationRecharge",
  "featureIntegrationGorgias",
  "featureIntegrationZapier",
  "featureRaffles",
  "featureMysteryBoxes",
  "featureChallenges",
  "featureMarketingCampaigns",
  "featureMarketingAutomation",
  "featureAiRecommendations",
  "featureRfmSegmentation",
  "featureProgramImpact",
  "featureRealtimeAnalytics",
  "featureCohortAnalysis",
] as const satisfies readonly (keyof PlanEntitlementValues)[];

export const ENTITLEMENT_NUMERIC_FIELDS = [
  "limitMaxTiers",
  "limitMaxOrders",
  "limitMaxEmails",
  "limitMaxAutomations",
  "limitMaxCustomersSync",
  "limitMaxTierProducts",
  "limitMaxHistoricalDays",
  "limitMaxActiveRaffles",
  "limitMaxActiveMysteryBoxes",
  "limitMaxActiveChallenges",
  "limitMaxCampaigns",
  "limitMaxAutomationFlows",
] as const satisfies readonly (keyof PlanEntitlementValues)[];

export const REQUIRED_SHOP_ENTITLEMENT_COLUMNS = [
  "id",
  "shop",
  "effectivePlan",
  "planSource",
  ...ENTITLEMENT_BOOLEAN_FIELDS,
  ...ENTITLEMENT_NUMERIC_FIELDS,
  "hasOverride",
  "overrideExpiry",
  "overrideNote",
  "overrideBy",
  "lastResolvedAt",
  "resolvedFrom",
  "createdAt",
  "updatedAt",
] as const;

export const REQUIRED_MONTHLY_USAGE_COLUMNS = [
  "shop",
  "year",
  "month",
  "planLimit",
  "planName",
  "isLocked",
  "lockedAt",
  "lockReason",
] as const;

export type BackfillMode = "dry-run" | "apply" | "verify";

export interface BackfillCliOptions {
  mode: BackfillMode;
  expectedShops?: number;
  batchSize: number;
  help: boolean;
}

export interface PlanSignal {
  source: "AppSubscription" | "BillingSubscription" | "ShopSettings";
  status: string | null | undefined;
  planName: string | null | undefined;
}

export interface ExistingEntitlements extends PlanEntitlementValues {
  id: string;
  effectivePlan: string;
  planSource: "DEFAULT" | "SUBSCRIPTION" | "OVERRIDE" | "LEGACY";
  hasOverride: boolean;
  overrideExpiry: Date | string | null;
  overrideNote: string | null;
  overrideBy: string | null;
  resolvedFrom: string | null;
}

export interface CurrentMonthlyUsage {
  planLimit: number;
  planName: string;
  isLocked: boolean;
  lockedAt: Date | string | null;
  lockReason: string | null;
}

export interface ShopBackfillInput {
  shop: string;
  planSignals: PlanSignal[];
  existing: ExistingEntitlements | null;
  currentUsage: CurrentMonthlyUsage | null;
}

export interface ResolvedPlan {
  planKey: PlanKey;
  billingName: string;
  planSource: "DEFAULT" | "SUBSCRIPTION";
  resolvedFrom: string;
}

export type EntitlementAction =
  | "create"
  | "update"
  | "preserve-active-override"
  | "none";

export interface ShopBackfillPlan {
  shop: string;
  resolved: ResolvedPlan;
  effectivePlan: string;
  entitlements: PlanEntitlementValues;
  entitlementAction: EntitlementAction;
  clearExpiredOverride: boolean;
  usageAction: "update-and-unlock" | "none";
  desiredUsageLimit: number;
  desiredUsagePlanName: string;
}

const ACTIVE_STATUSES = new Set(["ACTIVE", "TRIAL"]);
const SOURCE_PRECEDENCE: PlanSignal["source"][] = [
  "AppSubscription",
  "BillingSubscription",
  "ShopSettings",
];

export function parseBackfillArgs(args: string[]): BackfillCliOptions {
  let explicitMode: BackfillMode | undefined;
  let expectedShops: number | undefined;
  let batchSize = DEFAULT_DATA_API_BATCH_SIZE;
  let help = false;

  const setMode = (next: BackfillMode) => {
    if (explicitMode && explicitMode !== next) {
      throw new Error(
        `Choose exactly one mode; received both --${explicitMode} and --${next}`,
      );
    }
    explicitMode = next;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      setMode("dry-run");
    } else if (arg === "--apply") {
      setMode("apply");
    } else if (arg === "--verify") {
      setMode("verify");
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--expected-shops") {
      expectedShops = parseNonNegativeInteger(
        "--expected-shops",
        args[++index],
      );
    } else if (arg.startsWith("--expected-shops=")) {
      expectedShops = parseNonNegativeInteger(
        "--expected-shops",
        arg.slice("--expected-shops=".length),
      );
    } else if (arg === "--batch-size") {
      batchSize = parsePositiveInteger("--batch-size", args[++index]);
    } else if (arg.startsWith("--batch-size=")) {
      batchSize = parsePositiveInteger(
        "--batch-size",
        arg.slice("--batch-size=".length),
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (batchSize > MAX_DATA_API_BATCH_SIZE) {
    throw new Error(
      `--batch-size cannot exceed ${MAX_DATA_API_BATCH_SIZE} shops per Data API transaction`,
    );
  }
  const mode: BackfillMode = explicitMode ?? "dry-run";
  if (mode === "apply" && expectedShops === undefined) {
    throw new Error(
      "--apply requires --expected-shops <exact union shop count>",
    );
  }

  return { mode, expectedShops, batchSize, help };
}

export function assertExpectedShopCount(
  options: BackfillCliOptions,
  actualShops: number,
): void {
  if (options.mode !== "apply") return;
  if (options.expectedShops !== actualShops) {
    throw new Error(
      `Apply refused: --expected-shops=${options.expectedShops} but the source union contains ${actualShops} shops`,
    );
  }
}

export function assertRequiredColumns(
  tableName: string,
  actualColumns: Iterable<string>,
  requiredColumns: readonly string[],
): void {
  const actual = new Set(actualColumns);
  const missing = requiredColumns.filter((column) => !actual.has(column));
  if (missing.length > 0) {
    throw new Error(
      `${tableName} schema preflight failed; missing columns: ${missing.join(", ")}`,
    );
  }
}

export function isActiveSubscriptionStatus(
  status: string | null | undefined,
): boolean {
  return status
    ? ACTIVE_STATUSES.has(status.trim().toUpperCase())
    : false;
}

/**
 * Resolves every active signal strictly before applying source precedence.
 * This deliberately rejects an unknown lower-precedence active record instead
 * of silently treating the merchant as Free.
 */
export function resolvePlanSignals(signals: PlanSignal[]): ResolvedPlan {
  const active = signals
    .filter((signal) => isActiveSubscriptionStatus(signal.status))
    .map((signal) => {
      const planName = signal.planName?.trim();
      if (!planName) {
        throw new Error(
          `${signal.source} is active but has no plan identifier`,
        );
      }
      return {
        ...signal,
        planKey: requireKnownPlanKey(planName),
      };
    });

  if (active.length === 0) {
    return {
      planKey: "free",
      billingName: PRICING_PLANS.free.billingName,
      planSource: "DEFAULT",
      resolvedFrom: `${FREE_FIRST_CATALOG_ID}:default`,
    };
  }

  const distinctPlanKeys = new Set(active.map((signal) => signal.planKey));
  if (distinctPlanKeys.size > 1) {
    const details = active
      .map((signal) => `${signal.source}=${signal.planName}`)
      .join(", ");
    throw new Error(`Conflicting active plan records: ${details}`);
  }

  const selected = [...active].sort(
    (left, right) =>
      SOURCE_PRECEDENCE.indexOf(left.source) -
      SOURCE_PRECEDENCE.indexOf(right.source),
  )[0];

  return {
    planKey: selected.planKey,
    billingName: PRICING_PLANS[selected.planKey].billingName,
    planSource: "SUBSCRIPTION",
    resolvedFrom: `${FREE_FIRST_CATALOG_ID}:${selected.source}`,
  };
}

export function isOverrideActive(
  existing: ExistingEntitlements,
  now: Date,
): boolean {
  if (!existing.hasOverride) return false;
  if (existing.overrideExpiry === null) return true;

  const expiry = asValidDate(existing.overrideExpiry, "overrideExpiry");
  return expiry.getTime() > now.getTime();
}

export function mergeEntitlementsWithoutReduction(
  existing: PlanEntitlementValues,
  desired: PlanEntitlementValues,
): PlanEntitlementValues {
  const merged = { ...desired };

  for (const field of ENTITLEMENT_BOOLEAN_FIELDS) {
    merged[field] = Boolean(existing[field] || desired[field]);
  }
  for (const field of ENTITLEMENT_NUMERIC_FIELDS) {
    const existingValue = existing[field];
    if (!Number.isFinite(existingValue) || existingValue < 0) {
      throw new Error(`Invalid existing entitlement ${field}=${existingValue}`);
    }
    merged[field] = Math.max(existingValue, desired[field]);
  }

  return merged;
}

export function planShopBackfill(
  input: ShopBackfillInput,
  now: Date,
): ShopBackfillPlan {
  if (!input.shop.trim()) {
    throw new Error("Cannot plan entitlements for an empty shop identifier");
  }

  // Resolve first even for an override: unknown active billing data must stop
  // the whole rollout rather than remain hidden behind a manual override.
  const resolved = resolvePlanSignals(input.planSignals);
  const desired = entitlementValuesForPlanKey(resolved.planKey);
  const existing = input.existing;

  if (existing && isOverrideActive(existing, now)) {
    return {
      shop: input.shop,
      resolved,
      effectivePlan: existing.effectivePlan,
      entitlements: pickEntitlementValues(existing),
      entitlementAction: "preserve-active-override",
      clearExpiredOverride: false,
      usageAction: needsUsageUpdate(
        input.currentUsage,
        existing.limitMaxOrders,
        existing.effectivePlan,
      )
        ? "update-and-unlock"
        : "none",
      desiredUsageLimit: existing.limitMaxOrders,
      desiredUsagePlanName: existing.effectivePlan,
    };
  }

  const entitlements = existing
    ? mergeEntitlementsWithoutReduction(existing, desired)
    : desired;
  const clearExpiredOverride = Boolean(
    existing?.hasOverride && existing.overrideExpiry !== null,
  );
  const effectivePlan = resolved.billingName;

  let entitlementAction: EntitlementAction = "create";
  if (existing) {
    entitlementAction = entitlementsNeedUpdate(
      existing,
      entitlements,
      resolved,
    )
      ? "update"
      : "none";
  }

  return {
    shop: input.shop,
    resolved,
    effectivePlan,
    entitlements,
    entitlementAction,
    clearExpiredOverride,
    usageAction: needsUsageUpdate(
      input.currentUsage,
      entitlements.limitMaxOrders,
      effectivePlan,
    )
      ? "update-and-unlock"
      : "none",
    desiredUsageLimit: entitlements.limitMaxOrders,
    desiredUsagePlanName: effectivePlan,
  };
}

export function summarizePlans(plans: ShopBackfillPlan[]) {
  return plans.reduce(
    (summary, plan) => {
      summary.shops += 1;
      summary[plan.entitlementAction] += 1;
      if (plan.clearExpiredOverride) summary.expiredOverrides += 1;
      if (plan.usageAction === "update-and-unlock") {
        summary.currentUsageUpdates += 1;
      }
      return summary;
    },
    {
      catalogId: FREE_FIRST_CATALOG_ID,
      shops: 0,
      create: 0,
      update: 0,
      "preserve-active-override": 0,
      none: 0,
      expiredOverrides: 0,
      currentUsageUpdates: 0,
    },
  );
}

function entitlementsNeedUpdate(
  existing: ExistingEntitlements,
  desired: PlanEntitlementValues,
  resolved: ResolvedPlan,
): boolean {
  if (existing.effectivePlan !== resolved.billingName) return true;
  if (existing.planSource !== resolved.planSource) return true;
  if (existing.resolvedFrom !== resolved.resolvedFrom) return true;
  if (
    existing.hasOverride ||
    existing.overrideExpiry !== null ||
    existing.overrideNote !== null ||
    existing.overrideBy !== null
  ) {
    return true;
  }

  return [...ENTITLEMENT_BOOLEAN_FIELDS, ...ENTITLEMENT_NUMERIC_FIELDS].some(
    (field) => existing[field] !== desired[field],
  );
}

function needsUsageUpdate(
  usage: CurrentMonthlyUsage | null,
  desiredLimit: number,
  desiredPlanName: string,
): boolean {
  if (!usage) return false;
  return (
    usage.planLimit < desiredLimit ||
    usage.planName !== desiredPlanName ||
    usage.isLocked ||
    usage.lockedAt !== null ||
    usage.lockReason !== null
  );
}

function pickEntitlementValues(
  existing: ExistingEntitlements,
): PlanEntitlementValues {
  const result = {} as PlanEntitlementValues;
  for (const field of ENTITLEMENT_BOOLEAN_FIELDS) {
    result[field] = existing[field];
  }
  for (const field of ENTITLEMENT_NUMERIC_FIELDS) {
    result[field] = existing[field];
  }
  return result;
}

function asValidDate(value: Date | string, label: string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return parsed;
}

function parseNonNegativeInteger(label: string, value: string | undefined) {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe non-negative integer`);
  }
  return parsed;
}

function parsePositiveInteger(label: string, value: string | undefined) {
  const parsed = parseNonNegativeInteger(label, value);
  if (parsed === 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return parsed;
}
