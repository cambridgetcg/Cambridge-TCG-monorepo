import { v4 as uuidv4 } from "uuid";
import db from "../db.server";
import type { Tier, Customer } from "@prisma/client";

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

    await db.$transaction([
      // Update customer with base tier
      db.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: baseTier.id,
          updatedAt: new Date()
        }
      }),

      // Create tier change log entry unless skipped (for bulk operations)
      ...(skipLog ? [] : [
        db.tierChangeLog.create({
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
        })
      ])
    ]);

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

    // Update customer tier in a transaction
    await db.$transaction([
      // Update customer tier
      db.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: qualifyingTier.id,
          updatedAt: new Date()
        }
      }),

      // Log the tier change
      db.tierChangeLog.create({
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
      })
    ]);

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
 */
export async function recalculateTiersForAllCustomers(shop: string): Promise<{
  processed: number;
  upgraded: number;
  downgraded: number;
  unchanged: number;
}> {
  console.log(`[Tier Management] Starting tier recalculation for all customers in shop: ${shop}`);

  const customers = await db.customer.findMany({
    where: { shop },
    select: { id: true }
  });

  let upgraded = 0;
  let downgraded = 0;
  let unchanged = 0;

  for (const customer of customers) {
    const result = await calculateAndAssignTier(shop, customer.id, 'PERIODIC');

    if (result.changed) {
      // Check if upgrade or downgrade
      const oldTier = result.previousTierId ? await db.tier.findUnique({ where: { id: result.previousTierId } }) : null;
      const newTier = result.newTierId ? await db.tier.findUnique({ where: { id: result.newTierId } }) : null;

      if (oldTier && newTier) {
        if (newTier.cashbackPercent > oldTier.cashbackPercent) {
          upgraded++;
        } else {
          downgraded++;
        }
      } else if (newTier && !oldTier) {
        upgraded++; // From no tier to a tier is an upgrade
      }
    } else {
      unchanged++;
    }
  }

  console.log(`[Tier Management] Recalculation complete: ${upgraded} upgraded, ${downgraded} downgraded, ${unchanged} unchanged`);

  return {
    processed: customers.length,
    upgraded,
    downgraded,
    unchanged
  };
}