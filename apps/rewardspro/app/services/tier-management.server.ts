import prisma from "../db.server";
import type { Tier } from "@prisma/client";
import { updateCustomerToEffectiveTier } from "./tier-resolution.server";
import { recalculateTiersOptimized } from "./tier-recalculation-optimized.server";

/**
 * Ensures a base tier exists for the shop
 * Base tier has 0 minimum spend and applies to all customers by default
 */
export async function ensureBaseTierExists(shop: string): Promise<Tier> {
  // Check if a base tier already exists
  const existingBaseTier = await prisma.tier.findFirst({
    where: {
      shop,
      minSpend: 0
    },
    orderBy: {
      cashbackPercent: 'asc' // Get the lowest cashback tier if multiple exist
    }
  });

  if (existingBaseTier) {
    console.log(`[Tier Management] Base tier already exists for ${shop}: ${existingBaseTier.name}`);
    return existingBaseTier;
  }

  // Create base tier if it doesn't exist
  console.log(`[Tier Management] Creating base tier for shop: ${shop}`);
  const baseTier = await prisma.tier.create({
    data: {
      id: `${shop}-base-${Date.now()}`,
      shop,
      name: "Bronze Member",
      minSpend: 0,
      cashbackPercent: 1, // 1% default cashback
      evaluationPeriod: 'LIFETIME',
      createdAt: new Date()
    }
  });

  console.log(`[Tier Management] Created base tier: ${baseTier.name} with ${baseTier.cashbackPercent}% cashback`);
  return baseTier;
}

/**
 * Assigns the appropriate tier to a customer if they don't have one
 *
 * This function uses the Tier Resolution System which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers) - Priority 1
 * 2. Active tier subscriptions (recurring payments) - Priority 2
 * 3. Active tier purchases (one-time payments) - Priority 3
 * 4. Spending-based tiers (automatic calculation) - Priority 4
 *
 * @param skipLog - Deprecated: logging is now handled by the resolver
 */
export async function assignDefaultTierToCustomer(
  customerId: string,
  shop: string,
  _skipLog: boolean = false // kept for backward compatibility
): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      currentTierId: true,
      email: true
    }
  });

  if (!customer) {
    throw new Error(`Customer ${customerId} not found`);
  }

  // Only run if customer doesn't have a tier yet
  if (!customer.currentTierId) {
    console.log(`[Tier Management] Assigning tier to customer ${customerId} via Tier Resolution System`);

    // Use the Tier Resolution System which properly considers all tier sources
    const result = await updateCustomerToEffectiveTier(shop, customerId, {
      triggeredBy: 'initial_assignment'
    });

    console.log(`[Tier Management] Successfully assigned tier to customer ${customerId} (source: ${result.source})`);
  }
}

/**
 * Calculate and assign the appropriate tier for a customer
 *
 * This function now uses the Tier Resolution System which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers) - Priority 1
 * 2. Active tier subscriptions (recurring payments) - Priority 2
 * 3. Active tier purchases (one-time payments) - Priority 3
 * 4. Spending-based tiers (automatic calculation) - Priority 4
 *
 * This ensures customers who purchased a tier keep it, even when spending changes.
 */
export async function calculateAndAssignTier(
  shop: string,
  customerId: string,
  triggeredBy: 'ORDER' | 'MANUAL' | 'PERIODIC' = 'ORDER'
): Promise<{ changed: boolean; newTierId: string | null; previousTierId: string | null }> {
  console.log(`[Tier Management] Calculating tier for customer ${customerId} via Tier Resolution System`);

  // Map legacy trigger types to new resolver format
  const triggerMap: Record<string, string> = {
    'ORDER': 'ORDER_PAID',
    'MANUAL': 'MANUAL_ADMIN',
    'PERIODIC': 'PERIODIC_REVIEW'
  };

  // Use the Tier Resolution System which respects all tier sources
  const result = await updateCustomerToEffectiveTier(shop, customerId, {
    triggeredBy: triggerMap[triggeredBy] || triggeredBy
  });

  console.log(`[Tier Management] Resolution complete - source: ${result.source}, changed: ${result.changed}`);

  return {
    changed: result.changed,
    newTierId: result.newTierId,
    previousTierId: result.previousTierId
  };
}

