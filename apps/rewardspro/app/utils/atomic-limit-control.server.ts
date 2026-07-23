/**
 * Atomic Limit Control
 *
 * Provides atomic usage observation and create operations. Numeric plan
 * capacities are advisory: the transaction gives us a consistent count for
 * reporting, but reaching that count never prevents the requested write.
 *
 * The transaction is still useful when two requests arrive together: it keeps
 * the observed count and write ordered for accurate metrics, while both writes
 * remain available regardless of the advisory threshold.
 */

import prisma from "~/db.server";
import { getLimit, getEffectivePlan } from "~/services/entitlements.server";
import type { LimitKey } from "~/services/entitlements.server";
import { json } from "@remix-run/node";

// Type for Prisma transaction client
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Legacy capacity error retained for compatibility with existing route catches.
 *
 * `atomicWithinLimit` no longer throws this error. If older code supplies one,
 * its response is an advisory success rather than a blocking 403.
 */
export class LimitExceededError extends Error {
  public readonly code = "CAPACITY_ADVISORY";

  constructor(
    public readonly limit: LimitKey,
    public readonly currentCount: number,
    public readonly maxLimit: number,
    public readonly currentPlan: string
  ) {
    super(
      `Plan capacity advisory: ${formatLimitName(limit)} usage is ${currentCount}/${maxLimit} on ${currentPlan}. Processing remains available.`
    );
    this.name = "LimitExceededError";
  }

  /**
   * Convert to JSON response for route handlers
   */
  toJsonResponse() {
    return json(
      {
        error: null,
        advisory: true,
        allowed: true,
        code: this.code,
        limit: this.limit,
        currentCount: this.currentCount,
        maxLimit: this.maxLimit,
        currentPlan: this.currentPlan,
        message: this.message,
      },
      { status: 200 }
    );
  }
}

/**
 * Format limit key to human-readable name
 */
function formatLimitName(limit: LimitKey): string {
  const names: Record<LimitKey, string> = {
    maxOrders: "monthly orders",
    maxCustomersSync: "customer sync",
    maxTiers: "tiers",
    maxEmails: "monthly emails",
    maxHistoricalDays: "historical data days",
    maxActiveRaffles: "active raffles",
    maxActiveMysteryBoxes: "active mystery boxes",
    maxActiveChallenges: "active challenges",
    maxCampaigns: "campaigns",
    maxAutomations: "automations",
    maxTierProducts: "tier products",
    maxApiRequestsPerMinute: "API requests per minute",
  } as Record<string, string>;
  return names[limit] || limit;
}

/**
 * Atomically observe a limit and perform an operation.
 *
 * This function wraps the count check and create operation in a database
 * transaction so advisory reporting uses a consistent count. A reached plan
 * capacity is logged, but the create operation always proceeds.
 *
 * @param shop - The shop identifier
 * @param limit - The limit key to check
 * @param countFn - Function to count current usage (receives transaction client)
 * @param createFn - Function to create the resource (receives transaction client)
 * @returns The result of createFn
 * @example
 * ```typescript
 * const tier = await atomicWithinLimit(
 *   shop,
 *   'maxTiers',
 *   (tx) => tx.tier.count({ where: { shop } }),
 *   (tx) => tx.tier.create({ data: { ... } })
 * );
 * ```
 */
export async function atomicWithinLimit<T>(
  shop: string,
  limit: LimitKey,
  countFn: (tx: TransactionClient) => Promise<number>,
  createFn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  const LOG_PREFIX = "[atomicWithinLimit]";

  // Get limit first (cached, so OK to call outside transaction)
  const maxLimit = await getLimit(shop, limit);
  const currentPlan = await getEffectivePlan(shop);

  console.log(`${LOG_PREFIX} shop=${shop} limit=${limit} maxLimit=${maxLimit} plan=${currentPlan}`);

  // CRITICAL: A limit of 0 means no access - this is likely a configuration error
  // All plans should have at least 1 for gamification features
  if (maxLimit === 0) {
    console.error(`${LOG_PREFIX} CRITICAL: limit=${limit} returned 0 for shop=${shop} on plan=${currentPlan}. This may indicate stale entitlements.`);
  }

  // Unlimited case (999999) - skip transaction overhead
  if (maxLimit >= 999999) {
    console.log(`${LOG_PREFIX} Unlimited - skipping transaction`);
    // Use db directly since we don't need atomicity for unlimited
    return createFn(prisma as unknown as TransactionClient);
  }

  // Use transaction for atomic check-and-create
  return prisma.$transaction(async (tx) => {
    // Count inside transaction to get consistent view
    const currentCount = await countFn(tx);

    const capacityReached = currentCount >= maxLimit;

    console.log(
      `${LOG_PREFIX} Transaction: currentCount=${currentCount} maxLimit=${maxLimit} capacityReached=${capacityReached}`,
    );

    if (capacityReached) {
      console.warn(
        `${LOG_PREFIX} ADVISORY: ${limit} capacity reached (${currentCount}/${maxLimit}) for ${shop} on ${currentPlan}; creation remains available`,
      );
    }

    console.log(`${LOG_PREFIX} ALLOWED: Creating resource`);
    return createFn(tx);
  });
}

/**
 * Convert a legacy capacity error into a non-blocking advisory response.
 *
 * @example
 * ```typescript
 * const response = handleLimitError(legacyCapacityError);
 * ```
 */
export function handleLimitError(error: unknown): Response {
  if (error instanceof LimitExceededError) {
    return error.toJsonResponse();
  }
  throw error;
}

/**
 * Pre-built atomic operations for common resources
 */
export const atomicTierCreate = async (
  shop: string,
  data: {
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
    evaluationPeriod: "ANNUAL" | "LIFETIME";
  }
) => {
  return atomicWithinLimit(
    shop,
    "maxTiers",
    (tx) => tx.tier.count({ where: { shop } }),
    (tx) =>
      tx.tier.create({
        data: {
          ...data,
          shop,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
  );
};

/**
 * Pre-built atomic operation for creating raffles
 */
export const atomicRaffleCreate = async (
  shop: string,
  data: Parameters<typeof prisma.raffle.create>[0]["data"]
) => {
  return atomicWithinLimit(
    shop,
    "maxActiveRaffles",
    (tx) =>
      tx.raffle.count({
        where: {
          shop,
          status: { in: ["ACTIVE", "PENDING"] },
        },
      }),
    (tx) => tx.raffle.create({ data: { ...data, shop } })
  );
};

/**
 * Pre-built atomic operation for creating campaigns
 */
export const atomicCampaignCreate = async (
  shop: string,
  data: any
) => {
  return atomicWithinLimit(
    shop,
    "maxCampaigns",
    (tx) => (tx as any).campaign.count({ where: { shop } }),
    (tx) => (tx as any).campaign.create({ data: { ...data, shop } })
  );
};

/**
 * Pre-built atomic operation for creating automations
 */
export const atomicAutomationCreate = async (
  shop: string,
  data: any
) => {
  return atomicWithinLimit(
    shop,
    "maxAutomations",
    (tx) => (tx as any).automation.count({ where: { shop } }),
    (tx) => (tx as any).automation.create({ data: { ...data, shop } })
  );
};

/**
 * Pre-built atomic operation for creating tier products
 */
export const atomicTierProductCreate = async (
  shop: string,
  data: Parameters<typeof prisma.tierProduct.create>[0]["data"]
) => {
  return atomicWithinLimit(
    shop,
    "maxTierProducts",
    (tx) => tx.tierProduct.count({ where: { shop } }),
    (tx) => tx.tierProduct.create({ data: { ...data, shop } })
  );
};
