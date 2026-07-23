/**
 * Webhook Reconciliation Job
 * Periodically checks for missed orders/paid webhooks and processes them
 * This helps ensure data consistency even if webhooks fail or are missed
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { db } from "../db.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import * as crypto from "node:crypto";

const JOB_NAME = "webhook-reconciliation";
const LOCK_TTL_MINUTES = 30;

// Configuration
const RECONCILIATION_WINDOW_HOURS = 48; // Look back 48 hours
const BATCH_SIZE = 50; // Process 50 orders at a time
const MAX_ORDERS_PER_RUN = 200; // Limit to prevent timeout

interface ReconciliationResult {
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: Array<{ orderId: string; error: string }>;
  duration: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  let lockId: string | undefined;

  const url = new URL(request.url);

  // SECURITY: Validate shop domain format
  const rawShop = url.searchParams.get('shop');
  if (!rawShop) {
    return json({ error: "Shop parameter required" }, { status: 400 });
  }

  const isValidShop = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(rawShop);
  if (!isValidShop) {
    return json({ error: "Invalid shop domain format" }, { status: 400 });
  }
  const shop = rawShop.toLowerCase();

  // SECURITY: Validate and sanitize hours parameter
  const rawHours = url.searchParams.get('hours');
  let hoursBack = RECONCILIATION_WINDOW_HOURS;
  if (rawHours) {
    const parsed = parseInt(rawHours, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 168) { // Max 1 week
      return json({ error: "Invalid hours parameter (must be 1-168)" }, { status: 400 });
    }
    hoursBack = parsed;
  }

  // Acquire distributed lock (per-shop to allow parallel reconciliation of different shops)
  await cleanupExpiredLocks();
  const lockJobName = `${JOB_NAME}-${shop}`;
  const lock = await acquireCronLock(lockJobName, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    console.log(`[WebhookReconciliation] Skipping ${shop} - another instance is running`);
    return json({
      success: false,
      skipped: true,
      shop,
      reason: 'Another instance is already running for this shop',
      existingLock: lock.existingLock,
    });
  }

  lockId = lock.lockId;
  console.log(`[WebhookReconciliation] Starting reconciliation for ${shop}, looking back ${hoursBack} hours`);

  try {
    const result = await reconcileOrders(shop, hoursBack);

    console.log(`[WebhookReconciliation] Completed reconciliation for ${shop}`, {
      ...result,
      shop,
      hoursBack
    });

    return json({
      success: true,
      shop,
      hoursBack,
      processedCount: result.processedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      duration: result.duration,
    });
  } catch (error: any) {
    console.error(`[WebhookReconciliation] Error during reconciliation:`, error);

    return json({
      success: false,
      error: "Webhook reconciliation failed",
      duration: Date.now() - startTime
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (lockId) {
      await releaseCronLock(lockId);
    }
  }
};

async function reconcileOrders(shop: string, hoursBack: number): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const result: ReconciliationResult = {
    processedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
    duration: 0
  };

  try {
    // Get admin API access
    const { admin } = await unauthenticated.admin(shop);

    // Calculate date range
    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - hoursBack);

    console.log(`[WebhookReconciliation] Fetching orders since ${sinceDate.toISOString()}`);

    // Fetch recent paid orders from Shopify
    const ordersQuery = `#graphql
      query GetRecentPaidOrders($since: DateTime!, $first: Int!) {
        orders(
          first: $first,
          query: "financial_status:paid AND updated_at:>='${sinceDate.toISOString()}'"
          sortKey: UPDATED_AT
          reverse: true
        ) {
          edges {
            node {
              id
              name
              createdAt
              updatedAt
              financialStatus
              displayFinancialStatus
              cancelledAt
              test
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                email
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    title
                    sku
                    quantity
                    variant {
                      id
                      price
                    }
                    product {
                      id
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const response = await admin.graphql(ordersQuery, {
      variables: {
        since: sinceDate.toISOString(),
        first: Math.min(BATCH_SIZE, MAX_ORDERS_PER_RUN)
      }
    });

    const responseJson = await response.json() as any;

    if (responseJson.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(responseJson.errors)}`);
    }

    const orders = responseJson.data?.orders?.edges || [];

    console.log(`[WebhookReconciliation] Found ${orders.length} paid orders to check`);

    // Check each order against our database
    for (const edge of orders) {
      const order = edge.node;
      const orderId = order.id.split('/').pop(); // Extract numeric ID from GID

      try {
        // Check if order exists in our database
        const existingOrder = await db.order.findFirst({
          where: {
            shop,
            shopifyOrderId: orderId
          }
        });

        if (existingOrder) {
          result.skippedCount++;
          console.log(`[WebhookReconciliation] Order ${order.name} already exists, skipping`);
          continue;
        }

        // Check if it's been processed via webhook
        const processedWebhook = await db.webhookProcessed.findFirst({
          where: {
            shop,
            webhookId: {
              contains: `order-${orderId}`
            }
          }
        }).catch(() => null); // Table might not exist

        if (processedWebhook) {
          result.skippedCount++;
          console.log(`[WebhookReconciliation] Order ${order.name} already processed via webhook`);
          continue;
        }

        // Order is missing - process it
        console.log(`[WebhookReconciliation] Processing missing order ${order.name}`);

        // Transform GraphQL order to webhook format
        const webhookOrder = transformGraphQLOrderToWebhook(order);

        // Process the order using the same logic as webhook handler
        await processReconciliationOrder(shop, webhookOrder);

        result.processedCount++;

        console.log(`[WebhookReconciliation] Successfully processed order ${order.name}`);

      } catch (error: any) {
        console.error(`[WebhookReconciliation] Error processing order ${order.name}:`, error);
        result.errorCount++;
        result.errors.push({
          orderId: order.name,
          error: error.message
        });
      }

      // Stop if we've processed too many to avoid timeout
      if (result.processedCount >= MAX_ORDERS_PER_RUN) {
        console.log(`[WebhookReconciliation] Reached max orders per run (${MAX_ORDERS_PER_RUN})`);
        break;
      }
    }

    result.duration = Date.now() - startTime;
    return result;

  } catch (error: any) {
    console.error(`[WebhookReconciliation] Fatal error:`, error);
    result.errors.push({
      orderId: 'N/A',
      error: error.message
    });
    result.duration = Date.now() - startTime;
    return result;
  }
}

/**
 * Transform GraphQL order format to webhook payload format
 */
