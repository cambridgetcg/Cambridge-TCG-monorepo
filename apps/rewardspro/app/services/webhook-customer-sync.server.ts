/**
 * Customer Webhook Sync Service
 * 
 * This service handles customer data synchronization from Shopify webhooks.
 * It can be called from either HTTPS webhook handlers or Lambda functions.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '~/db.server';
import { calculateCustomerTier } from './tier-calculation.server';
import { hasManualOverride } from './manual-tier-assignment.server';
import type { Customer, Tier } from '@prisma/client';

/**
 * Shopify customer webhook payload interface
 */
export interface ShopifyCustomerWebhook {
  id: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  tags?: string | null;
  total_spent?: string | number;
  orders_count?: number;
  last_order_id?: number | null;
  created_at?: string;
  updated_at?: string;
  state?: string;
  verified_email?: boolean;
  note?: string | null;
  currency?: string;
  accepts_marketing?: boolean;
  marketing_opt_in_level?: string | null;
  tax_exempt?: boolean;
  tax_exemptions?: string[];
  admin_graphql_api_id?: string;
}

/**
 * Process a customers/create webhook
 */
export async function handleCustomerCreate(
  payload: ShopifyCustomerWebhook,
  shopDomain: string
): Promise<{ action: string; customerId: string }> {
  console.log(`[CustomerSync] Processing customers/create for shop: ${shopDomain}`);
  
  const customerData = parseCustomerPayload(payload);
  
  // Check if customer already exists
  const existingCustomer = await db.customer.findFirst({
    where: {
      shop: shopDomain,
      shopifyCustomerId: customerData.shopifyCustomerId,
    },
  });
  
  if (existingCustomer) {
    console.log(`[CustomerSync] Customer already exists: ${customerData.shopifyCustomerId}`);
    // Update instead of create
    return await updateCustomer(existingCustomer.id, customerData, shopDomain);
  }
  
  // Create new customer
  const customerId = uuidv4();
  const now = new Date();
  
  const customer = await db.customer.create({
    data: {
      id: customerId,
      shop: shopDomain,
      shopifyCustomerId: customerData.shopifyCustomerId,
      email: customerData.email,
      firstName: customerData.firstName,
      lastName: customerData.lastName,
      phone: customerData.phone,
      tags: customerData.tags,
      totalSpent: customerData.totalSpent,
      ordersCount: customerData.ordersCount,
      lastOrderDate: customerData.lastOrderDate,
      shopifyCreatedAt: customerData.shopifyCreatedAt,
      shopifyUpdatedAt: customerData.shopifyUpdatedAt,
      storeCredit: 0,
      tierId: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  
  console.log(`[CustomerSync] Created customer: ${customerId}`);
  
  // Calculate and assign tier
  const tier = await calculateAndAssignTier(customerId, shopDomain, customerData.totalSpent);
  
  if (tier) {
    console.log(`[CustomerSync] Assigned tier ${tier.name} to customer ${customerId}`);
  }
  
  return {
    action: 'created',
    customerId: customerId,
  };
}

/**
 * Process a customers/update webhook
 */
export async function handleCustomerUpdate(
  payload: ShopifyCustomerWebhook,
  shopDomain: string
): Promise<{ action: string; customerId: string }> {
  console.log(`[CustomerSync] Processing customers/update for shop: ${shopDomain}`);
  
  const customerData = parseCustomerPayload(payload);
  
  // Find existing customer
  const existingCustomer = await db.customer.findFirst({
    where: {
      shop: shopDomain,
      shopifyCustomerId: customerData.shopifyCustomerId,
    },
  });
  
  if (!existingCustomer) {
    console.log(`[CustomerSync] Customer not found, creating: ${customerData.shopifyCustomerId}`);
    // Create if doesn't exist
    return await handleCustomerCreate(payload, shopDomain);
  }
  
  return await updateCustomer(existingCustomer.id, customerData, shopDomain);
}

/**
 * Process a customers/delete webhook
 */
export async function handleCustomerDelete(
  payload: ShopifyCustomerWebhook,
  shopDomain: string
): Promise<{ action: string; shopifyCustomerId: string }> {
  console.log(`[CustomerSync] Processing customers/delete for shop: ${shopDomain}`);
  
  const shopifyCustomerId = String(payload.id);
  
  // We don't actually delete, just mark as deleted
  const customer = await db.customer.updateMany({
    where: {
      shop: shopDomain,
      shopifyCustomerId: shopifyCustomerId,
    },
    data: {
      deletedAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  console.log(`[CustomerSync] Soft deleted customer: ${shopifyCustomerId}`);
  
  return {
    action: 'deleted',
    shopifyCustomerId: shopifyCustomerId,
  };
}

/**
 * Update an existing customer
 */
async function updateCustomer(
  customerId: string,
  customerData: ReturnType<typeof parseCustomerPayload>,
  shopDomain: string
): Promise<{ action: string; customerId: string }> {
  const customer = await db.customer.update({
    where: {
      id: customerId,
    },
    data: {
      email: customerData.email,
      firstName: customerData.firstName,
      lastName: customerData.lastName,
      phone: customerData.phone,
      tags: customerData.tags,
      totalSpent: customerData.totalSpent,
      ordersCount: customerData.ordersCount,
      lastOrderDate: customerData.lastOrderDate,
      shopifyUpdatedAt: customerData.shopifyUpdatedAt,
      updatedAt: new Date(),
    },
  });
  
  console.log(`[CustomerSync] Updated customer: ${customerId}`);
  
  // Recalculate tier based on new total spent
  const tier = await calculateAndAssignTier(customerId, shopDomain, customerData.totalSpent);
  
  if (tier) {
    console.log(`[CustomerSync] Updated tier to ${tier.name} for customer ${customerId}`);
  }
  
  return {
    action: 'updated',
    customerId: customerId,
  };
}

/**
 * Parse Shopify customer webhook payload
 */
function parseCustomerPayload(payload: ShopifyCustomerWebhook) {
  return {
    shopifyCustomerId: String(payload.id),
    email: payload.email || null,
    firstName: payload.first_name || null,
    lastName: payload.last_name || null,
    phone: payload.phone || null,
    tags: payload.tags || '',
    totalSpent: typeof payload.total_spent === 'string' 
      ? parseFloat(payload.total_spent) 
      : (payload.total_spent || 0),
    ordersCount: payload.orders_count || 0,
    lastOrderDate: payload.last_order_id ? new Date() : null,
    shopifyCreatedAt: payload.created_at 
      ? new Date(payload.created_at) 
      : new Date(),
    shopifyUpdatedAt: payload.updated_at 
      ? new Date(payload.updated_at) 
      : new Date(),
  };
}

/**
 * Calculate and assign appropriate tier based on customer spending
 */
async function calculateAndAssignTier(
  customerId: string,
  shop: string,
  totalSpent: number
): Promise<Tier | null> {
  // Check if customer has a manual override
  const hasOverride = await hasManualOverride(customerId);
  if (hasOverride) {
    console.log(`[CustomerSync] Customer ${customerId} has manual override - skipping tier calculation`);
    // Return current tier without changes
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { tierId: true },
    });
    if (customer?.tierId) {
      const currentTier = await db.tier.findUnique({
        where: { id: customer.tierId },
      });
      return currentTier;
    }
    return null;
  }
  
  // Get all tiers for this shop, ordered by minSpend descending
  const tiers = await db.tier.findMany({
    where: {
      shop: shop,
    },
    orderBy: {
      minSpend: 'desc',
    },
  });
  
  if (tiers.length === 0) {
    console.log(`[CustomerSync] No tiers configured for shop: ${shop}`);
    return null;
  }
  
  // Find the appropriate tier based on spending
  let appropriateTier: Tier | null = null;
  for (const tier of tiers) {
    if (totalSpent >= tier.minSpend) {
      appropriateTier = tier;
      break; // Found the highest tier they qualify for
    }
  }
  
  if (!appropriateTier) {
    // Customer doesn't qualify for any tier
    console.log(`[CustomerSync] Customer doesn't qualify for any tier (spent: ${totalSpent})`);
    return null;
  }
  
  // Get current customer tier
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { tierId: true },
  });
  
  const previousTierId = customer?.tierId || null;
  
  // Only update if tier has changed
  if (previousTierId !== appropriateTier.id) {
    // Update customer's tier
    await db.customer.update({
      where: { id: customerId },
      data: {
        tierId: appropriateTier.id,
        updatedAt: new Date(),
      },
    });
    
    // Log tier change
    await db.tierChangeLog.create({
      data: {
        id: uuidv4(),
        customerId: customerId,
        previousTierId: previousTierId,
        newTierId: appropriateTier.id,
        changeType: previousTierId ? 
          (totalSpent > 0 ? 'UPGRADE' : 'DOWNGRADE') : 
          'INITIAL_ASSIGNMENT',
        reason: `Webhook sync: Total spent ${totalSpent.toFixed(2)} qualifies for ${appropriateTier.name}`,
        createdAt: new Date(),
      },
    });
    
    console.log(`[CustomerSync] Tier changed from ${previousTierId} to ${appropriateTier.id}`);
  }
  
  return appropriateTier;
}

/**
 * Sync all customers from a Shopify bulk webhook
 * This can be used for initial sync or bulk updates
 */
export async function syncBulkCustomers(
  customers: ShopifyCustomerWebhook[],
  shopDomain: string
): Promise<{ created: number; updated: number; failed: number }> {
  console.log(`[CustomerSync] Processing bulk sync of ${customers.length} customers for ${shopDomain}`);
  
  let created = 0;
  let updated = 0;
  let failed = 0;
  
  for (const customer of customers) {
    try {
      const existingCustomer = await db.customer.findFirst({
        where: {
          shop: shopDomain,
          shopifyCustomerId: String(customer.id),
        },
      });
      
      if (existingCustomer) {
        await handleCustomerUpdate(customer, shopDomain);
        updated++;
      } else {
        await handleCustomerCreate(customer, shopDomain);
        created++;
      }
    } catch (error) {
      console.error(`[CustomerSync] Failed to sync customer ${customer.id}:`, error);
      failed++;
    }
  }
  
  console.log(`[CustomerSync] Bulk sync complete: ${created} created, ${updated} updated, ${failed} failed`);
  
  return { created, updated, failed };
}

/**
 * Process webhook from EventBridge format
 * EventBridge wraps the Shopify payload in a specific structure
 */
export async function processEventBridgeWebhook(event: any) {
  const topic = event.detail?.metadata?.['X-Shopify-Topic'];
  const shopDomain = event.detail?.metadata?.['X-Shopify-Shop-Domain'];
  const payload = event.detail?.payload;
  
  if (!topic || !shopDomain || !payload) {
    throw new Error('Invalid EventBridge webhook format');
  }
  
  console.log(`[CustomerSync] Processing EventBridge webhook: ${topic} from ${shopDomain}`);
  
  switch (topic) {
    case 'customers/create':
      return await handleCustomerCreate(payload, shopDomain);
    case 'customers/update':
      return await handleCustomerUpdate(payload, shopDomain);
    case 'customers/delete':
      return await handleCustomerDelete(payload, shopDomain);
    default:
      throw new Error(`Unsupported webhook topic: ${topic}`);
  }
}