/**
 * Batch assign appropriate tier to all customers without a tier
 *
 * This function uses the Tier Resolution System which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers) - Priority 1
 * 2. Active tier subscriptions (recurring payments) - Priority 2
 * 3. Active tier purchases (one-time payments) - Priority 3
 * 4. Spending-based tiers (automatic calculation) - Priority 4
 *
 * This ensures customers who purchased a tier get it properly assigned.
 */
export async function assignBaseTierToAllCustomersWithoutTier(shop: string): Promise<number> {
  console.log(`[Tier Management] Starting batch tier assignment for shop: ${shop}`);
  console.log(`[Tier Management] Using Tier Resolution System (respects purchases/subscriptions)`);

  // Get all customers without a tier
  const customersWithoutTier = await prisma.customer.findMany({
    where: {
      shop,
      currentTierId: null
    },
    select: {
      id: true,
      email: true
    }
  });

  if (customersWithoutTier.length === 0) {
    console.log(`[Tier Management] No customers without tier found`);
    return 0;
  }

  console.log(`[Tier Management] Found ${customersWithoutTier.length} customers without tier`);

  // Ensure base tier exists (as a fallback)
  await ensureBaseTierExists(shop);

  // Process customers in batches using the resolver
  const batchSize = 50;
  let assignedCount = 0;

  for (let i = 0; i < customersWithoutTier.length; i += batchSize) {
    const batch = customersWithoutTier.slice(i, i + batchSize);
    console.log(`[Tier Management] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(customersWithoutTier.length / batchSize)}`);

    for (const customer of batch) {
      try {
        // Use the resolver to determine and assign the correct tier
        const result = await updateCustomerToEffectiveTier(shop, customer.id, {
          triggeredBy: 'batch_initial_assignment'
        });

        if (result.newTierId) {
          assignedCount++;
        }
      } catch (error) {
        console.error(`[Tier Management] Error assigning tier to customer ${customer.id}:`, error);
      }
    }
  }

  console.log(`[Tier Management] Successfully assigned tiers to ${assignedCount} customers`);
  return assignedCount;
}

/**
 * Recalculate and update tiers for all customers in a shop
 *
 * IMPORTANT: This function uses the Tier Resolution System which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers)
 * 2. Active tier subscriptions (recurring payments)
 * 3. Active tier purchases (one-time payments)
 * 4. Spending-based tiers (automatic calculation)
 *
 * This ensures that customers who purchased a tier keep it during recalculation.
 */
export async function recalculateTiersForAllCustomers(shop: string): Promise<{
  processed: number;
  upgraded: number;
  downgraded: number;
  unchanged: number;
  bySource: {
    manualOverride: number;
    tierSubscription: number;
    tierPurchase: number;
    spendingBased: number;
    none: number;
  };
}> {
  console.log(`[Tier Management] ========================================`);
  console.log(`[Tier Management] Starting tier recalculation for shop: ${shop}`);
  console.log(`[Tier Management] Using Tier Resolution System (respects purchases/subscriptions)`);
  console.log(`[Tier Management] ========================================`);

  const customers = await prisma.customer.findMany({
    where: { shop },
    select: { id: true, currentTierId: true }
  });

  console.log(`[Tier Management] Found ${customers.length} customers to process`);

  let upgraded = 0;
  let downgraded = 0;
  let unchanged = 0;
  const bySource = {
    manualOverride: 0,
    tierSubscription: 0,
    tierPurchase: 0,
    spendingBased: 0,
    none: 0,
  };

  // Process customers in batches to avoid overwhelming the database
  const batchSize = 50;
  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    console.log(`[Tier Management] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(customers.length / batchSize)}`);

    for (const customer of batch) {
      try {
        // Use the Tier Resolution System which considers ALL sources
        const result = await updateCustomerToEffectiveTier(shop, customer.id, {
          triggeredBy: 'tier_recalculation'
        });

        // Track tier source distribution
        switch (result.source) {
          case 'MANUAL_OVERRIDE':
            bySource.manualOverride++;
            break;
          case 'TIER_SUBSCRIPTION':
            bySource.tierSubscription++;
            break;
          case 'TIER_PURCHASE':
            bySource.tierPurchase++;
            break;
          case 'SPENDING_BASED':
            bySource.spendingBased++;
            break;
          default:
            bySource.none++;
        }

        if (result.changed) {
          // Check if upgrade or downgrade by comparing tier levels
          const oldTier = result.previousTierId
            ? await prisma.tier.findUnique({ where: { id: result.previousTierId } })
            : null;
          const newTier = result.newTierId
            ? await prisma.tier.findUnique({ where: { id: result.newTierId } })
            : null;

          if (oldTier && newTier) {
            if (newTier.cashbackPercent > oldTier.cashbackPercent || newTier.minSpend > oldTier.minSpend) {
              upgraded++;
            } else {
              downgraded++;
            }
          } else if (newTier && !oldTier) {
            upgraded++; // From no tier to a tier is an upgrade
          } else if (!newTier && oldTier) {
            downgraded++; // From a tier to no tier is a downgrade
          }
        } else {
          unchanged++;
        }
      } catch (error) {
        console.error(`[Tier Management] Error processing customer ${customer.id}:`, error);
        unchanged++; // Count as unchanged if error
      }
    }
  }

  console.log(`[Tier Management] ========================================`);
  console.log(`[Tier Management] Recalculation Complete`);
  console.log(`[Tier Management] ========================================`);
  console.log(`[Tier Management] Total Processed: ${customers.length}`);
  console.log(`[Tier Management] Upgraded: ${upgraded}`);
  console.log(`[Tier Management] Downgraded: ${downgraded}`);
  console.log(`[Tier Management] Unchanged: ${unchanged}`);
  console.log(`[Tier Management] --- By Source ---`);
  console.log(`[Tier Management] Manual Override: ${bySource.manualOverride}`);
  console.log(`[Tier Management] Tier Subscription: ${bySource.tierSubscription}`);
  console.log(`[Tier Management] Tier Purchase: ${bySource.tierPurchase}`);
  console.log(`[Tier Management] Spending-Based: ${bySource.spendingBased}`);
  console.log(`[Tier Management] No Tier: ${bySource.none}`);
  console.log(`[Tier Management] ========================================`);

  return {
    processed: customers.length,
    upgraded,
    downgraded,
    unchanged,
    bySource
  };
}

