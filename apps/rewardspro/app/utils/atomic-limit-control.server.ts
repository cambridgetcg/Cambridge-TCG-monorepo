/**
 * Atomic Limit Control
 *
 * Provides atomic check-and-create operations to prevent TOCTOU race conditions
 * in rate-based gating. Uses database transactions with conditional logic to
 * ensure limits are enforced even under concurrent requests.
 *
 * Problem:
 *   Request A: count = 1 → check passes → (wait) → insert (count now 2)
 *   Request B: count = 1 → check passes → insert (count now 3!) ← EXCEEDED
 *
 * Solution:
 *   Use transactions with count check inside, or conditional INSERT statements
 *   that atomically verify the count before inserting.
 */

import prisma from "~/db.server";
import { getLimit, getEffectivePlan } from "~/services/entitlements.server";
import type { LimitKey } from "~/services/entitlements.server";
import { json } from "@remix-run/node";

// Type for Prisma transaction client
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Error thrown when a limit is exceeded during atomic operations
 */
export class LimitExceededError extends Error {
  public readonly code = "LIMIT_EXCEEDED";

  constructor(
    public readonly limit: LimitKey,
    public readonly currentCount: number,
    public readonly maxLimit: number,
    public readonly currentPlan: string
  ) {
    super(
      `You have reached the ${formatLimitName(limit)} limit (${currentCount}/${maxLimit}) for the ${currentPlan} plan. Please upgrade to increase your limit.`
    );
    this.name = "LimitExceededError";
  }

  /**
   * Convert to JSON response for route handlers
   */
  toJsonResponse() {
    return json(
      {
        error: "Limit exceeded",
        code: this.code,
        limit: this.limit,
        currentCount: this.currentCount,
        maxLimit: this.maxLimit,
        currentPlan: this.currentPlan,
        message: this.message,
      },
      { status: 403, statusText: "Forbidden" }
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
 * Atomically check a limit and perform an operation if within limits.
 *
 * This function wraps the count check and create operation in a database
 * transaction to prevent race conditions. The count is checked inside the
 * transaction, and if exceeded, the entire transaction is rolled back.
 *
 * @param shop - The shop identifier
 * @param limit - The limit key to check
 * @param countFn - Function to count current usage (receives transaction client)
 * @param createFn - Function to create the resource (receives transaction client)
 * @returns The result of createFn
 * @throws LimitExceededError if the limit is exceeded
 *
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
    return createFn(db as unknown as TransactionClient);
  }

  // Use transaction for atomic check-and-create
  return prisma.$transaction(async (tx) => {
    // Count inside transaction to get consistent view
    const currentCount = await countFn(tx);

    console.log(`${LOG_PREFIX} Transaction: currentCount=${currentCount} maxLimit=${maxLimit} willBlock=${currentCount >= maxLimit}`);

    // Check limit
    if (currentCount >= maxLimit) {
      console.warn(`${LOG_PREFIX} BLOCKED: ${limit} limit exceeded (${currentCount}/${maxLimit}) for ${shop} on ${currentPlan}`);
      throw new LimitExceededError(limit, currentCount, maxLimit, currentPlan);
    }

    console.log(`${LOG_PREFIX} ALLOWED: Creating resource within limit`);
    // Within limit - proceed with creation
    return createFn(tx);
  });
}

/**
 * Atomically check a limit and throw a JSON response if exceeded.
 * Use this in route actions where you need to return a Response.
 *
 * @example
 * ```typescript
 * try {
 *   const tier = await atomicWithinLimit(shop, 'maxTiers', countFn, createFn);
 * } catch (error) {
 *   if (error instanceof LimitExceededError) {
 *     throw error.toJsonResponse();
 *   }
 *   throw error;
 * }
 * ```
 */
export function handleLimitError(error: unknown): never {
  if (error instanceof LimitExceededError) {
    throw error.toJsonResponse();
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
