import { v4 as uuidv4 } from "uuid";
import db from "../db.server";
import type { Tier, Customer } from "@prisma/client";
import { updateCustomerToEffectiveTier, resolveEffectiveTier } from "./tier-resolution.server";

/**
 * Ensures a base tier exists for the shop
 * Base tier has 0 minimum spend and applies to all customers by default
 */
export async function ensureBaseTierExists(shop: string): Promise<Tier> {
  // Check if a base tier already exists
  const existingBaseTier = await db.tier.findFirst({
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
  const baseTier = await db.tier.create({
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
 * Assigns the default base tier to a customer if they don't have one
 */
export async function assignDefaultTierToCustomer(
  customerId: string,
  shop: string,
  skipLog: boolean = false
): Promise<void> {
  const customer = await db.customer.findUnique({
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

  if (!customer.currentTierId) {
    const baseTier = await ensureBaseTierExists(shop);

    console.log(`[Tier Management] Assigning base tier ${baseTier.name} to customer ${customer.email}`);

    // Update customer with base tier (using callback syntax for Aurora Data API)
    await db.$transaction(async (tx) => {
      // Update customer with base tier
      await tx.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: baseTier.id,
          updatedAt: new Date()
        }
      });

      // Create tier change log entry unless skipped (for bulk operations)
      if (!skipLog) {
        await tx.tierChangeLog.create({
          data: {
            id: uuidv4(),
            customerId,
            shop,
            fromTierId: null,
            fromTierName: null,
            toTierId: baseTier.id,
            toTierName: baseTier.name,
            changeType: 'INITIAL_ASSIGNMENT',
            triggerType: 'ACCOUNT_CREATED',
            metadata: {
              reason: "Default tier assignment on customer creation",
              source: "tier-management-service"
            },
            createdAt: new Date()
          }
        });
      }
    });

    console.log(`[Tier Management] Successfully assigned base tier to ${customer.email}`);
  }
}

/**
 * Calculate and assign the appropriate tier for a customer based on their spending
 */
export async function calculateAndAssignTier(
  shop: string,
  customerId: string,
  triggeredBy: 'ORDER' | 'MANUAL' | 'PERIODIC' = 'ORDER'
): Promise<{ changed: boolean; newTierId: string | null; previousTierId: string | null }> {
  console.log(`[Tier Management] Calculating tier for customer ${customerId}`);

  // Get customer with current tier
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { currentTier: true }
  });

  if (!customer) {
    throw new Error(`Customer ${customerId} not found`);
  }

  // Get all tiers for the shop, ordered by minSpend
  const tiers = await db.tier.findMany({
    where: { shop },
    orderBy: { minSpend: 'desc' }
  });

  if (tiers.length === 0) {
    console.warn(`[Tier Management] No tiers found for shop ${shop}`);
    return {
      changed: false,
      newTierId: null,
      previousTierId: customer.currentTierId
    };
  }

  // Determine evaluation period (using customer's current tier or default to LIFETIME)
  const evaluationPeriod = customer.currentTier?.evaluationPeriod || 'LIFETIME';

  // Calculate relevant spending based on evaluation period
  // Use cached fields for fast tier calculation
  let relevantSpending = 0;
  if (evaluationPeriod === 'ANNUAL') {
    // Use cached annualSpent field (updated during order processing)
    relevantSpending = Number(customer.annualSpent);
    console.log(`[Tier Management] Using cached annualSpent: ${relevantSpending}`);
  } else {
    // LIFETIME - use cached netSpent field
    relevantSpending = Number(customer.netSpent);
    console.log(`[Tier Management] Using cached netSpent: ${relevantSpending}`);
  }

  console.log(`[Tier Management] Customer spending (${evaluationPeriod}): ${relevantSpending}`);

  // Find the highest tier the customer qualifies for
  let qualifyingTier = tiers.find(tier => relevantSpending >= tier.minSpend);

  // If no tier qualifies, assign base tier
  if (!qualifyingTier) {
    qualifyingTier = await ensureBaseTierExists(shop);
  }

  // Check if tier needs to change
  if (qualifyingTier.id !== customer.currentTierId) {
    console.log(`[Tier Management] Tier change detected: ${customer.currentTier?.name || 'none'} -> ${qualifyingTier.name}`);

    // Determine change type
    let changeType: 'INITIAL_ASSIGNMENT' | 'UPGRADE' | 'DOWNGRADE' = 'INITIAL_ASSIGNMENT';
    if (customer.currentTier) {
      changeType = qualifyingTier.cashbackPercent > customer.currentTier.cashbackPercent ? 'UPGRADE' : 'DOWNGRADE';
    }

    // Determine trigger type
    let triggerType: 'SPENDING_MILESTONE' | 'PERIODIC_REVIEW' | 'MANUAL_ADMIN' = 'SPENDING_MILESTONE';
    if (triggeredBy === 'MANUAL') {
      triggerType = 'MANUAL_ADMIN';
    } else if (triggeredBy === 'PERIODIC') {
      triggerType = 'PERIODIC_REVIEW';
    }

    // Update customer tier in a transaction (using callback syntax for Aurora Data API)
    await db.$transaction(async (tx) => {
      // Update customer tier
      await tx.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: qualifyingTier.id,
          updatedAt: new Date()
        }
      });

      // Log the tier change
      await tx.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId,
          shop,
          fromTierId: customer.currentTierId,
          fromTierName: customer.currentTier?.name || null,
          toTierId: qualifyingTier.id,
          toTierName: qualifyingTier.name,
          changeType,
          triggerType,
          totalSpending: relevantSpending,
          periodSpending: evaluationPeriod === 'ANNUAL' ? relevantSpending : null,
          metadata: {
            evaluationPeriod,
            previousCashback: customer.currentTier?.cashbackPercent || 0,
            newCashback: qualifyingTier.cashbackPercent,
            triggeredBy
          },
          createdAt: new Date()
        }
      });
    });

    return {
      changed: true,
      newTierId: qualifyingTier.id,
      previousTierId: customer.currentTierId
    };
  }

  console.log(`[Tier Management] No tier change needed - customer remains in ${customer.currentTier?.name}`);
  return {
    changed: false,
    newTierId: customer.currentTierId,
    previousTierId: customer.currentTierId
  };
}