/**
 * Smart tier recalculation with intelligent engine selection
 *
 * Engine Selection (Auto by customer count):
 * - LEGACY: Original per-customer resolution (< 100 customers)
 * - OPTIMIZED: Three-layer neural architecture (100-499 customers)
 * - NEURAL_V2: CNS/PNS partitioned clustering (500-2499 customers)
 * - NEURAL_V3: Anatomical CNS with multi-level clustering (2500+ customers)
 *
 * Performance Characteristics:
 * - LEGACY: 15 queries/customer, reliable for small shops
 * - OPTIMIZED: ~10 total queries, 100x faster than legacy
 * - NEURAL_V2: ~10 queries with parallel streams, source clustering
 * - NEURAL_V3: ~10 queries with anatomical regions, 4-level clustering, synaptic weights
 *
 * Always uses the OPTIMIZED engine (preload + in-memory resolve + batched
 * write-back). The neural V2/V3 variants were decorative metaphors over the
 * same logic and have been removed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FUTURE — Step Functions migration (defer until shop scale demands it)
 * ─────────────────────────────────────────────────────────────────────────
 * Trigger: when a single shop has > ~50K customers, OPTIMIZED's in-memory
 * model exceeds Vercel function timeout (60s Pro / 300s Enterprise) or
 * memory cap (1GB Pro / 3GB Enterprise).
 *
 * Design (when needed):
 *   EventBridge (daily 02:00 UTC)
 *   └─→ Step Functions state machine `rewardspro-tier-recalc`
 *       1. PreloadLambda — read tiers, subs, purchases, overrides → S3 staging
 *       2. Map (parallel, MaxConcurrency=10) — chunk customers, resolve in memory
 *       3. WriteBackLambda — batched UPDATE via Data API
 *       4. EmitSNSLambda — publish to rewardspro-prod-tier-changed
 *   Retries: 3 attempts, exponential backoff (2s/8s/30s); failures → SNS alarm
 *
 * Cost vs. benefit at current scale (Cambridge: 209 customers):
 *   • OPTIMIZED runs in ~3s for 10K customers — ~10x headroom for now
 *   • Step Functions adds: 1 SFN execution/day ($0.025), 4 Lambda runs ($0.001)
 *   • Operational cost: new failure mode (SFN provisioning, Lambda packaging)
 *   → Defer until any single shop crosses 50K customers.
 *
 * @param shop - Shop domain
 * @param options.forceLegacy - Use the per-customer legacy path (debugging only)
 */
