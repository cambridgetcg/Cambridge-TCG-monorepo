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
  let shop: string | undefined;
  let topic: string | undefined;
  let order: any;

  try {
    // Use Shopify's built-in webhook authentication which handles HMAC verification
    const webhookData = await authenticate.webhook(request);
    shop = webhookData.shop;
    topic = webhookData.topic;
    order = webhookData.payload;
    const admin = webhookData.admin;

    console.log(`[OrderPaid] Processing order ${order.id} for shop ${shop}`);

    // Generate idempotency key
    const idempotencyKey = `order-${order.id}-${order.updated_at}`;

    // Check if already processed (if webhookProcess table exists)
    try {
      const existingProcess = await db.webhookProcess.findUnique({
        where: { idempotencyKey }
      });

      if (existingProcess) {
        console.log(`[OrderPaid] Already processed order ${order.id}`);
        return json({ success: true, message: "Already processed" });
      }
    } catch (e) {
      // webhookProcess table might not exist, continue processing
      console.log(`[OrderPaid] Could not check idempotency (table may not exist)`);
    }

    // Process with retry logic
    const result = await withRetry(
      async () => {
        return await db.$transaction(async (tx) => {
          // Record webhook processing (if table exists)
          try {
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
          } catch (e) {
            console.log(`[OrderPaid] Could not record webhook processing (table may not exist)`);
          }
          
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
          
          // Create or update Order record
          await createOrderRecord(tx, {
            shop,
            order,
          });
          
          // Process cashback for regular items
          await processCashback(tx, {
            shop,
            order,
          });
          
          // Update customer spending totals from Order data
          await updateCustomerSpendingFromOrders(tx, {
            shop,
            order,
          });
          
          // Check for tier progression (need to get the database customer ID first)
          if (order.customer?.id) {
            const dbCustomer = await tx.customer.findFirst({
              where: {
                shop,
                shopifyCustomerId: order.customer.id.toString()
              },
              select: { id: true }
            });

            if (dbCustomer && shop) {
              await checkTierProgression(tx, {
                shop,
                customerId: dbCustomer.id,
              });
            }
          }
          
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
    console.error(`[OrderPaid] Error processing order ${order?.id || 'unknown'}:`, error);

    // Log error for monitoring (if model exists and we have required data)
    if (db.webhookError && shop && order) {
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
  
  // Get the Order record we just created
  const orderRecord = await tx.order.findFirst({
    where: {
      shop,
      shopifyOrderId: order.id.toString()
    }
  });
  
  if (!orderRecord) {
    console.error('[OrderPaid] Order record not found after creation');
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
        orderId: orderRecord.id, // Link to Order record
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
    
    // Mark cashback as processed in Order record
    await tx.order.update({
      where: { id: orderRecord.id },
      data: {
        cashbackProcessed: true,
        updatedAt: new Date()
      }
    });
  }
}

async function createOrderRecord(tx: any, params: {
  shop: string;
  order: any;
}) {
  const { shop, order } = params;
  
  // Extract Shopify order ID
  const shopifyOrderId = order.id.toString();
  
  // Check if order already exists
  const existingOrder = await tx.order.findFirst({
    where: {
      shop,
      shopifyOrderId
    }
  });
  
  if (existingOrder) {
    console.log(`[OrderPaid] Order ${order.name} already exists in database`);
    return existingOrder;
  }
  
  // Get customer if exists
  let customer = null;
  if (order.customer?.id) {
    customer = await tx.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: order.customer.id.toString()
      },
      include: {
        currentTier: true
      }
    });
  }
  
  // Calculate cashback based on current tier
  let cashbackPercent = 0;
  let cashbackAmount = 0;
  let tierIdAtOrder = null;
  let tierNameAtOrder = null;
  
  if (customer?.currentTier) {
    cashbackPercent = customer.currentTier.cashbackPercent;
    tierIdAtOrder = customer.currentTier.id;
    tierNameAtOrder = customer.currentTier.name;
    
    // Calculate cashback on subtotal after discounts
    const subtotal = parseFloat(order.subtotal_price || '0');
    const discounts = parseFloat(order.total_discounts || '0');
    const netAmount = subtotal - discounts;
    cashbackAmount = (netAmount * cashbackPercent) / 100;
  }
  
  // Create Order record
  const orderId = uuidv4();
  const now = new Date();
  
  const newOrder = await tx.order.create({
    data: {
      id: orderId,
      shop,
      shopifyOrderId,
      shopifyOrderNumber: order.order_number?.toString() || order.number?.toString() || '',
      shopifyOrderName: order.name || '',
      customerId: customer?.id || 'unknown',
      email: order.email || order.customer?.email || '',
      currency: order.currency || 'USD',
      subtotalPrice: parseFloat(order.subtotal_price || '0'),
      totalDiscounts: parseFloat(order.total_discounts || '0'),
      totalShipping: parseFloat(order.total_shipping_price || order.shipping_lines?.reduce((sum: number, line: any) => sum + parseFloat(line.price || '0'), 0) || '0'),
      totalTax: parseFloat(order.total_tax || '0'),
      totalPrice: parseFloat(order.total_price || '0'),
      totalRefunded: 0, // Will be updated when refunds are processed
      netAmount: parseFloat(order.total_price || '0'),
      financialStatus: 'PAID', // This webhook only fires for paid orders
      fulfillmentStatus: order.fulfillment_status || null,
      cashbackEligible: true,
      cashbackPercent,
      cashbackAmount,
      cashbackProcessed: false, // Will be marked true when cashback is credited
      tierIdAtOrder,
      tierNameAtOrder,
      shopifyCreatedAt: new Date(order.created_at),
      shopifyUpdatedAt: new Date(order.updated_at || order.created_at),
      processedAt: order.processed_at ? new Date(order.processed_at) : now,
      createdAt: now,
      updatedAt: now
    }
  });
  
  // Create OrderLineItem records
  if (order.line_items && order.line_items.length > 0) {
    for (const item of order.line_items) {
      await tx.orderLineItem.create({
        data: {
          id: uuidv4(),
          orderId,
          shopifyLineItemId: item.id.toString(),
          shopifyProductId: item.product_id?.toString() || null,
          shopifyVariantId: item.variant_id?.toString() || null,
          title: item.title || item.name || '',
          variantTitle: item.variant_title || null,
          sku: item.sku || null,
          vendor: item.vendor || null,
          quantity: item.quantity || 1,
          price: parseFloat(item.price || '0'),
          totalPrice: parseFloat(item.price || '0') * (item.quantity || 1),
          totalDiscount: parseFloat(item.total_discount || '0'),
          requiresShipping: item.requires_shipping !== false,
          taxable: item.taxable !== false,
          giftCard: item.gift_card === true,
          isTierProduct: false, // Will be checked separately
          tierProductId: null,
          createdAt: now
        }
      });
    }
  }
  
  console.log(`[OrderPaid] Created Order record ${orderId} for Shopify order ${order.name}`);
  return newOrder;
}

async function updateCustomerSpendingFromOrders(tx: any, params: {
  shop: string;
  order: any;
}) {
  const { shop, order } = params;
  
  if (!order.customer?.id) {
    return;
  }
  
  // Get customer
  const customer = await tx.customer.findFirst({
    where: {
      shop,
      shopifyCustomerId: order.customer.id.toString(),
    }
  });
  
  if (!customer) {
    return;
  }
  
  // Calculate totals from Order records
  const orderStats = await tx.order.aggregate({
    where: {
      shop,
      customerId: customer.id,
      financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] }
    },
    _sum: {
      totalPrice: true,
      totalRefunded: true,
      cashbackAmount: true
    },
    _count: {
      id: true
    },
    _max: {
      shopifyCreatedAt: true
    }
  });
  
  // Update customer spending totals
  await tx.customer.update({
    where: { id: customer.id },
    data: {
      totalSpent: orderStats._sum.totalPrice || 0,
      totalRefunded: orderStats._sum.totalRefunded || 0,
      totalCashbackEarned: orderStats._sum.cashbackAmount || 0,
      netSpent: (orderStats._sum.totalPrice || 0) - (orderStats._sum.totalRefunded || 0),
      orderCount: orderStats._count.id || 0,
      lastOrderDate: orderStats._max.shopifyCreatedAt || null,
      updatedAt: new Date()
    }
  });
  
  console.log(`[OrderPaid] Updated customer ${customer.id} spending totals`);
}

async function checkTierProgression(_tx: any, params: {
  shop: string;
  customerId: string;
}) {
  const { customerId } = params;
  
  if (!customerId) {
    return;
  }
  
  // Use TierResolver to check for tier conflicts and updates
  await TierResolver.updateEffectiveTier(customerId);
}