/**
 * Tier Calculation Service
 * 
 * Handles automatic tier assignment based on customer spending.
 * Calculates tiers based on order history and evaluation periods.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

type AdminApiContextWithRest = AdminApiContext & {
  rest?: any;
};

type AdminApiContextType = AdminApiContext | AdminApiContextWithRest;
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";
import { hasManualOverride } from "./manual-tier-assignment.server";

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
 */
export async function calculateCustomerTierFromDB(
  shop: string,
  customerId: string,
  context?: {
    orderId?: string;
    triggerType?: string;
    skipOverrideCheck?: boolean;  // NEW: Allow skipping override check for tier resolution
  }
): Promise<TierCalculationResult> {
  try {
    console.log(`[TierCalc-DB] ========== Starting Tier Calculation ==========`);
    console.log(`[TierCalc-DB] Customer ID: ${customerId}`);
    console.log(`[TierCalc-DB] Shop: ${shop}`);
    if (context?.orderId) {
      console.log(`[TierCalc-DB] Triggered by Order: ${context.orderId}`);
    }
    console.log(`[TierCalc-DB] Using LOCAL DATABASE for calculation`);

    // Check if customer has a manual override (unless explicitly skipped)
    if (!context?.skipOverrideCheck) {
      const hasOverride = await hasManualOverride(customerId);

      if (hasOverride) {
        console.log(`[TierCalc-DB] Customer ${customerId} has manual tier override - skipping calculation`);

        // Get current tier info for response
        const customer = await db.customer.findFirst({
          where: {
            id: customerId,
            shop: shop
          }
        });

        let currentTier = null;
        if (customer?.currentTierId) {
          currentTier = await db.tier.findUnique({
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
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        shop: shop
      }
    });

    console.log(`[TierCalc-DB] Customer found: ${customer ? 'YES' : 'NO'}`);
    if (customer) {
      console.log(`[TierCalc-DB] Current tier ID: ${customer.currentTierId || 'none'}`);
      console.log(`[TierCalc-DB] Shopify Customer ID: ${customer.shopifyCustomerId}`);
    }

    // Get current tier separately if exists
    let currentTier = null;
    if (customer?.currentTierId) {
      currentTier = await db.tier.findUnique({
        where: { id: customer.currentTierId }
      });
      console.log(`[TierCalc-DB] Current tier name: ${currentTier?.name || 'not found'}`);
    }

    if (!customer) {
      console.error(`[TierCalc-DB] ERROR: Customer ${customerId} not found in database`);
      throw new Error(`Customer ${customerId} not found`);
    }

    // Get all tiers for the shop
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' } // Order by lowest spend first (correct order)
    });

    console.log(`[TierCalc-DB] Found ${tiers.length} tiers for shop ${shop}`);
    tiers.forEach(tier => {
      console.log(`[TierCalc-DB]   - ${tier.name}: minSpend=$${tier.minSpend}, cashback=${tier.cashbackPercent}%, period=${tier.evaluationPeriod}`);
    });

    if (tiers.length === 0) {
      console.log(`[TierCalc-DB] WARNING: No tiers configured for shop ${shop}`);
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

    for (const tier of tiers) {
      // Calculate spending from LOCAL DATABASE for THIS tier's evaluation period
      const spending = await getCustomerSpendingFromDB(
        shop,
        customerId,
        tier.evaluationPeriod || 'LIFETIME'
      );

      console.log(`[TierCalc] Evaluating tier ${tier.name}: minSpend=${tier.minSpend}, period=${tier.evaluationPeriod}, customerSpending=${spending.totalSpending}`);

      // Check if customer qualifies for this tier
      if (spending.totalSpending >= tier.minSpend) {
        console.log(`[TierCalc] Customer qualifies for ${tier.name}`);

        // Track the highest tier they qualify for
        if (!qualifyingTier || tier.minSpend > qualifyingTier.minSpend) {
          qualifyingTier = tier;
          highestQualifyingSpend = spending.totalSpending;
          console.log(`[TierCalc] New best tier: ${tier.name}`);
        }
      }
    }

    console.log(`[TierCalc] Final result - Customer ${customerId} qualifies for tier: ${qualifyingTier?.name || 'None'} with spending: ${highestQualifyingSpend}`);

    // Check if tier needs to change
    const tierChanged = qualifyingTier?.id !== customer.currentTierId;

    if (tierChanged) {
      // Update customer's tier
      await db.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: qualifyingTier?.id || null,
          updatedAt: new Date()
        }
      });

      // Log the tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId,
          shop,
          fromTierId: customer.currentTierId,
          fromTierName: currentTier?.name || null,
          toTierId: qualifyingTier?.id || null,
          toTierName: qualifyingTier?.name || null,
          changeType: determineTierChangeType(customer.currentTierId, qualifyingTier?.id),
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

      console.log(`[TierCalc] Customer ${customerId} tier changed from ${currentTier?.name || 'None'} to ${qualifyingTier?.name || 'None'}`);
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
    console.error(`[TierCalc] Error calculating tier from DB for customer ${customerId}:`, error);
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
 * Calculate and update tier for a single customer using SHOPIFY API
 * Used by admin UI for accurate, real-time calculation
 */
export async function calculateCustomerTier(
  shop: string,
  customerId: string,
  admin: AdminApiContextType,
  context?: {
    orderId?: string;
    triggerType?: string;
  }
): Promise<TierCalculationResult> {
  try {
    console.log(`[TierCalc] Calculating tier for customer ${customerId}`);
    
    // Check if customer has a manual override
    const hasOverride = await hasManualOverride(customerId);
    if (hasOverride) {
      console.log(`[TierCalc] Customer ${customerId} has manual override - skipping calculation`);
      
      // Get customer data to return current state
      const customer = await db.customer.findFirst({
        where: { 
          id: customerId,
          shop: shop 
        }
      });
      
      let currentTier = null;
      if (customer?.currentTierId) {
        currentTier = await db.tier.findUnique({
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
    
    // Get customer data
    const customer = await db.customer.findFirst({
      where: { 
        id: customerId,
        shop: shop 
      }
    });
    
    // Get current tier separately if exists
    let currentTier = null;
    if (customer?.currentTierId) {
      currentTier = await db.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Get all tiers for the shop
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' } // Order by lowest spend first (correct order)
    });

    if (tiers.length === 0) {
      console.log(`[TierCalc] No tiers configured for shop ${shop}`);
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

    // Find the highest tier the customer qualifies for
    // Each tier needs to be evaluated with its own evaluation period
    let qualifyingTier = null;
    let highestQualifyingSpend = 0;

    for (const tier of tiers) {
      // Calculate spending based on THIS tier's evaluation period
      const spending = await getCustomerSpending(
        shop,
        customer.shopifyCustomerId,
        admin,
        tier.evaluationPeriod || 'LIFETIME'
      );

      console.log(`[TierCalc] Evaluating tier ${tier.name}: minSpend=${tier.minSpend}, period=${tier.evaluationPeriod}, customerSpending=${spending.totalSpending}`);

      // Check if customer qualifies for this tier
      if (spending.totalSpending >= tier.minSpend) {
        console.log(`[TierCalc] Customer qualifies for ${tier.name}`);

        // Track the highest tier they qualify for
        if (!qualifyingTier || tier.minSpend > qualifyingTier.minSpend) {
          qualifyingTier = tier;
          highestQualifyingSpend = spending.totalSpending;
          console.log(`[TierCalc] New best tier: ${tier.name}`);
        }
      }
    }

    console.log(`[TierCalc] Final result - Customer ${customerId} qualifies for tier: ${qualifyingTier?.name || 'None'} with spending: ${highestQualifyingSpend}`);

    // Check if tier needs to change
    const tierChanged = qualifyingTier?.id !== customer.currentTierId;

    if (tierChanged) {
      // Update customer's tier
      await db.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: qualifyingTier?.id || null,
          updatedAt: new Date()
        }
      });

      // Log the tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId,
          shop,
          fromTierId: customer.currentTierId,
          fromTierName: currentTier?.name || null,
          toTierId: qualifyingTier?.id || null,
          toTierName: qualifyingTier?.name || null,
          changeType: determineTierChangeType(customer.currentTierId, qualifyingTier?.id),
          triggerType: context?.triggerType || 'SPENDING_MILESTONE',
          totalSpending: highestQualifyingSpend,
          periodSpending: highestQualifyingSpend,
          orderId: context?.orderId || null,
          metadata: {
            evaluationPeriod: qualifyingTier?.evaluationPeriod || 'LIFETIME',
            calculatedAt: new Date().toISOString(),
            source: context?.orderId ? 'webhook' : 'manual'
          },
          createdAt: new Date()
        }
      });

      console.log(`[TierCalc] Customer ${customerId} tier changed from ${currentTier?.name || 'None'} to ${qualifyingTier?.name || 'None'}`);
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
    console.error(`[TierCalc] Error calculating tier for customer ${customerId}:`, error);
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
 * Calculate tiers for multiple customers
 */
export async function calculateTiersForCustomers(
  shop: string,
  customerIds: string[],
  admin: AdminApiContextType
): Promise<TierCalculationResult[]> {
  console.log(`[TierCalc] Calculating tiers for ${customerIds.length} customers`);
  
  const results: TierCalculationResult[] = [];
  
  // Process customers in batches to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < customerIds.length; i += batchSize) {
    const batch = customerIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(customerId => calculateCustomerTier(shop, customerId, admin))
    );
    results.push(...batchResults);
    
    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < customerIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

/**
 * Calculate tiers for all customers in a shop
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
  console.log(`[TierCalc] Starting tier calculation for all customers in shop ${shop}`);
  
  // Get all customers for the shop
  const customers = await db.customer.findMany({
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
  
  console.log(`[TierCalc] Completed: ${summary.total} processed, ${summary.changed} changed, ${summary.errors} errors`);
  
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
    console.log(`[TierCalc] Getting spending from local DB for customer ${customerId}, period: ${evaluationPeriod}`);

    // Get customer to ensure we have the right one
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        shop
      }
    });

    if (!customer) {
      console.log(`[TierCalc] Customer ${customerId} not found in local DB`);
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
      console.log(`[TierCalc] ANNUAL filter: orders after ${oneYearAgo.toISOString()}`);
    }

    console.log(`[TierCalc] Aggregate query where clause:`, JSON.stringify(whereClause, null, 2));

    // First check if customer has any orders
    const orderCount = await db.order.count({
      where: { shop, customerId }
    });
    console.log(`[TierCalc] Total orders for customer: ${orderCount}`);

    // Fetch all orders for manual calculation (Aurora Data API aggregates are unreliable)
    const allOrders = await db.order.findMany({
      where: { shop, customerId },
      select: {
        id: true,
        shopifyOrderName: true,
        totalPrice: true,
        totalRefunded: true,
        financialStatus: true,
        cashbackEligible: true,
        shopifyCreatedAt: true,
        createdAt: true
      }
    });

    console.log(`[TierCalc] Found ${allOrders.length} total orders for customer`);

    // Manual calculation of spending (more reliable than Aurora aggregates)
    let totalSpent = 0;
    let totalRefunded = 0;
    let eligibleOrderCount = 0;
    let lastOrderDate: Date | null = null;

    // Filter based on evaluation period
    const oneYearAgo = evaluationPeriod === 'ANNUAL' ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) : null;

    for (const order of allOrders) {
      // Skip if not eligible
      if (!order.cashbackEligible) {
        console.log(`[TierCalc] Order ${order.shopifyOrderName} excluded: not cashback eligible`);
        continue;
      }

      // Skip if wrong financial status
      if (order.financialStatus !== 'PAID' && order.financialStatus !== 'PARTIALLY_REFUNDED') {
        console.log(`[TierCalc] Order ${order.shopifyOrderName} excluded: status is ${order.financialStatus}`);
        continue;
      }

      // Skip if outside evaluation period
      if (evaluationPeriod === 'ANNUAL' && oneYearAgo && order.shopifyCreatedAt) {
        const orderDate = new Date(order.shopifyCreatedAt);
        if (orderDate < oneYearAgo) {
          console.log(`[TierCalc] Order ${order.shopifyOrderName} excluded: outside ANNUAL period (${orderDate.toISOString()})`);
          continue;
        }
      }

      // Add to totals
      const price = order.totalPrice ? parseFloat(order.totalPrice.toString()) : 0;
      const refunded = order.totalRefunded ? parseFloat(order.totalRefunded.toString()) : 0;

      totalSpent += price;
      totalRefunded += refunded;
      eligibleOrderCount++;

      // Track last order date
      if (order.shopifyCreatedAt) {
        const orderDate = new Date(order.shopifyCreatedAt);
        if (!lastOrderDate || orderDate > lastOrderDate) {
          lastOrderDate = orderDate;
        }
      }

      console.log(`[TierCalc] Order ${order.shopifyOrderName} included: price=$${price}, refunded=$${refunded}`);
    }

    const netSpending = totalSpent - totalRefunded;

    console.log(`[TierCalc] Manual calculation results:`);
    console.log(`[TierCalc]   - Total orders: ${allOrders.length}`);
    console.log(`[TierCalc]   - Eligible orders: ${eligibleOrderCount}`);
    console.log(`[TierCalc]   - Total spent: $${totalSpent.toFixed(2)}`);
    console.log(`[TierCalc]   - Total refunded: $${totalRefunded.toFixed(2)}`);
    console.log(`[TierCalc]   - Net spending: $${netSpending.toFixed(2)}`);
    console.log(`[TierCalc]   - Evaluation period: ${evaluationPeriod}`);

    // Try Aurora aggregate for comparison (debugging)
    try {
      const orderStats = await db.order.aggregate({
        where: whereClause,
        _sum: {
          totalPrice: true,
          totalRefunded: true
        },
        _count: {
          id: true
        }
      });

      const auroraTotal = Number(orderStats._sum?.totalPrice || 0);
      const auroraRefunded = Number(orderStats._sum?.totalRefunded || 0);
      const auroraCount = orderStats._count?.id || 0;

      console.log(`[TierCalc] Aurora aggregate comparison:`);
      console.log(`[TierCalc]   - Aurora count: ${auroraCount} vs Manual: ${eligibleOrderCount}`);
      console.log(`[TierCalc]   - Aurora total: $${auroraTotal} vs Manual: $${totalSpent}`);
      console.log(`[TierCalc]   - Aurora refunded: $${auroraRefunded} vs Manual: $${totalRefunded}`);

      if (auroraCount !== eligibleOrderCount || Math.abs(auroraTotal - totalSpent) > 0.01) {
        console.warn(`[TierCalc] WARNING: Aurora aggregate mismatch detected! Using manual calculation.`);
      }
    } catch (aggError) {
      console.error(`[TierCalc] Aurora aggregate error (using manual calc):`, aggError);
    }

    return {
      customerId,
      shopifyCustomerId: customer.shopifyCustomerId,
      totalSpending: Math.max(0, netSpending),
      orderCount: eligibleOrderCount,
      lastOrderDate: lastOrderDate
    };
  } catch (error) {
    console.error(`[TierCalc] Error fetching spending from DB for customer ${customerId}:`, error);

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
 * Get customer spending from Shopify orders
 */
async function getCustomerSpending(
  shop: string,
  shopifyCustomerId: string,
  admin: AdminApiContextType,
  evaluationPeriod: 'ANNUAL' | 'LIFETIME'
): Promise<CustomerSpending> {
  try {
    // Calculate date filter for annual evaluation
    const dateFilter = evaluationPeriod === 'ANNUAL' 
      ? `created_at:>${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()}` 
      : '';

    // Query Shopify for customer orders
    const query = `
      query GetCustomerOrders($customerId: ID!, $first: Int!) {
        customer(id: $customerId) {
          orders(first: $first, query: "financial_status:paid ${dateFilter}") {
            edges {
              node {
                id
                totalPriceSet {
                  shopMoney {
                    amount
                  }
                }
                refunds {
                  refundLineItems(first: 100) {
                    edges {
                      node {
                        priceSet {
                          shopMoney {
                            amount
                          }
                        }
                      }
                    }
                  }
                }
                createdAt
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: {
        customerId: `gid://shopify/Customer/${shopifyCustomerId}`,
        first: 250 // Get up to 250 orders
      }
    });

    const data = await response.json();
    
    if ('errors' in data && data.errors) {
      console.error('[TierCalc] GraphQL errors:', data.errors);
      throw new Error('Failed to fetch customer orders');
    }

    const orders = data.data?.customer?.orders?.edges || [];
    
    // Calculate total spending (orders minus refunds)
    let totalSpending = 0;
    let lastOrderDate = null;
    
    for (const edge of orders) {
      const order = edge.node;
      const orderAmount = parseFloat(order.totalPriceSet.shopMoney.amount);
      
      // Subtract refunds
      let refundAmount = 0;
      if (order.refunds && order.refunds.length > 0) {
        for (const refund of order.refunds) {
          for (const refundEdge of refund.refundLineItems.edges) {
            refundAmount += parseFloat(refundEdge.node.priceSet.shopMoney.amount);
          }
        }
      }
      
      totalSpending += (orderAmount - refundAmount);
      
      if (!lastOrderDate || new Date(order.createdAt) > lastOrderDate) {
        lastOrderDate = new Date(order.createdAt);
      }
    }

    return {
      customerId: shopifyCustomerId,
      shopifyCustomerId,
      totalSpending: Math.max(0, totalSpending), // Ensure non-negative
      orderCount: orders.length,
      lastOrderDate
    };
  } catch (error) {
    console.error(`[TierCalc] Error fetching spending for customer ${shopifyCustomerId}:`, error);
    
    // Return zero spending on error (keeps customer in current tier)
    return {
      customerId: shopifyCustomerId,
      shopifyCustomerId,
      totalSpending: 0,
      orderCount: 0,
      lastOrderDate: null
    };
  }
}

