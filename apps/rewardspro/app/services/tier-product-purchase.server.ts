/**
 * Tier Product Purchase Service
 * 
 * Handles automatic tier assignment when customers purchase tier membership products.
 * Integrates with the manual override system to protect purchased tiers from recalculation.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { assignCustomerToTier } from "./manual-tier-assignment.server";
import db from "../db.server";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface PurchaseAssignmentResult {
  success: boolean;
  customerId: string;
  tierId: string | null;
  tierName: string | null;
  duration: string;
  expiresAt: Date | null;
  message?: string;
  error?: string;
}

interface TierInfo {
  tierName: string | null;
  duration: string | null;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Process tier product purchase and assign customer to tier with override protection
 */
export async function processTierProductPurchase(
  shop: string,
  shopifyCustomerId: string,
  orderId: string,
  productId: string,
  variantId: string,
  sku: string,
  productTags: string[],
  productTitle: string,
  admin: AdminApiContext
): Promise<PurchaseAssignmentResult> {
  try {
    console.log(`[TierProductPurchase] Processing purchase for customer ${shopifyCustomerId}`);
    console.log(`[TierProductPurchase] Product: ${productTitle}, SKU: ${sku}, Tags: ${productTags.join(', ')}`);

    // 1. Verify this is a tier product
    if (!productTags.includes('tier-membership')) {
      console.log(`[TierProductPurchase] Not a tier product - missing 'tier-membership' tag`);
      return {
        success: false,
        customerId: '',
        tierId: null,
        tierName: null,
        duration: '',
        expiresAt: null,
        error: 'Not a tier product'
      };
    }

    // 2. Extract tier and duration from tags/SKU/title
    const tierInfo = extractTierInfo(productTags, sku, productTitle);
    if (!tierInfo.tierName || !tierInfo.duration) {
      console.error(`[TierProductPurchase] Could not determine tier or duration from product`);
      return {
        success: false,
        customerId: '',
        tierId: null,
        tierName: null,
        duration: '',
        expiresAt: null,
        error: `Could not determine tier (${tierInfo.tierName}) or duration (${tierInfo.duration})`
      };
    }

    console.log(`[TierProductPurchase] Extracted tier: ${tierInfo.tierName}, duration: ${tierInfo.duration}`);

    // 3. Find or create the customer
    let customer = await db.customer.findFirst({
      where: { shop, shopifyCustomerId }
    });

    if (!customer) {
      console.log(`[TierProductPurchase] Customer not found, fetching from Shopify...`);
      
      // Try to fetch customer from Shopify
      const customerResponse = await admin.graphql(
        `query getCustomer($id: ID!) {
          customer(id: $id) {
            email
            firstName
            lastName
          }
        }`,
        { variables: { id: `gid://shopify/Customer/${shopifyCustomerId}` } }
      );

      const customerData = await customerResponse.json();
      
      if (customerData.data?.customer) {
        // Create customer if they exist in Shopify
        const { email } = customerData.data.customer;
        
        customer = await db.customer.create({
          data: {
            shop,
            shopifyCustomerId,
            email: email || `customer_${shopifyCustomerId}@example.com`,
            storeCredit: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        
        console.log(`[TierProductPurchase] Created customer ${customer.id}`);
      } else {
        return {
          success: false,
          customerId: '',
          tierId: null,
          tierName: null,
          duration: tierInfo.duration,
          expiresAt: null,
          error: 'Customer not found in database or Shopify'
        };
      }
    }

    // 4. Find the tier
    const tier = await db.tier.findFirst({
      where: { 
        shop,
        name: { 
          equals: tierInfo.tierName,
          mode: 'insensitive'
        }
      }
    });

    if (!tier) {
      console.error(`[TierProductPurchase] Tier '${tierInfo.tierName}' not found for shop ${shop}`);
      
      // List available tiers for debugging
      const availableTiers = await db.tier.findMany({
        where: { shop },
        select: { name: true }
      });
      console.log(`[TierProductPurchase] Available tiers: ${availableTiers.map(t => t.name).join(', ')}`);
      
      return {
        success: false,
        customerId: customer.id,
        tierId: null,
        tierName: tierInfo.tierName,
        duration: tierInfo.duration,
        expiresAt: null,
        error: `Tier '${tierInfo.tierName}' not found. Available tiers: ${availableTiers.map(t => t.name).join(', ')}`
      };
    }

    // 5. Calculate override options based on duration
    const overrideOptions = calculateOverrideOptions(tierInfo.duration);
    console.log(`[TierProductPurchase] Override options:`, overrideOptions);

    // 6. Assign customer to tier with protection
    const result = await assignCustomerToTier(
      shop,
      customer.id,
      tier.id,
      'system-purchase', // System identifier for purchase-based assignments
      `Purchased ${tierInfo.tierName} tier membership (${tierInfo.duration.toLowerCase()}) via Order #${orderId}`,
      overrideOptions
    );

    // 7. Update tier change log with purchase details
    if (result.success) {
      // Update the most recent tier change log entry to mark it as a product purchase
      const recentChange = await db.tierChangeLog.findFirst({
        where: {
          customerId: customer.id,
          toTierId: tier.id,
          createdAt: {
            gte: new Date(Date.now() - 60000) // Within last minute
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recentChange) {
        // Get existing metadata
        const existingMetadata = (recentChange.metadata as any) || {};
        
        await db.tierChangeLog.update({
          where: { id: recentChange.id },
          data: {
            triggerType: 'PRODUCT_PURCHASE', // Change from MANUAL_ADMIN to PRODUCT_PURCHASE
            orderId: orderId,
            metadata: {
              ...existingMetadata,
              ...overrideOptions,
              productId,
              variantId,
              sku,
              productTitle,
              purchaseDate: new Date().toISOString(),
              duration: tierInfo.duration
            }
          }
        });
        
        console.log(`[TierProductPurchase] Updated tier change log to PRODUCT_PURCHASE trigger`);
      }
    }

    // 8. Calculate expiration date if applicable
    const expiresAt = overrideOptions.overrideDuration 
      ? new Date(Date.now() + overrideOptions.overrideDuration * 24 * 60 * 60 * 1000)
      : null;

    console.log(`[TierProductPurchase] Successfully assigned customer ${customer.id} to tier ${tier.name}`);
    if (expiresAt) {
      console.log(`[TierProductPurchase] Membership expires at: ${expiresAt.toISOString()}`);
    } else {
      console.log(`[TierProductPurchase] Membership is lifetime (permanent)`);
    }

    return {
      success: result.success,
      customerId: customer.id,
      tierId: tier.id,
      tierName: tier.name,
      duration: tierInfo.duration,
      expiresAt,
      message: result.message || `Customer assigned to ${tier.name} tier via product purchase`
    };
  } catch (error) {
    console.error('[TierProductPurchase] Error:', error);
    return {
      success: false,
      customerId: '',
      tierId: null,
      tierName: null,
      duration: '',
      expiresAt: null,
      error: error instanceof Error ? error.message : 'Unknown error processing tier product purchase'
    };
  }
}

/**
 * Extract tier information from product tags, SKU, and title
 */
function extractTierInfo(tags: string[], sku: string, title: string): TierInfo {
  let tierName = null;
  let duration = null;

  // Common tier names to look for
  const tierNames = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'vip', 'premium', 'basic', 'pro'];
  
  // 1. Try to extract from tags first
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    
    // Check for tier name
    if (!tierName) {
      for (const tier of tierNames) {
        if (lowerTag.includes(tier)) {
          tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
          break;
        }
      }
    }
    
    // Check for duration
    if (!duration) {
      if (lowerTag.includes('monthly') || lowerTag === 'month') {
        duration = 'MONTHLY';
      } else if (lowerTag.includes('quarterly') || lowerTag === 'quarter') {
        duration = 'QUARTERLY';
      } else if (lowerTag.includes('annual') || lowerTag.includes('yearly') || lowerTag === 'year') {
        duration = 'ANNUAL';
      } else if (lowerTag.includes('lifetime') || lowerTag === 'permanent') {
        duration = 'LIFETIME';
      }
    }
  }

  // 2. Try to extract from title if not found in tags
  if (!tierName || !duration) {
    const lowerTitle = title.toLowerCase();
    
    // Extract tier name from title
    if (!tierName) {
      for (const tier of tierNames) {
        if (lowerTitle.includes(tier)) {
          tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
          break;
        }
      }
    }
    
    // Extract duration from title
    if (!duration) {
      if (lowerTitle.includes('monthly') || lowerTitle.includes('month')) {
        duration = 'MONTHLY';
      } else if (lowerTitle.includes('quarterly') || lowerTitle.includes('quarter')) {
        duration = 'QUARTERLY';
      } else if (lowerTitle.includes('annual') || lowerTitle.includes('yearly') || lowerTitle.includes('year')) {
        duration = 'ANNUAL';
      } else if (lowerTitle.includes('lifetime') || lowerTitle.includes('permanent')) {
        duration = 'LIFETIME';
      }
    }
  }

  // 3. Try to extract from SKU as last resort
  // SKU format: SHOP-TIER-DUR-DATE-RND (e.g., ACME-GOLD-A-2501-X9K)
  if (!tierName || !duration) {
    const skuParts = sku.split('-');
    if (skuParts.length >= 3) {
      // Extract tier name from second part
      if (!tierName && skuParts[1]) {
        const skuTier = skuParts[1].toLowerCase();
        for (const tier of tierNames) {
          if (skuTier.includes(tier)) {
            tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
            break;
          }
        }
        // If still not found, use the SKU part as-is
        if (!tierName) {
          tierName = skuParts[1].charAt(0).toUpperCase() + skuParts[1].slice(1).toLowerCase();
        }
      }
      
      // Extract duration from third part
      if (!duration && skuParts[2]) {
        const durationMap: Record<string, string> = {
          'M': 'MONTHLY',
          'Q': 'QUARTERLY',
          'A': 'ANNUAL',
          'L': 'LIFETIME'
        };
        duration = durationMap[skuParts[2].toUpperCase()] || null;
      }
    }
  }

  console.log(`[TierProductPurchase] Extracted from product - Tier: ${tierName}, Duration: ${duration}`);
  
  return { tierName, duration };
}

/**
 * Calculate override options based on duration
 */
function calculateOverrideOptions(duration: string): {
  permanentOverride?: boolean;
  overrideDuration?: number;
} {
  switch (duration.toUpperCase()) {
    case 'MONTHLY':
      return { overrideDuration: 30 };
    case 'QUARTERLY':
      return { overrideDuration: 90 };
    case 'ANNUAL':
      return { overrideDuration: 365 };
    case 'LIFETIME':
      return { permanentOverride: true };
    default:
      console.warn(`[TierProductPurchase] Unknown duration '${duration}', defaulting to monthly`);
      return { overrideDuration: 30 };
  }
}

/**
 * Check if a tier membership needs renewal
 */
export async function checkTierMembershipExpiry(
  customerId: string
): Promise<{
  needsRenewal: boolean;
  expiresAt: Date | null;
  daysRemaining: number | null;
  isPurchased: boolean;
}> {
  try {
    // Find the most recent tier assignment
    const lastChange = await db.tierChangeLog.findFirst({
      where: { 
        customerId,
        triggerType: { in: ['PRODUCT_PURCHASE', 'MANUAL_ADMIN'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastChange) {
      return { 
        needsRenewal: false, 
        expiresAt: null, 
        daysRemaining: null,
        isPurchased: false 
      };
    }

    const isPurchased = lastChange.triggerType === 'PRODUCT_PURCHASE';

    // Aurora Data API may return metadata as a string, so we need to parse it
    let metadata = lastChange.metadata as any;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (error) {
        console.error(`[TierProductPurchase] Failed to parse metadata string:`, error);
        metadata = null;
      }
    }

    // Permanent override never expires
    if (metadata?.permanentOverride === true) {
      return { 
        needsRenewal: false, 
        expiresAt: null, 
        daysRemaining: null,
        isPurchased 
      };
    }

    // Check temporary override
    if (metadata?.overrideDuration) {
      const expiresAt = new Date(lastChange.createdAt);
      expiresAt.setDate(expiresAt.getDate() + metadata.overrideDuration);
      
      const now = new Date();
      const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        needsRenewal: daysRemaining <= 7 && daysRemaining > 0, // Needs renewal if 7 days or less (but not expired)
        expiresAt,
        daysRemaining: Math.max(0, daysRemaining),
        isPurchased
      };
    }

    return { 
      needsRenewal: false, 
      expiresAt: null, 
      daysRemaining: null,
      isPurchased 
    };
  } catch (error) {
    console.error(`[TierProductPurchase] Error checking expiry for customer ${customerId}:`, error);
    return { 
      needsRenewal: false, 
      expiresAt: null, 
      daysRemaining: null,
      isPurchased: false 
    };
  }
}

/**
 * Handle tier product refund - remove override protection
 */
export async function handleTierProductRefund(
  shop: string,
  shopifyCustomerId: string,
  orderId: string,
  productId: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[TierProductPurchase] Processing refund for order ${orderId}, product ${productId}`);
    
    // Find the customer
    const customer = await db.customer.findFirst({
      where: { shop, shopifyCustomerId }
    });

    if (!customer) {
      return { 
        success: false, 
        message: 'Customer not found' 
      };
    }

    // Find the tier change related to this order
    const purchaseChange = await db.tierChangeLog.findFirst({
      where: {
        customerId: customer.id,
        orderId: orderId,
        triggerType: 'PRODUCT_PURCHASE'
      }
    });

    if (!purchaseChange) {
      console.log(`[TierProductPurchase] No tier purchase found for order ${orderId}`);
      return { 
        success: false, 
        message: 'No tier purchase found for this order' 
      };
    }

    // Create a new log entry to remove the override
    await db.tierChangeLog.create({
      data: {
        customerId: customer.id,
        shop,
        fromTierId: purchaseChange.toTierId,
        fromTierName: purchaseChange.toTierName,
        toTierId: null,
        toTierName: null,
        changeType: 'DOWNGRADE',
        triggerType: 'MANUAL_ADMIN',
        note: `Tier membership refunded (Order #${orderId})`,
        processedBy: 'system-refund',
        metadata: {
          action: 'refund_remove_override',
          originalOrderId: orderId,
          refundDate: new Date().toISOString()
        },
        createdAt: new Date()
      }
    });

    console.log(`[TierProductPurchase] Tier override removed due to refund`);
    
    return { 
      success: true, 
      message: 'Tier membership refunded and override removed' 
    };
  } catch (error) {
    console.error('[TierProductPurchase] Error handling refund:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Error processing refund' 
    };
  }
}