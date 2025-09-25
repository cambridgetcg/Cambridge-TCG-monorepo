/**
 * Enhanced Order Paid Webhook Handler
 * With improved error handling, idempotency, and transactions
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { TierSubscriptionBridgeV2 } from "../services/subscription/tier-subscription-bridge.server";
import TierResolver from "../services/tier-resolver.server";
import TierProductCache from "../services/tier-product-cache.server";
import { withRetry } from "../utils/retry";
import { validatePrice } from "../utils/price-validation";
import { validateShopifyOrderCurrency } from "../services/currency-validation.server";
import { roundToCurrencyPrecision } from "../services/currency-formatter.server";
import * as crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

// HMAC Verification
function verifyWebhookHMAC(request: Request, rawBody: string): boolean {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET; // Use webhook secret first

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
  const order = JSON.parse(rawBody);

  // Get headers
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const shop = request.headers.get('X-Shopify-Shop-Domain');
  const topic = request.headers.get('X-Shopify-Topic');

  // 1. Verify HMAC
  if (!verifyWebhookHMAC(request, rawBody)) {
    console.error('[OrderPaid] HMAC verification failed');
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Order state validation - skip ineligible orders
  if (order.cancelled_at) {
    console.log('[OrderPaid] Order was cancelled, skipping');
    return json({ success: true, message: "Cancelled order ignored" });
  }

  if (order.financial_status !== 'paid') {
    console.log(`[OrderPaid] Order not paid (status=${order.financial_status}), skipping`);
    return json({ success: true, message: "Non-paid order ignored" });
  }

  if (order.test === true) {
    console.log('[OrderPaid] Test order detected, skipping');
    return json({ success: true, message: "Test order ignored" });
  }

  if (!shop) {
    console.error('[OrderPaid] Missing shop domain');
    return json({ error: "Missing shop" }, { status: 400 });
  }

  console.log(`[OrderPaid] Processing order ${order.id} for shop ${shop}`);

  try {
    // Note: Don't call authenticate.webhook since we already read the body
    // Just use null for admin since we don't need GraphQL in most cases
    const admin = null;
    
    // 3. Generate idempotency key
    const idempotencyKey = `order-${order.id}-${order.updated_at}`;
    
    // 4. Check if already processed (check outside of transaction)
    let existingProcess = null;
    try {
      existingProcess = await db.webhookProcess.findUnique({
        where: { idempotencyKey }
      });
    } catch (err) {
      console.log('[OrderPaid] WebhookProcess table may not exist, skipping idempotency check');
    }

    if (existingProcess) {
      console.log(`[OrderPaid] Already processed order ${order.id}`);
      return json({ success: true, message: "Already processed" });
    }
    
    // 5. Process with retry logic
    const result = await withRetry(
      async () => {
        return await db.$transaction(async (tx) => {
          // Record webhook processing (only if table exists)
          try {
            if (tx.webhookProcess) {
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
            }
          } catch (err) {
            console.log('[OrderPaid] Could not record webhook processing:', err.message);
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
    try {
      if (db.webhookError) {
        await db.webhookError.create({
          data: {
            id: uuidv4(),
            shop,
            topic: topic || 'orders/paid',
            orderId: order.id?.toString() || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown error',
            payload: order, // Prisma will handle JSON serialization
            createdAt: new Date(),
          }
        }).catch((err) => {
          console.error('[OrderPaid] Failed to log webhook error:', err);
        });
      }
    } catch (err) {
      console.error('[OrderPaid] Failed to create webhook error record:', err);
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
  
  // Validate and normalize currency
  const validatedCurrency = validateShopifyOrderCurrency(order);

  // Validate price
  const priceValidation = validatePrice(lineItem.price, validatedCurrency);
  if (!priceValidation.valid) {
    throw new Error(`Invalid price for tier product: ${priceValidation.error}`);
  }

  // Round price to proper decimal places
  const roundedPrice = roundToCurrencyPrecision(
    priceValidation.sanitizedPrice!,
    validatedCurrency
  );
  
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
      purchasePrice: roundedPrice,
      currency: validatedCurrency,
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

  // Get tier product IDs from cache for better performance
  const tierProductIds = await TierProductCache.getTierProductIds(shop);

  // Filter out tier products from cashback calculation
  const eligibleItems = order.line_items?.filter(item =>
    !tierProductIds.has(item.product_id?.toString())
  ) || [];

  // Calculate eligible amount (excluding tier products)
  const eligibleAmount = eligibleItems.reduce((sum, item) => {
    const price = parseFloat(item.price || '0');
    const quantity = item.quantity || 1;
    return sum + (price * quantity);
  }, 0);

  if (eligibleAmount <= 0) {
    console.log('[OrderPaid] No eligible items for cashback (order may contain only tier products)');
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

  // Calculate cashback amount on eligible items only
  const cashbackAmount = (eligibleAmount * customer.currentTier.cashbackPercent) / 100;
  
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
          orderTotal: eligibleAmount.toString(),
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

  // Check if this order contains tier products (affects cashback eligibility)
  // Use cached tier product IDs for better performance
  const tierProductIds = await TierProductCache.getTierProductIds(shop);
  const containsTierProducts = order.line_items?.some(item =>
    tierProductIds.has(item.product_id?.toString())
  ) || false;

  // Calculate cashback based on current tier (but not on tier product purchases)
  let cashbackPercent = 0;
  let cashbackAmount = 0;
  let tierIdAtOrder = null;
  let tierNameAtOrder = null;
  let cashbackEligible = !containsTierProducts; // Tier products don't earn cashback

  if (customer?.currentTier && cashbackEligible) {
    cashbackPercent = customer.currentTier.cashbackPercent;
    tierIdAtOrder = customer.currentTier.id;
    tierNameAtOrder = customer.currentTier.name;

    // Calculate cashback on subtotal after discounts
    const subtotal = parseFloat(order.subtotal_price || '0');
    const discounts = parseFloat(order.total_discounts || '0');
    const netAmount = subtotal - discounts;
    cashbackAmount = (netAmount * cashbackPercent) / 100;
  }

  // Validate and normalize currency
  const validatedCurrency = validateShopifyOrderCurrency(order);

  // Round cashback amount to proper decimal places
  if (cashbackAmount > 0) {
    cashbackAmount = roundToCurrencyPrecision(cashbackAmount, validatedCurrency);
  }

  // Create Order record
  const orderId = uuidv4();
  const now = new Date();

  // Round all amounts to proper decimal places for the currency
  const subtotalPrice = roundToCurrencyPrecision(
    parseFloat(order.subtotal_price || '0'),
    validatedCurrency
  );
  const totalDiscounts = roundToCurrencyPrecision(
    parseFloat(order.total_discounts || '0'),
    validatedCurrency
  );
  const totalShipping = roundToCurrencyPrecision(
    parseFloat(order.total_shipping_price || order.shipping_lines?.reduce((sum: number, line: any) => sum + parseFloat(line.price || '0'), 0) || '0'),
    validatedCurrency
  );
  const totalTax = roundToCurrencyPrecision(
    parseFloat(order.total_tax || '0'),
    validatedCurrency
  );
  const totalPrice = roundToCurrencyPrecision(
    parseFloat(order.total_price || '0'),
    validatedCurrency
  );

  const newOrder = await tx.order.create({
    data: {
      id: orderId,
      shop,
      shopifyOrderId,
      shopifyOrderNumber: order.order_number?.toString() || order.number?.toString() || '',
      shopifyOrderName: order.name || '',
      customerId: customer?.id || 'unknown',
      email: order.email || order.customer?.email || '',
      currency: validatedCurrency,
      subtotalPrice,
      totalDiscounts,
      totalShipping,
      totalTax,
      totalPrice,
      totalRefunded: 0, // Will be updated when refunds are processed
      netAmount: totalPrice,
      financialStatus: (order.financial_status || 'paid').toUpperCase() as any, // Normalize to uppercase enum
      fulfillmentStatus: order.fulfillment_status || null,
      cashbackEligible,
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
  
  // Calculate totals from Order records (excluding tier product purchases)
  const orderStats = await tx.order.aggregate({
    where: {
      shop,
      customerId: customer.id,
      financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
      cashbackEligible: true  // Only count non-tier-product orders toward spending
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

// Removed updateMonthlyOrderUsage function - billing now counts orders directly from Order table