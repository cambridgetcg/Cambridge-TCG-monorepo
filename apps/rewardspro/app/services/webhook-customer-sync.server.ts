/**
 * Customer Webhook Sync Service
 * 
 * This service handles customer data synchronization from Shopify webhooks.
 * It can be called from either HTTPS webhook handlers or Lambda functions.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '~/db.server';
import { hasManualOverride } from './manual-tier-assignment.server';
import { sendWelcomeEmailNotification } from './email-notifications.server';
import { updateCustomerToEffectiveTier } from './tier-resolution.server';
import { isKlaviyoEnabled } from './klaviyo.server';
import { syncCustomerToKlaviyo, trackCustomerEnrolled } from './klaviyo-events.server';
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
      orderCount: customerData.ordersCount,
      lastOrderDate: customerData.lastOrderDate,
      shopifyCreatedAt: customerData.shopifyCreatedAt,
      shopifyUpdatedAt: customerData.shopifyUpdatedAt,
      storeCredit: 0,
      currentTierId: null,
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

  // Send welcome email (non-blocking - errors won't fail the webhook)
  try {
    await sendWelcomeEmailNotification(
      shopDomain,
      {
        id: customerId,
        email: customerData.email,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        shop: shopDomain,
      },
      tier ? {
        id: tier.id,
        name: tier.name,
        cashbackPercent: tier.cashbackPercent,
      } : null
    );
  } catch (emailError) {
    // Log but don't fail the webhook
    console.error(`[CustomerSync] Failed to send welcome email (non-fatal):`, emailError);
  }

  // Sync to Klaviyo if enabled (non-blocking)
  try {
    if (await isKlaviyoEnabled(shopDomain)) {
      console.log(`[CustomerSync] Syncing customer to Klaviyo: ${customerId}`);

      // Get all tiers for profile properties
      const tiers = await db.tier.findMany({
        where: { shop: shopDomain },
        orderBy: { minSpend: 'asc' },
      });

      // Build customer object with tier for Klaviyo sync
      const customerWithTier = {
        ...customer,
        currentTier: tier || null,
      };

      // Sync profile to Klaviyo
      await syncCustomerToKlaviyo(shopDomain, customerWithTier as Customer & { currentTier: Tier | null }, tiers);

      // Track enrollment event
      await trackCustomerEnrolled(shopDomain, customerWithTier as Customer & { currentTier: Tier | null }, 'checkout');

      console.log(`[CustomerSync] Klaviyo sync complete for customer: ${customerId}`);
    }
  } catch (klaviyoError) {
    // Log but don't fail the webhook
    console.error(`[CustomerSync] Failed to sync to Klaviyo (non-fatal):`, klaviyoError);
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
      orderCount: customerData.ordersCount,
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

  // Sync updated profile to Klaviyo if enabled (non-blocking)
  try {
    if (await isKlaviyoEnabled(shopDomain)) {
      console.log(`[CustomerSync] Syncing updated customer to Klaviyo: ${customerId}`);

      // Get all tiers for profile properties
      const tiers = await db.tier.findMany({
        where: { shop: shopDomain },
        orderBy: { minSpend: 'asc' },
      });

      // Get full customer record
      const fullCustomer = await db.customer.findUnique({
        where: { id: customerId },
      });

      if (fullCustomer) {
        // Get current tier if customer has one
        const currentTier = fullCustomer.currentTierId
          ? await db.tier.findUnique({ where: { id: fullCustomer.currentTierId } })
          : null;

        const customerWithTier = {
          ...fullCustomer,
          currentTier,
        };

        await syncCustomerToKlaviyo(shopDomain, customerWithTier, tiers);
        console.log(`[CustomerSync] Klaviyo profile sync complete for customer: ${customerId}`);
      }
    }
  } catch (klaviyoError) {
    // Log but don't fail the webhook
    console.error(`[CustomerSync] Failed to sync to Klaviyo (non-fatal):`, klaviyoError);
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
 *
 * This function uses the Tier Resolution System which considers ALL tier sources:
 * 1. Manual overrides (admin-assigned tiers) - Priority 1
 * 2. Active tier subscriptions (recurring payments) - Priority 2
 * 3. Active tier purchases (one-time payments) - Priority 3
 * 4. Spending-based tiers (automatic calculation) - Priority 4
 *
 * This ensures customers who purchased a tier keep it during webhook syncs.
 */
async function calculateAndAssignTier(
  customerId: string,
  shop: string,
  _totalSpent: number // kept for backward compatibility, but resolver calculates this
): Promise<Tier | null> {
  console.log(`[CustomerSync] Resolving tier for customer ${customerId} via Tier Resolution System`);

  try {
    // Use the Tier Resolution System which respects all tier sources
    const result = await updateCustomerToEffectiveTier(shop, customerId, {
      triggeredBy: 'customer_webhook'
    });

    console.log(`[CustomerSync] Tier resolution complete - source: ${result.source}, changed: ${result.changed}`);

    // Return the new tier if one was assigned
    if (result.newTierId) {
      const tier = await db.tier.findUnique({
        where: { id: result.newTierId }
      });
      return tier;
    }

    return null;
  } catch (error) {
    console.error(`[CustomerSync] Tier resolution failed for customer ${customerId}:`, error);
    return null;
  }
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