export async function recalculateTiersSmart(
  shop: string,
  options?: {
    forceLegacy?: boolean;
  }
): Promise<{
  processed: number;
  upgraded: number;
  downgraded: number;
  unchanged: number;
  bySource: {
    manualOverride: number;
    tierSubscription: number;
    tierPurchase: number;
    spendingBased: number;
    none: number;
  };
  timing?: {
    contextLoadMs?: number;
    processingMs?: number;
    updatesMs?: number;
    totalMs: number;
  };
  engine: 'LEGACY' | 'OPTIMIZED';
  optimizedPath: boolean;
}> {
  if (options?.forceLegacy) {
    const result = await recalculateTiersForAllCustomers(shop);
    return {
      ...result,
      engine: 'LEGACY',
      optimizedPath: false,
    };
  }

  const result = await recalculateTiersOptimized(shop);

  return {
    processed: result.processed,
    upgraded: result.upgraded,
    downgraded: result.downgraded,
    unchanged: result.unchanged,
    bySource: {
      manualOverride: result.bySource.manualOverride,
      tierSubscription: result.bySource.tierSubscription,
      tierPurchase: result.bySource.tierPurchase,
      spendingBased: result.bySource.spendingBased,
      none: result.bySource.none + result.bySource.defaultBaseTier,
    },
    timing: {
      contextLoadMs: result.timing.contextLoadMs,
      processingMs: result.timing.processingMs,
      updatesMs: result.timing.updatesMs,
      totalMs: result.timing.totalMs,
    },
    engine: 'OPTIMIZED',
    optimizedPath: true,
  };
}

/**
 * Refresh annual spending for all customers in a shop
 *
 * This function recalculates the annualSpent field for all customers based on
 * their orders from the last 12 months. This is critical for spending-based
 * tier calculations that use annual spending thresholds.
 *
 * Should be run BEFORE tier recalculation to ensure accurate spending data.
 *
 * @param shop - Shop domain
 * @returns Statistics about the refresh operation
 */
export async function refreshAnnualSpending(
  shop: string
): Promise<{
  processed: number;
  updated: number;
  errors: number;
  duration: number;
}> {
  const startTime = Date.now();
  console.log(`[Tier Management] Starting annual spending refresh for ${shop}`);

  // Get the date 12 months ago
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  let processed = 0;
  let updated = 0;
  let errors = 0;

  try {
    // Get all customers for this shop
    const customers = await prisma.customer.findMany({
      where: { shop },
      select: {
        id: true,
        annualSpent: true,
      }
    });

    console.log(`[Tier Management] Found ${customers.length} customers to process`);

    // Process in batches of 100
    const batchSize = 100;

    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(customers.length / batchSize);

      console.log(`[Tier Management] Processing batch ${batchNumber}/${totalBatches}`);

      // For each customer in the batch, calculate their annual spending
      const updatePromises = batch.map(async (customer) => {
        try {
          // Calculate annual spending from orders in the last 12 months
          const orderStats = await prisma.order.aggregate({
            where: {
              shop,
              customerId: customer.id,
              financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
              shopifyCreatedAt: { gte: twelveMonthsAgo }
            },
            _sum: {
              totalPrice: true,
              totalRefunded: true
            }
          });

          const totalSpentAnnual = Number(orderStats._sum.totalPrice || 0);
          const totalRefundedAnnual = Number(orderStats._sum.totalRefunded || 0);
          const newAnnualSpent = totalSpentAnnual - totalRefundedAnnual;

          // Only update if the value has changed
          const currentAnnualSpent = Number(customer.annualSpent || 0);
          if (Math.abs(newAnnualSpent - currentAnnualSpent) > 0.01) {
            await prisma.customer.update({
              where: { id: customer.id },
              data: {
                annualSpent: newAnnualSpent,
                updatedAt: new Date()
              }
            });
            return { updated: true };
          }

          return { updated: false };
        } catch (error) {
          console.error(`[Tier Management] Error refreshing annual spending for customer ${customer.id}:`, error);
          return { error: true };
        }
      });

      const results = await Promise.all(updatePromises);

      processed += batch.length;
      updated += results.filter(r => r.updated).length;
      errors += results.filter(r => r.error).length;
    }

    const duration = Date.now() - startTime;
    console.log(`[Tier Management] Annual spending refresh complete:`, {
      processed,
      updated,
      errors,
      durationMs: duration
    });

    return { processed, updated, errors, duration };
  } catch (error) {
    console.error(`[Tier Management] Error in annual spending refresh:`, error);
    throw error;
  }
}