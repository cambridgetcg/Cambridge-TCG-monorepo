/**
 * On-Demand Customer Sync Service
 *
 * Fetches customer data from Shopify Admin API and creates/updates them in the database.
 * Used when a customer logs into the storefront but isn't yet in the database.
 *
 * This handles cases where:
 * - The customers/create webhook hasn't arrived yet (race condition)
 * - The webhook was missed or failed
 * - The customer existed before the app was installed
 *
 * SECURITY: Rate limiting added to prevent abuse (see CUSTOMER_SECURITY_AUDIT.md)
 * - Limits syncs per shop per minute to prevent API abuse
 * - Uses database-backed tracking for multi-instance deployments
 */

import { unauthenticated } from "~/shopify.server";
import prisma from "~/db.server";
import { handleCustomerCreate, type ShopifyCustomerWebhook } from "./webhook-customer-sync.server";
import { setCustomerMetafield } from "./customer-metafield.server";

// SECURITY: Rate limiting configuration for on-demand syncs
const SYNC_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_SYNCS_PER_WINDOW = 20; // Max 20 new customer syncs per shop per minute
const MAX_SYNCS_PER_DAY = 500; // Max 500 new customer syncs per shop per day

/**
 * SECURITY: Check if on-demand sync is rate limited for this shop
 * Uses database tracking for accurate cross-instance rate limiting
 */
async function checkSyncRateLimit(shop: string): Promise<{
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - SYNC_RATE_LIMIT_WINDOW_MS);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    // Count recent syncs (new customers created in the last minute)
    const recentSyncs = await prisma.customer.count({
      where: {
        shop,
        createdAt: { gte: windowStart },
      },
    });

    if (recentSyncs >= MAX_SYNCS_PER_WINDOW) {
      console.warn(`[OnDemandSync] Rate limit exceeded for ${shop}: ${recentSyncs} syncs in last minute`);
      return {
        allowed: false,
        reason: `Rate limit exceeded. Maximum ${MAX_SYNCS_PER_WINDOW} customer syncs per minute.`,
        retryAfterSeconds: 60,
      };
    }

    // Count daily syncs
    const dailySyncs = await prisma.customer.count({
      where: {
        shop,
        createdAt: { gte: dayStart },
      },
    });

    if (dailySyncs >= MAX_SYNCS_PER_DAY) {
      console.warn(`[OnDemandSync] Daily limit exceeded for ${shop}: ${dailySyncs} syncs today`);
      return {
        allowed: false,
        reason: `Daily sync limit exceeded. Maximum ${MAX_SYNCS_PER_DAY} customer syncs per day.`,
        retryAfterSeconds: 3600, // Check again in an hour
      };
    }

    return { allowed: true };
  } catch (error) {
    // If rate limit check fails, allow the request but log the error
    console.error('[OnDemandSync] Rate limit check failed:', error);
    return { allowed: true };
  }
}

/**
 * GraphQL query to fetch a single customer by ID
 */
const CUSTOMER_QUERY = `
  query getCustomer($id: ID!) {
    customer(id: $id) {
      id
      email
      firstName
      lastName
      phone
      tags
      createdAt
      updatedAt
      amountSpent {
        amount
        currencyCode
      }
      numberOfOrders
      state
      verifiedEmail
      note
    }
  }
`;

export interface OnDemandSyncResult {
  success: boolean;
  customerId?: string;
  error?: string;
  action?: "created" | "updated" | "existing";
}

/**
 * Fetch a customer from Shopify and sync them to the database
 *
 * @param shop - Shop domain (e.g., "mystore.myshopify.com")
 * @param shopifyCustomerId - Shopify customer ID (numeric string, e.g., "123456789")
 * @returns Result with internal customer ID or error
 */
