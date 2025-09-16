/**
 * Enhanced Order Paid Webhook Handler
 * With improved error handling, idempotency, and transactions
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { TierSubscriptionBridgeV2 } from "../services/subscription/tier-subscription-bridge.server";
import { TierResolver } from "../services/subscription/tier-resolver.server";
import { withRetry } from "../utils/retry";
import { validatePrice } from "../utils/price-validation";
import * as crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

// HMAC Verification
function verifyWebhookHMAC(request: Request, rawBody: string): boolean {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  
  if (!hmacHeader || !webhookSecret) {
    console.error('[Webhook] Missing HMAC header or webhook secret');
    return false;
  }
  
  const hash = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  
  // 1. Verify HMAC
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('[OrderPaid] HMAC verification failed');
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const order = JSON.parse(rawBody);
  const shop = request.headers.get('X-Shopify-Shop-Domain');
  const topic = request.headers.get('X-Shopify-Topic');
  
  if (!shop) {
    console.error('[OrderPaid] Missing shop domain');
    return json({ error: "Missing shop" }, { status: 400 });
  }
  
  console.log(`[OrderPaid] Processing order ${order.id} for shop ${shop}`);
  
  try {
    // 2. Authenticate (optional - get admin context if needed)
    const { admin } = await authenticate.webhook(request);
    
    // 3. Generate idempotency key
    const idempotencyKey = `order-${order.id}-${order.updated_at}`;
    
    // 4. Check if already processed
    const existingProcess = await db.webhookProcess.findUnique({
      where: { idempotencyKey }
    });
    
    if (existingProcess) {
      console.log(`[OrderPaid] Already processed order ${order.id}`);
      return json({ success: true, message: "Already processed" });
    }
    
    // 5. Process with retry logic
    const result = await withRetry(
      async () => {
        return await db.$transaction(async (tx) => {
          // Record webhook processing
          await tx.webhookProcess.create({
            data: {
              id: uuidv4(),
              shop,
              topic: topic || 'orders/paid',
              idempotencyKey,
              payload: order,
              processedAt: new Date(),
            }
          });
          
          // Process each line item
          const results = [];
          
          for (const lineItem of order.line_items) {
            const itemResult = await processLineItem(tx, {
              shop,
              admin,
              order,
              lineItem,
            });
            results.push(itemResult);
          }
          
          // Process cashback for regular items
          await processCashback(tx, {
            shop,
            order,
          });
          
          // Update customer spending totals
          await updateCustomerSpending(tx, {
            shop,
            order,
          });
          
          // Check for tier progression
          await checkTierProgression(tx, {
            shop,
            customerId: order.customer?.id,
          });
          
          return { success: true, results };
        });
      },
      {
        maxAttempts: 2,
        shouldRetry: (error) => {
          // Don't retry on business logic errors
          if (error.message?.includes('Invalid') || 
              error.message?.includes('not found')) {
            return false;
          }
          return true;
        }
      }
    );
    
    console.log(`[OrderPaid] Successfully processed order ${order.id}`);
    return json({ success: true, data: result });
    
  } catch (error) {
    console.error(`[OrderPaid] Error processing order ${order.id}:`, error);
    
    // Log error for monitoring (if model exists)
    if (db.webhookError) {
      await db.webhookError.create({
        data: {
          id: uuidv4(),
        shop,
        topic: topic || 'orders/paid',
        orderId: order.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        payload: order,
        createdAt: new Date(),
        }
      }).catch(console.error);
    }
    
    // Return success to prevent Shopify retries for non-recoverable errors
    if (error instanceof Error && 
        (error.message.includes('Invalid') || 
         error.message.includes('not found'))) {
      return json({ success: false, error: error.message });
    }
    
    // Return error for recoverable issues (will trigger retry)
    return json({ error: "Processing failed" }, { status: 500 });
  }
};

async function processLineItem(tx: any, params: {
  shop: string;
  admin: any;
  order: any;
  lineItem: any;
}) {
  const { shop, admin, order, lineItem } = params;
  
  // Check if this is a subscription purchase
  const sellingPlanAllocation = lineItem.selling_plan_allocation;
  const isSubscription = !!sellingPlanAllocation;
  
  if (isSubscription) {
    // Process subscription purchase
    const contractId = sellingPlanAllocation.selling_plan_id; // This would need proper extraction
    
    return await TierSubscriptionBridgeV2.handleTierSubscriptionPurchase({
      shop,
      admin,
      customerId: order.customer?.id?.toString() || '',
      customerShopifyId: order.customer?.id?.toString() || '',
      lineItem,
      orderId: order.id.toString(),
      sellingPlanId: sellingPlanAllocation.selling_plan_id,
      contractId,
    });
  }
  
  // Check if this is a one-time tier product purchase
  const tierProduct = await tx.tierProduct.findFirst({
    where: {
      shop,
      OR: [
        { shopifyProductId: lineItem.product_id?.toString() },
        { shopifyVariantId: lineItem.variant_id?.toString() },
        { sku: lineItem.sku },
      ],
      purchaseType: { in: ['ONE_TIME', 'BOTH'] }
    }
  });
  
  if (tierProduct) {
    return await processOneTimeTierPurchase(tx, {
      shop,
      order,
      lineItem,
      tierProduct,
    });
  }
  
  return { type: 'regular', processed: false };
}

async function processOneTimeTierPurchase(tx: any, params: {
  shop: string;
  order: any;
  lineItem: any;
  tierProduct: any;
}) {
  const { shop, order, lineItem, tierProduct } = params;
  
  // Validate price
  const priceValidation = validatePrice(lineItem.price, order.currency);
  if (!priceValidation.valid) {
    throw new Error(`Invalid price for tier product: ${priceValidation.error}`);
  }
  
  // Get or create customer
  const customer = await tx.customer.upsert({
    where: {
      shop_shopifyCustomerId: {
        shop,
        shopifyCustomerId: order.customer?.id?.toString() || '',
      }
    },
    update: {
      updatedAt: new Date(),
    },
    create: {
      id: uuidv4(),
      shop,
      shopifyCustomerId: order.customer?.id?.toString() || '',
      email: order.customer?.email || order.email || '',
      storeCredit: 0,
      currentTierId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  });
  
  // Calculate tier duration
  const now = new Date();
  let tierEndDate: Date | null = null;
  
  if (tierProduct.duration) {
    tierEndDate = new Date(now);
    switch (tierProduct.duration) {
      case 'MONTHLY':
        tierEndDate.setMonth(tierEndDate.getMonth() + 1);
        break;
      case 'QUARTERLY':
        tierEndDate.setMonth(tierEndDate.getMonth() + 3);
        break;
      case 'ANNUAL':
        tierEndDate.setFullYear(tierEndDate.getFullYear() + 1);
        break;
      case 'LIFETIME':
        tierEndDate = null; // No expiry
        break;
    }
  }
  
  // Create tier purchase record
  await tx.tierPurchase.create({
    data: {
      id: uuidv4(),
      shop,
      customerId: customer.id,
      tierId: tierProduct.tierId,
      tierProductId: tierProduct.id,
      shopifyOrderId: order.id.toString(),
      shopifyLineItemId: lineItem.id.toString(),
      purchasePrice: priceValidation.sanitizedPrice!,
      currency: order.currency,
      startDate: now,
      endDate: tierEndDate,
      status: 'ACTIVE',
      metadata: {
        productTitle: lineItem.name,
        sku: lineItem.sku,
        quantity: lineItem.quantity,
      },
      createdAt: now,
      updatedAt: now,
    }
  });
  
  // Update customer tier
  await tx.customer.update({
    where: { id: customer.id },
    data: {
      currentTierId: tierProduct.tierId,
      updatedAt: now,
    }
  });
  
  // Log tier change
  await tx.tierChangeLog.create({
    data: {
      id: uuidv4(),
      customerId: customer.id,
      shop,
      fromTierId: customer.currentTierId,
      toTierId: tierProduct.tierId,
      changeType: customer.currentTierId ? 'UPGRADE' : 'INITIAL_ASSIGNMENT',
      triggerType: 'PRODUCT_PURCHASE',
      metadata: {
        orderId: order.id,
        productId: tierProduct.id,
        duration: tierProduct.duration,
        endDate: tierEndDate?.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    }
  });
  
  return {
    type: 'one_time_tier',
    processed: true,
    tierId: tierProduct.tierId,
    endDate: tierEndDate,
  };
}

async function processCashback(tx: any, params: {
  shop: string;
  order: any;
}) {
  const { shop, order } = params;
  
  if (!order.customer?.id) {
    console.log('[OrderPaid] No customer ID, skipping cashback');
    return;
  }
  
  // Get customer with current tier
  const customer = await tx.customer.findUnique({
    where: {
      shop_shopifyCustomerId: {
        shop,
        shopifyCustomerId: order.customer.id.toString(),
      }
    },
    include: { currentTier: true }
  });
  
  if (!customer || !customer.currentTier) {
    console.log('[OrderPaid] Customer or tier not found, skipping cashback');
    return;
  }
  
  // Calculate cashback amount
  const orderTotal = parseFloat(order.total_price || '0');
  const cashbackAmount = (orderTotal * customer.currentTier.cashbackPercent) / 100;
  
  if (cashbackAmount <= 0) {
    return;
  }
  
  // Create ledger entry with idempotency
  const ledgerIdempotencyKey = `cashback-${order.id}`;
  
  const existingEntry = await tx.storeCreditLedger.findFirst({
    where: {
      shop,
      shopifyOrderId: order.id.toString(),
      type: 'CASHBACK_EARNED',
    }
  });
  
  if (!existingEntry) {
    const newBalance = customer.storeCredit + cashbackAmount;
    
    await tx.storeCreditLedger.create({
      data: {
        id: uuidv4(),
        customerId: customer.id,
        shop,
        amount: cashbackAmount,
        balance: newBalance,
        type: 'CASHBACK_EARNED',
        shopifyOrderId: order.id.toString(),
        metadata: {
          idempotencyKey: ledgerIdempotencyKey,
          orderId: order.id,
          orderName: order.name,
          orderTotal,
          cashbackPercent: customer.currentTier.cashbackPercent,
          tierName: customer.currentTier.name,
          description: `${customer.currentTier.cashbackPercent}% cashback on order ${order.name}`,
        },
        createdAt: new Date(),
      }
    });
    
    // Update customer balance
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        storeCredit: newBalance,
        updatedAt: new Date(),
      }
    });
  }
}

async function updateCustomerSpending(tx: any, params: {
  shop: string;
  order: any;
}) {
  const { shop, order } = params;
  
  if (!order.customer?.id) {
    return;
  }
  
  // Update customer's updatedAt timestamp to track activity
  const customer = await tx.customer.findUnique({
    where: {
      shop_shopifyCustomerId: {
        shop,
        shopifyCustomerId: order.customer.id.toString(),
      }
    }
  });
  
  if (customer) {
    // Since Customer model doesn't have totalSpent, ordersCount, or lastOrderDate fields,
    // we'll just update the updatedAt timestamp. The actual spending data is tracked
    // in the StoreCreditLedger metadata.
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        updatedAt: new Date(),
      }
    });
  }
}

async function checkTierProgression(tx: any, params: {
  shop: string;
  customerId: string;
}) {
  const { shop, customerId } = params;
  
  if (!customerId) {
    return;
  }
  
  // Use TierResolver to check for tier conflicts and updates
  await TierResolver.updateEffectiveTier(customerId);
}