/**
 * Determine the type of tier change
 */
function determineTierChangeType(
  fromTierId: string | null,
  toTierId: string | null
): 'INITIAL_ASSIGNMENT' | 'UPGRADE' | 'DOWNGRADE' {
  if (!fromTierId && toTierId) {
    return 'INITIAL_ASSIGNMENT';
  }
  
  if (!toTierId) {
    return 'DOWNGRADE'; // Removed from all tiers
  }
  
  // For upgrade/downgrade, we'd need to compare tier levels
  // Since we don't have explicit levels, we'll consider any change as an upgrade
  // In a real scenario, you might compare minSpend values
  return 'UPGRADE';
}

/**
 * Calculate tier for a customer after a new order
 * Used by the order webhook
 */
export async function calculateTierAfterOrder(
  shop: string,
  shopifyCustomerId: string,
  orderAmount: number,
  admin: AdminApiContextType
): Promise<TierCalculationResult | null> {
  try {
    // Find the customer
    const customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId
      }
    });

    if (!customer) {
      console.log(`[TierCalc] Customer ${shopifyCustomerId} not found, skipping tier calculation`);
      return null;
    }

    // Calculate tier for this customer
    return await calculateCustomerTier(shop, customer.id, admin);
  } catch (error) {
    console.error(`[TierCalc] Error calculating tier after order:`, error);
    return null;
  }
}