export async function fetchAndSyncCustomerFromShopify(
  shop: string,
  shopifyCustomerId: string
): Promise<OnDemandSyncResult> {
  console.log(`[OnDemandSync] Syncing customer ${shopifyCustomerId} for shop ${shop}`);

  try {
    // Check if customer already exists in database
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId,
      },
      select: {
        id: true,
      },
    });

    if (existingCustomer) {
      console.log(`[OnDemandSync] Customer already exists: ${existingCustomer.id}`);
      return {
        success: true,
        customerId: existingCustomer.id,
        action: "existing",
      };
    }

    // SECURITY: Check rate limit before creating a new customer
    // Only applied for new customer creation, not for existing customers
    const rateLimitCheck = await checkSyncRateLimit(shop);
    if (!rateLimitCheck.allowed) {
      console.warn(`[OnDemandSync] Rate limited for ${shop}: ${rateLimitCheck.reason}`);
      return {
        success: false,
        error: rateLimitCheck.reason,
      };
    }

    // Get admin API access for this shop
    const { admin } = await unauthenticated.admin(shop);

    // Construct the Shopify GID
    const shopifyGid = shopifyCustomerId.startsWith("gid://")
      ? shopifyCustomerId
      : `gid://shopify/Customer/${shopifyCustomerId}`;

    // Fetch customer from Shopify
    const response = await admin.graphql(CUSTOMER_QUERY, {
      variables: {
        id: shopifyGid,
      },
    });

    const result = (await response.json()) as any;

    if (result.errors) {
      console.error("[OnDemandSync] GraphQL errors:", result.errors);
      return {
        success: false,
        error: `GraphQL errors: ${JSON.stringify(result.errors)}`,
      };
    }

    const shopifyCustomer = result.data?.customer;

    if (!shopifyCustomer) {
      console.error(`[OnDemandSync] Customer not found in Shopify: ${shopifyGid}`);
      return {
        success: false,
        error: "Customer not found in Shopify",
      };
    }

    // Skip customers without email (can't be properly tracked)
    if (!shopifyCustomer.email) {
      console.log(`[OnDemandSync] Skipping customer ${shopifyCustomerId} - no email`);
      return {
        success: false,
        error: "Customer has no email address",
      };
    }

    // Convert Shopify GraphQL response to webhook format for reuse
    const webhookPayload: ShopifyCustomerWebhook = {
      id: extractNumericId(shopifyCustomer.id),
      email: shopifyCustomer.email,
      first_name: shopifyCustomer.firstName,
      last_name: shopifyCustomer.lastName,
      phone: shopifyCustomer.phone,
      tags: Array.isArray(shopifyCustomer.tags)
        ? shopifyCustomer.tags.join(", ")
        : shopifyCustomer.tags || "",
      total_spent: shopifyCustomer.amountSpent?.amount || "0",
      orders_count: shopifyCustomer.numberOfOrders || 0,
      created_at: shopifyCustomer.createdAt,
      updated_at: shopifyCustomer.updatedAt,
      state: shopifyCustomer.state,
      verified_email: shopifyCustomer.verifiedEmail,
      note: shopifyCustomer.note,
    };

    // Use the existing webhook handler to create/update customer
    const syncResult = await handleCustomerCreate(webhookPayload, shop);

    console.log(`[OnDemandSync] Customer synced: ${syncResult.customerId} (${syncResult.action})`);

    // Set the customer metafield so the widget can authenticate in the future
    try {
      await setCustomerMetafield(admin, syncResult.customerId, shopifyGid);
      console.log(`[OnDemandSync] Set metafield for customer ${syncResult.customerId}`);
    } catch (metafieldError) {
      // Non-fatal - customer is synced, just metafield failed
      console.error("[OnDemandSync] Failed to set metafield (non-fatal):", metafieldError);
    }

    return {
      success: true,
      customerId: syncResult.customerId,
      action: syncResult.action === "created" ? "created" : "updated",
    };
  } catch (error) {
    console.error("[OnDemandSync] Error syncing customer:", error);

    // Check for specific error types
    if (error instanceof Error) {
      // Shop not found or no session
      if (error.message.includes("No session found") || error.message.includes("shop was not found")) {
        return {
          success: false,
          error: "Shop not configured or app not installed",
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Extract numeric ID from Shopify GID
 * "gid://shopify/Customer/123456789" -> "123456789"
 */
function extractNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

/**
 * Batch sync multiple customers on-demand
 * Useful for initial widget load when multiple customers need syncing
 *
 * @param shop - Shop domain
 * @param shopifyCustomerIds - Array of Shopify customer IDs to sync
 * @returns Results for each customer
 */
export async function batchSyncCustomersFromShopify(
  shop: string,
  shopifyCustomerIds: string[]
): Promise<{
  total: number;
  synced: number;
  failed: number;
  results: OnDemandSyncResult[];
}> {
  const results: OnDemandSyncResult[] = [];
  let synced = 0;
  let failed = 0;

  for (const shopifyCustomerId of shopifyCustomerIds) {
    const result = await fetchAndSyncCustomerFromShopify(shop, shopifyCustomerId);
    results.push(result);

    if (result.success) {
      synced++;
    } else {
      failed++;
    }

    // Rate limiting: 200ms between requests
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    total: shopifyCustomerIds.length,
    synced,
    failed,
    results,
  };
}