function transformGraphQLOrderToWebhook(graphqlOrder: any): any {
  const orderId = graphqlOrder.id.split('/').pop();
  const customerId = graphqlOrder.customer?.id?.split('/').pop();

  return {
    id: orderId,
    name: graphqlOrder.name,
    created_at: graphqlOrder.createdAt,
    updated_at: graphqlOrder.updatedAt,
    cancelled_at: graphqlOrder.cancelledAt,
    financial_status: graphqlOrder.financialStatus?.toLowerCase() || 'pending',
    test: graphqlOrder.test || false,
    total_price: graphqlOrder.totalPriceSet?.shopMoney?.amount || '0.00',
    currency: graphqlOrder.totalPriceSet?.shopMoney?.currencyCode || 'USD',
    customer: graphqlOrder.customer ? {
      id: customerId,
      email: graphqlOrder.customer.email
    } : null,
    line_items: (graphqlOrder.lineItems?.edges || []).map((edge: any) => ({
      id: edge.node.id.split('/').pop(),
      title: edge.node.title,
      sku: edge.node.sku,
      quantity: edge.node.quantity,
      price: edge.node.variant?.price || '0.00',
      product_id: edge.node.product?.id?.split('/').pop(),
      variant_id: edge.node.variant?.id?.split('/').pop()
    })),
    // Add reconciliation flag
    _reconciliation: true,
    _reconciliation_date: new Date().toISOString()
  };
}

/**
 * Process a reconciliation order (similar to webhook handler but simplified)
 */
async function processReconciliationOrder(shop: string, order: any): Promise<void> {
  // Skip if cancelled or not paid
  if (order.cancelled_at || order.financial_status !== 'paid' || order.test) {
    console.log(`[WebhookReconciliation] Skipping ineligible order ${order.name}`);
    return;
  }

  const idempotencyKey = `reconciliation-order-${order.id}-${Date.now()}`;

  await db.$transaction(async (tx) => {
    // Record the reconciliation (without payload to avoid timeout)
    try {
      await tx.webhookProcessed.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          topic: 'reconciliation/orders.paid',
          webhookId: idempotencyKey,
          processedAt: new Date()
        }
      });
    } catch (err) {
      console.warn(`[WebhookReconciliation] Could not record processing:`, err);
    }

    // Get or create customer
    let customer = null;
    if (order.customer?.id) {
      customer = await tx.customer.upsert({
        where: {
          shop_shopifyCustomerId: {
            shop,
            shopifyCustomerId: order.customer.id
          }
        },
        create: {
          id: crypto.randomUUID(),
          shop,
          shopifyCustomerId: order.customer.id,
          email: order.customer.email || '',
          storeCredit: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        update: {
          email: order.customer.email || '',
          updatedAt: new Date()
        }
      });
    }

    // Create order record
    await tx.order.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        shopifyOrderId: order.id,
        shopifyOrderNumber: order.name,
        shopifyOrderName: order.name,
        customerId: customer?.id || null,
        email: order.customer?.email || '',
        currency: order.currency || 'USD',
        subtotalPrice: parseFloat(order.total_price || '0'),
        totalDiscounts: 0,
        totalShipping: 0,
        totalTax: 0,
        totalPrice: parseFloat(order.total_price || '0'),
        totalRefunded: 0,
        netAmount: parseFloat(order.total_price || '0'),
        financialStatus: 'PAID',
        fulfillmentStatus: null,
        cashbackEligible: true,
        cashbackProcessed: false,
        shopifyCreatedAt: new Date(order.created_at),
        shopifyUpdatedAt: new Date(order.updated_at),
        createdAt: new Date(),
        updatedAt: new Date(),
        syncedAt: new Date(),
        syncVersion: 1
      }
    });

    console.log(`[WebhookReconciliation] Created order record for ${order.name}`);
  });
}