/**
 * Batch assign base tier to all customers without a tier
 */
export async function assignBaseTierToAllCustomersWithoutTier(shop: string): Promise<number> {
  console.log(`[Tier Management] Starting batch base tier assignment for shop: ${shop}`);

  // Get all customers without a tier
  const customersWithoutTier = await db.customer.findMany({
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

  // Ensure base tier exists
  const baseTier = await ensureBaseTierExists(shop);

  // Batch update all customers
  const updateResult = await db.customer.updateMany({
    where: {
      shop,
      currentTierId: null
    },
    data: {
      currentTierId: baseTier.id,
      updatedAt: new Date()
    }
  });

  // Create tier change logs for all customers (in batches to avoid overwhelming the DB)
  const batchSize = 100;
  for (let i = 0; i < customersWithoutTier.length; i += batchSize) {
    const batch = customersWithoutTier.slice(i, i + batchSize);

    const logEntries = batch.map(customer => ({
      id: uuidv4(),
      customerId: customer.id,
      shop,
      fromTierId: null,
      fromTierName: null,
      toTierId: baseTier.id,
      toTierName: baseTier.name,
      changeType: 'INITIAL_ASSIGNMENT' as const,
      triggerType: 'ACCOUNT_CREATED' as const,
      metadata: {
        reason: "Batch base tier assignment",
        source: "tier-management-service",
        batchRun: new Date().toISOString()
      },
      createdAt: new Date(),
      totalSpending: 0,
      periodSpending: null,
      orderId: null,
      subscriptionId: null,
      note: "Retroactive tier assignment for existing customer",
      processedBy: "system"
    }));

    await db.tierChangeLog.createMany({
      data: logEntries
    });

    console.log(`[Tier Management] Created tier change logs for batch ${i / batchSize + 1}`);
  }

  console.log(`[Tier Management] Successfully assigned base tier to ${updateResult.count} customers`);
  return updateResult.count;
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

  const customers = await db.customer.findMany({
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
            ? await db.tier.findUnique({ where: { id: result.previousTierId } })
            : null;
          const newTier = result.newTierId
            ? await db.tier.findUnique({ where: { id: result.newTierId } })
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