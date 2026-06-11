/**
 * Tier Calculation Service
 * 
 * Handles automatic tier assignment based on customer spending.
 * Calculates tiers based on order history and evaluation periods.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";
import { v4 as uuidv4 } from "uuid";
import { hasManualOverride } from "./manual-tier-assignment.server";
import { updateCustomerToEffectiveTier } from "./tier-resolution.server";
import { createLogger } from "./logger.server";

type AdminApiContextWithRest = AdminApiContext & {
  rest?: any;
};

type AdminApiContextType = AdminApiContext | AdminApiContextWithRest;

const logger = createLogger('TierCalculation');

// ============================================
// TYPE DEFINITIONS
// ============================================

interface TierCalculationResult {
  customerId: string;
  previousTierId: string | null;
  previousTierName: string | null;
  newTierId: string | null;
  newTierName: string | null;
  totalSpending: number;
  changed: boolean;
  error?: string;
}

interface CustomerSpending {
  customerId: string;
  shopifyCustomerId: string;
  totalSpending: number;
  orderCount: number;
  lastOrderDate: Date | null;
}

// ============================================
// MAIN CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate and update tier for a single customer using LOCAL DATABASE
 * Optimized for webhooks - uses local data instead of Shopify API
 *
 * IMPORTANT: This function should ONLY be called with skipUpdate: true.
 * Direct tier updates from this function bypass the Tier Resolution System,
 * which can cause purchased/subscription tiers to be incorrectly overwritten.
 *
 * For tier updates, always use `updateCustomerToEffectiveTier()` from
 * tier-resolution.server.ts which respects tier priority:
 * 1. Manual Override > 2. Subscription > 3. Purchase > 4. Spending-based
 *
 * @see updateCustomerToEffectiveTier in tier-resolution.server.ts
 */
