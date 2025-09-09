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
 * Calculate and update tier for a single customer
 */
export async function calculateCustomerTier(
  shop: string,
  customerId: string,
  admin: AdminApiContextType
): Promise<TierCalculationResult> {
  try {
    console.log(`[TierCalc] Calculating tier for customer ${customerId}`);
    
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
      orderBy: { minSpend: 'desc' } // Order by highest spend first
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

    // Calculate customer spending from Shopify
    const spending = await getCustomerSpending(
      shop,
      customer.shopifyCustomerId,
      admin,
      tiers[0]?.evaluationPeriod || 'LIFETIME' // Use first tier's evaluation period
    );

    // Find the appropriate tier based on spending
    const qualifyingTier = tiers.find(tier => spending.totalSpending >= tier.minSpend);

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
          triggerType: 'SPENDING_MILESTONE',
          totalSpending: spending.totalSpending,
          periodSpending: spending.totalSpending,
          metadata: {
            orderCount: spending.orderCount,
            lastOrderDate: spending.lastOrderDate,
            calculatedAt: new Date().toISOString()
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
      totalSpending: spending.totalSpending,
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