export async function calculateCustomerTierFromDB(
  shop: string,
  customerId: string,
  context?: {
    orderId?: string;
    triggerType?: string;
    skipOverrideCheck?: boolean;  // Allow skipping override check for tier resolution
    skipUpdate?: boolean;         // Skip DB updates - return calculation result only (for tier resolution)
  }
): Promise<TierCalculationResult> {
  const calcLogger = logger.withContext({ shop, customerId, orderId: context?.orderId });

  try {
    calcLogger.info('Starting tier calculation', {
      triggerType: context?.triggerType,
      skipOverrideCheck: context?.skipOverrideCheck,
      skipUpdate: context?.skipUpdate
    });

    // Check if customer has a manual override (unless explicitly skipped)
    if (!context?.skipOverrideCheck) {
      const hasOverride = await hasManualOverride(customerId);

      if (hasOverride) {
        calcLogger.info('Customer has manual tier override - skipping calculation');

        // Get current tier info for response
        const customer = await prisma.customer.findFirst({
          where: {
            id: customerId,
            shop: shop
          }
        });

        let currentTier = null;
        if (customer?.currentTierId) {
          currentTier = await prisma.tier.findUnique({
            where: { id: customer.currentTierId }
          });
        }

        return {
          customerId,
          previousTierId: customer?.currentTierId || null,
          previousTierName: currentTier?.name || null,
          newTierId: customer?.currentTierId || null,
          newTierName: currentTier?.name || null,
          totalSpending: 0,
          changed: false,
          error: "Customer has manual tier override - calculation skipped"
        };
      }
    }

    // Get customer data
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        shop: shop
      }
    });

    calcLogger.debug('Customer lookup result', {
      found: !!customer,
      currentTierId: customer?.currentTierId || 'none',
      shopifyCustomerId: customer?.shopifyCustomerId
    });

    // Get current tier separately if exists
    let currentTier = null;
    if (customer?.currentTierId) {
      currentTier = await prisma.tier.findUnique({
        where: { id: customer.currentTierId }
      });
      calcLogger.debug('Current tier', { tierName: currentTier?.name || 'not found' });
    }

    if (!customer) {
      calcLogger.error('Customer not found in database');
      throw new Error(`Customer ${customerId} not found`);
    }

    // Get all tiers for the shop
    const tiers = await prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' } // Order by lowest spend first (correct order)
    });

    logger.debug(`Found ${tiers.length} tiers for shop ${shop}`);
    tiers.forEach(tier => {
      logger.debug(`  - ${tier.name}: minSpend=$${tier.minSpend}, cashback=${tier.cashbackPercent}%, period=${tier.evaluationPeriod}`);
    });

    if (tiers.length === 0) {
      logger.debug(`WARNING: No tiers configured for shop ${shop}`);
      return {
        customerId,
        previousTierId: customer.currentTierId,
        previousTierName: currentTier?.name || null,
        newTierId: null,
        newTierName: null,
        totalSpending: 0,
        changed: false
      };
    }

    // Find the highest tier the customer qualifies for using LOCAL DATABASE
    let qualifyingTier = null;
    let highestQualifyingSpend = 0;

    // Cache spending calculations by evaluation period to avoid redundant DB queries
    // This is critical for performance - shops with 4+ tiers using the same period
    // would otherwise run identical queries multiple times
    const spendingCache = new Map<string, CustomerSpending>();

    for (const tier of tiers) {
      const period = tier.evaluationPeriod || 'LIFETIME';

      // Check cache first - reuse if same evaluation period already calculated
      let spending = spendingCache.get(period);
      if (!spending) {
        // Calculate spending from LOCAL DATABASE for THIS tier's evaluation period
        spending = await getCustomerSpendingFromDB(shop, customerId, period);
        spendingCache.set(period, spending);
        logger.debug(`Calculated spending for period ${period}: $${spending.totalSpending} (cached)`);
      }

      logger.debug(`Evaluating tier ${tier.name}: minSpend=${tier.minSpend}, period=${period}, customerSpending=${spending.totalSpending}`);

      // Check if customer qualifies for this tier
      if (spending.totalSpending >= tier.minSpend) {
        logger.debug(`Customer qualifies for ${tier.name}`);

        // Track the highest tier they qualify for
        if (!qualifyingTier || tier.minSpend > qualifyingTier.minSpend) {
          qualifyingTier = tier;
          highestQualifyingSpend = spending.totalSpending;
          logger.debug(`New best tier: ${tier.name}`);
        }
      }
    }

    logger.debug(`Final result - Customer ${customerId} qualifies for tier: ${qualifyingTier?.name || 'None'} with spending: ${highestQualifyingSpend}`);

    // Check if tier needs to change
    const tierChanged = qualifyingTier?.id !== customer.currentTierId;

    // If skipUpdate is true, return the result without making DB changes
    // This is used by tier resolution to get spending-based tier info without side effects
    if (context?.skipUpdate) {
      logger.debug(`skipUpdate=true - returning calculation result without DB changes`);
      return {
        customerId,
        previousTierId: customer.currentTierId,
        previousTierName: currentTier?.name || null,
        newTierId: qualifyingTier?.id || null,
        newTierName: qualifyingTier?.name || null,
        totalSpending: highestQualifyingSpend,
        changed: tierChanged
      };
    }

    if (tierChanged) {
      // Update customer's tier
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: qualifyingTier?.id || null,
          updatedAt: new Date()
        }
      });

      // Log the tier change
      await prisma.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId,
          shop,
          fromTierId: customer.currentTierId,
          fromTierName: currentTier?.name || null,
          toTierId: qualifyingTier?.id || null,
          toTierName: qualifyingTier?.name || null,
          changeType: await determineTierChangeType(customer.currentTierId, qualifyingTier?.id),
          triggerType: context?.triggerType || 'SPENDING_MILESTONE',
          totalSpending: highestQualifyingSpend,
          periodSpending: highestQualifyingSpend,
          orderId: context?.orderId || null,
          metadata: {
            evaluationPeriod: qualifyingTier?.evaluationPeriod || 'LIFETIME',
            calculatedAt: new Date().toISOString(),
            source: 'local_db',
            triggeredBy: context?.orderId ? 'webhook' : 'manual'
          },
          createdAt: new Date()
        }
      });

      logger.debug(`Customer ${customerId} tier changed from ${currentTier?.name || 'None'} to ${qualifyingTier?.name || 'None'}`);
    }

    return {
      customerId,
      previousTierId: customer.currentTierId,
      previousTierName: currentTier?.name || null,
      newTierId: qualifyingTier?.id || null,
      newTierName: qualifyingTier?.name || null,
      totalSpending: highestQualifyingSpend,
      changed: tierChanged
    };
  } catch (error) {
    logger.error(`Error calculating tier from DB for customer ${customerId}`, error);
    return {
      customerId,
      previousTierId: null,
      previousTierName: null,
      newTierId: null,
      newTierName: null,
      totalSpending: 0,
      changed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}


/**
 * Calculate tiers for multiple customers using the Tier Resolution System
 *
 * This function uses the resolver which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers) - Priority 1
 * 2. Active tier subscriptions (recurring payments) - Priority 2
 * 3. Active tier purchases (one-time payments) - Priority 3
 * 4. Spending-based tiers (automatic calculation) - Priority 4
 */
export async function calculateTiersForCustomers(
  shop: string,
  customerIds: string[],
  _admin: AdminApiContextType
): Promise<TierCalculationResult[]> {
  logger.debug(`Calculating tiers for ${customerIds.length} customers via Tier Resolution System`);

  const results: TierCalculationResult[] = [];

  // Process customers in batches to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < customerIds.length; i += batchSize) {
    const batch = customerIds.slice(i, i + batchSize);

    // Use the resolver for each customer to respect tier priority
    const batchResults = await Promise.all(
      batch.map(async (customerId) => {
        try {
          const result = await updateCustomerToEffectiveTier(shop, customerId, {
            triggeredBy: 'admin_batch_recalculate'
          });

          return {
            customerId,
            previousTierId: result.previousTierId,
            previousTierName: null, // Resolver doesn't return names
            newTierId: result.newTierId,
            newTierName: null, // Resolver doesn't return names
            totalSpending: 0, // Resolver handles spending calculation internally
            changed: result.changed
          } as TierCalculationResult;
        } catch (error) {
          return {
            customerId,
            previousTierId: null,
            previousTierName: null,
            newTierId: null,
            newTierName: null,
            totalSpending: 0,
            changed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          } as TierCalculationResult;
        }
      })
    );
    results.push(...batchResults);

    // Add a small delay between batches to avoid overwhelming the database
    if (i + batchSize < customerIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Calculate tiers for all customers in a shop using the Tier Resolution System
 *
 * This function uses the resolver which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers) - Priority 1
 * 2. Active tier subscriptions (recurring payments) - Priority 2
 * 3. Active tier purchases (one-time payments) - Priority 3
 * 4. Spending-based tiers (automatic calculation) - Priority 4
 *
 * This ensures that customers who purchased a tier keep it during recalculation.
 */
export async function calculateAllCustomerTiers(
  shop: string,
  admin: AdminApiContextType
): Promise<{
  total: number;
  changed: number;
  errors: number;
  results: TierCalculationResult[];
}> {
  logger.debug(`Starting tier calculation for all customers in shop ${shop} via Tier Resolution System`);
  
  // Get all customers for the shop
  const customers = await prisma.customer.findMany({
    where: { shop },
    select: { id: true }
  });

  const customerIds = customers.map(c => c.id);
  const results = await calculateTiersForCustomers(shop, customerIds, admin);
  
  const summary = {
    total: results.length,
    changed: results.filter(r => r.changed).length,
    errors: results.filter(r => r.error).length,
    results
  };
  
  logger.debug(`Completed: ${summary.total} processed, ${summary.changed} changed, ${summary.errors} errors`);
  
  return summary;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get customer spending from LOCAL DATABASE
 * Used by webhooks for faster, more reliable calculation
 */
async function getCustomerSpendingFromDB(
  shop: string,
  customerId: string,
  evaluationPeriod: 'ANNUAL' | 'LIFETIME'
): Promise<CustomerSpending> {
  try {
    logger.debug(`Getting spending from local DB for customer ${customerId}, period: ${evaluationPeriod}`);

    // Get customer to ensure we have the right one
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        shop
      }
    });

    if (!customer) {
      logger.debug(`Customer ${customerId} not found in local DB`);
      return {
        customerId,
        shopifyCustomerId: '',
        totalSpending: 0,
        orderCount: 0,
        lastOrderDate: null
      };
    }

    let whereClause: any = {
      shop,
      customerId,
      financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
      cashbackEligible: true // Exclude tier product orders
    };

    // Add date filter for annual evaluation
    if (evaluationPeriod === 'ANNUAL') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      whereClause.shopifyCreatedAt = { gte: oneYearAgo };
      logger.debug(`ANNUAL filter: orders after ${oneYearAgo.toISOString()}`);
    }

    logger.debug('Query where clause', whereClause);

    // Fetch only eligible orders using DB-level filters (not all orders)
    const eligibleOrders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        shopifyOrderName: true,
        totalPrice: true,
        totalRefunded: true,
        shopifyCreatedAt: true,
      }
    });

    logger.debug(`Found ${eligibleOrders.length} eligible orders for customer`);

    // Calculate spending from pre-filtered results
    let totalSpent = 0;
    let totalRefunded = 0;
    let lastOrderDate: Date | null = null;

    for (const order of eligibleOrders) {
      const price = order.totalPrice ? parseFloat(order.totalPrice.toString()) : 0;
      const refunded = order.totalRefunded ? parseFloat(order.totalRefunded.toString()) : 0;

      totalSpent += price;
      totalRefunded += refunded;

      if (order.shopifyCreatedAt) {
        const orderDate = new Date(order.shopifyCreatedAt);
        if (!lastOrderDate || orderDate > lastOrderDate) {
          lastOrderDate = orderDate;
        }
      }
    }

    const netSpending = totalSpent - totalRefunded;

    logger.debug('Spending calculation result', {
      eligibleOrders: eligibleOrders.length,
      totalSpent: Number(totalSpent.toFixed(2)),
      totalRefunded: Number(totalRefunded.toFixed(2)),
      netSpending: Number(netSpending.toFixed(2)),
      evaluationPeriod,
    });

    return {
      customerId,
      shopifyCustomerId: customer.shopifyCustomerId,
      totalSpending: Math.max(0, netSpending),
      orderCount: eligibleOrders.length,
      lastOrderDate: lastOrderDate
    };
  } catch (error) {
    logger.error(`Error fetching spending from DB for customer ${customerId}`, error);

    // Return zero spending on error (keeps customer in current tier)
    return {
      customerId,
      shopifyCustomerId: '',
      totalSpending: 0,
      orderCount: 0,
      lastOrderDate: null
    };
  }
}

/**
 * Determine the type of tier change by comparing minSpend.
 *
 * Higher minSpend = higher tier. A change to a tier with higher minSpend
 * is an UPGRADE; lower is a DOWNGRADE; equal (e.g. tier renamed but same
 * threshold) is treated as REASSIGNMENT-style and we keep UPGRADE since
 * TierChangeType doesn't include REASSIGNMENT here.
 */
async function determineTierChangeType(
  fromTierId: string | null,
  toTierId: string | null
): Promise<'INITIAL_ASSIGNMENT' | 'UPGRADE' | 'DOWNGRADE'> {
  if (!fromTierId && toTierId) {
    return 'INITIAL_ASSIGNMENT';
  }

  if (!toTierId) {
    return 'DOWNGRADE'; // Removed from all tiers
  }

  // Compare minSpend to decide direction
  const [fromTier, toTier] = await Promise.all([
    fromTierId ? prisma.tier.findUnique({ where: { id: fromTierId }, select: { minSpend: true } }) : null,
    prisma.tier.findUnique({ where: { id: toTierId }, select: { minSpend: true } }),
  ]);

  const fromSpend = Number(fromTier?.minSpend ?? 0);
  const toSpend = Number(toTier?.minSpend ?? 0);

  return toSpend < fromSpend ? 'DOWNGRADE' : 'UPGRADE';
}