/**
 * Enhanced Order Paid Webhook Handler
 * With improved error handling, idempotency, and transactions
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { TierSubscriptionBridgeV2 } from "../services/subscription/tier-subscription-bridge.server";
import { updateCustomerToEffectiveTier } from "../services/tier-resolution.server";
import { sendTierUpgradeEmailNotification } from "../services/email-notifications.server";
import { withRetry } from "../utils/retry";
import { validatePrice } from "../utils/price-validation";
import { createTransactionAnalyzer } from "../utils/transaction-analyzer";
import {
  extractNumericId,
  normalizeSku,
  findMatchingTierProduct,
  analyzeTierProductMismatch,
} from "../utils/shopify-id-normalizer";
import { trackOrderForKlaviyo } from "../services/email-provider.server";
import { isKlaviyoEnabled } from "../services/klaviyo.server";
import {
  syncCustomerToKlaviyo,
  trackTierUpgraded,
  trackCashbackEarned,
} from "../services/klaviyo-events.server";
import { createLogger } from "../services/logger.server";
// Removed: calculateCustomerTierFromDB - now using tier resolution system
// Removed: createStoreCreditService - no longer auto-issuing store credit
import * as crypto from 'crypto';

// Create scoped logger for this webhook
const webhookLogger = createLogger('OrderPaid');

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

/**
 * Extract store credit used from order
 *
 * Checks Shopify's discount_applications for store credit type discounts.
 * Store credit in Shopify appears as a discount application with:
 * - type: "store_credit" or
 * - title containing "store credit"
 */
function extractStoreCreditUsed(order: any): number {
  if (!order.discount_applications || !Array.isArray(order.discount_applications)) {
    return 0;
  }

  let storeCreditUsed = 0;

  for (const discount of order.discount_applications) {
    // Check for native Shopify Store Credit
    if (discount.type === 'store_credit' || discount.value_type === 'store_credit') {
      const value = parseFloat(discount.value || '0');
      if (!isNaN(value)) {
        storeCreditUsed += value;
      }
    }
    // Check for store credit applied via discount code or manual discount
    // Some merchants use naming conventions like "Store Credit" or "cashback"
    else if (
      discount.title?.toLowerCase().includes('store credit') ||
      discount.title?.toLowerCase().includes('cashback') ||
      discount.description?.toLowerCase().includes('store credit')
    ) {
      const value = parseFloat(discount.value || '0');
      if (!isNaN(value)) {
        storeCreditUsed += value;
      }
    }
  }

  // Also check if store credit was used as a payment method
  // This appears in payment_gateway_names
  if (order.payment_gateway_names?.includes('store_credit')) {
    // For payment gateway store credit, we need to calculate from the order's payment details
    // This is a fallback - typically the discount_applications should cover it
    // The exact amount would need to come from order.transactions which requires a separate API call
    // For now, we just note that it was used
  }

  return storeCreditUsed;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string | undefined;
  let topic: string | undefined;
  let order: any;
  let admin: any;

  try {
    // Use Shopify's built-in webhook authentication which handles HMAC verification
    const webhookData = await authenticate.webhook(request);
    shop = webhookData.shop;
    topic = webhookData.topic;
    order = webhookData.payload;
    admin = webhookData.admin; // Get admin API access for GraphQL

    // Log webhook received with structured data
    const shopMoney = order.total_price_set?.shop_money;
    const presentmentMoney = order.total_price_set?.presentment_money;
    const isMultiCurrency = shopMoney?.currency_code !== presentmentMoney?.currency_code;

    const logger = webhookLogger.withContext({
      shop,
      orderId: order.id,
      orderName: order.name,
      hasCustomer: !!order.customer?.email
    });

    logger.info('Webhook received', {
      topic,
      webhookId: request.headers.get('X-Shopify-Webhook-Id') || 'N/A',
      orderUpdatedAt: order.updated_at,
      shopTotal: `${shopMoney?.amount || order.total_price} ${shopMoney?.currency_code || 'N/A'}`,
      presentmentTotal: `${presentmentMoney?.amount || order.total_price} ${presentmentMoney?.currency_code || order.currency}`,
      isMultiCurrency
    });

    // Generate idempotency key
    const idempotencyKey = `order-${order.id}-${order.updated_at}`;

    // Check if already processed using webhook ID
    const webhookId = request.headers.get('X-Shopify-Webhook-Id') || idempotencyKey;
    try {
      const existingProcess = await db.webhookProcessed.findUnique({
        where: { webhookId }
      });

      if (existingProcess) {
        logger.info('Order already processed, skipping');
        return json({ success: true, message: "Already processed" });
      }
    } catch (e) {
      // webhookProcessed table might not exist, continue processing
      logger.debug('Idempotency check skipped (table may not exist)');
    }

    // Process with retry logic - OPTIMIZED VERSION
    // Break up the large transaction to avoid timeouts
    const result = await withRetry(
      async () => {
        // Step 1: Record webhook as processed (outside transaction)
        try {
          await db.webhookProcessed.create({
            data: {
              id: uuidv4(),
              shop,
              topic: topic || 'orders/paid',
              webhookId,
              processedAt: new Date(),
            }
          });
        } catch (e) {
          console.log(`[OrderPaid] Could not record webhook processing (table may not exist)`);
        }

        // ========================================
        // INSPECT LINE ITEMS BEFORE PROCESSING
        // ========================================
        console.log('\n========================================');
        console.log('[OrderPaid Webhook] ORDER LINE ITEMS INSPECTION (Before Duplicate Check)');
        console.log('========================================');
        console.log(`[OrderPaid] Order ID: ${order.id}`);
        console.log(`[OrderPaid] Order Name: ${order.name}`);
        console.log(`[OrderPaid] Shop: ${shop}`);
        console.log(`[OrderPaid] Customer ID: ${order.customer?.id || 'Guest'}`);
        console.log(`[OrderPaid] Total Line Items: ${order.line_items?.length || 0}`);
        console.log('----------------------------------------');

        // Log each line item details
        if (order.line_items && order.line_items.length > 0) {
          for (let i = 0; i < order.line_items.length; i++) {
            const item = order.line_items[i];
            console.log(`\n[OrderPaid] Line Item #${i + 1}:`);
            console.log(`  - Line Item ID: ${item.id}`);
            console.log(`  - Product ID: ${item.product_id || 'N/A'}`);
            console.log(`  - Variant ID: ${item.variant_id || 'N/A'}`);
            console.log(`  - SKU: ${item.sku || 'N/A'}`);
            console.log(`  - Title: ${item.title || item.name}`);
            console.log(`  - Price: ${item.price}`);
            console.log(`  - Quantity: ${item.quantity}`);
            console.log(`  - Fulfillment Status: ${item.fulfillment_status || 'unfulfilled'}`);
            console.log(`  - Has Selling Plan: ${!!item.selling_plan_allocation}`);

            // Check if it's a tier product (exclude soft-deleted products)
            const tierProduct = await db.tierProduct.findFirst({
              where: {
                shop: shop!,
                deletedAt: null,  // Only active tier products
                OR: [
                  { shopifyProductId: item.product_id?.toString() },
                  { shopifyVariantId: item.variant_id?.toString() },
                  { sku: item.sku },
                ],
              },
              include: {
                tier: {
                  select: {
                    name: true,
                    id: true
                  }
                }
              }
            });

            if (tierProduct) {
              console.log(`  - ✅ TIER PRODUCT MATCH!`);
              console.log(`    - Tier Product ID: ${tierProduct.id}`);
              console.log(`    - Tier: ${tierProduct.tier?.name} (${tierProduct.tierId})`);
              console.log(`    - Purchase Type: ${tierProduct.purchaseType}`);
              console.log(`    - Duration: ${tierProduct.duration}`);
              console.log(`    - Price: ${tierProduct.price || tierProduct.oneTimePrice}`);
            } else {
              console.log(`  - ❌ Not a tier product`);
            }
          }
        } else {
          console.log('[OrderPaid] ⚠️ No line items in order');
        }

        // Show all tier products in database for comparison (only active ones)
        console.log('\n[OrderPaid] DATABASE TIER PRODUCTS FOR THIS SHOP (active only):');
        console.log('----------------------------------------');
        const allTierProducts = await db.tierProduct.findMany({
          where: {
            shop: shop!,
            deletedAt: null  // Only active tier products
          },
          include: {
            tier: {
              select: {
                name: true,
                id: true
              }
            }
          }
        });

        if (allTierProducts.length > 0) {
          console.log(`[OrderPaid] Found ${allTierProducts.length} tier products in database:`);
          allTierProducts.forEach((tp, idx) => {
            console.log(`\n  ${idx + 1}. ${tp.tier?.name || 'Unknown Tier'}`);
            console.log(`     - Tier Product ID: ${tp.id}`);
            console.log(`     - Shopify Product ID: ${tp.shopifyProductId || 'N/A'}`);
            console.log(`     - Shopify Variant ID: ${tp.shopifyVariantId || 'N/A'}`);
            console.log(`     - SKU: ${tp.sku || 'N/A'}`);
            console.log(`     - Purchase Type: ${tp.purchaseType}`);
            console.log(`     - Duration: ${tp.duration}`);
          });
        } else {
          console.log(`[OrderPaid] ⚠️ NO TIER PRODUCTS CONFIGURED FOR THIS SHOP`);
        }
        console.log('========================================\n');

        // Step 2: Create Order record (NO TRANSACTION - match sync service)
        const orderCreated = await createOrderRecord(db, {
          shop: shop!,
          order,
        });

        if (!orderCreated) {
          console.log(`\n[OrderPaid] ⚠️ Order already exists (webhook retry detected)`);
          console.log(`[OrderPaid] Order ID: ${order.id}, Order Name: ${order.name}`);
          console.log(`[OrderPaid] This is likely a Shopify webhook retry - order was already processed`);

          // Check if tier purchases exist for this order
          const existingTierPurchases = await db.tierPurchase.findMany({
            where: {
              shop: shop!,
              shopifyOrderId: order.id.toString()
            },
            include: {
              tier: {
                select: {
                  name: true
                }
              },
              tierProduct: {
                select: {
                  shopifyProductId: true,
                  shopifyVariantId: true,
                  sku: true
                }
              }
            }
          });

          if (existingTierPurchases.length > 0) {
            console.log(`[OrderPaid] ✅ Found ${existingTierPurchases.length} tier purchase(s) already recorded:`);
            existingTierPurchases.forEach((purchase, idx) => {
              console.log(`  ${idx + 1}. Tier: ${purchase.tier?.name || 'Unknown'}`);
              console.log(`     - Purchase ID: ${purchase.id}`);
              console.log(`     - Status: ${purchase.status}`);
              console.log(`     - Start Date: ${purchase.startDate}`);
              console.log(`     - End Date: ${purchase.endDate || 'LIFETIME'}`);
              console.log(`     - Product ID: ${purchase.tierProduct?.shopifyProductId || 'N/A'}`);
            });
          } else {
            console.log(`[OrderPaid] ℹ️ No tier purchases found for this order (it may not contain tier products)`);
          }

          console.log(`[OrderPaid] ℹ️ See line items inspection above for tier product details`);
          console.log('========================================\n');
          return { success: true, results: [] };
        }

        // Step 3: Process special line items (subscriptions, tier products)
        const results = [];
        let tierPurchaseMade = false;
        let tierPurchaseCustomerId: string | null = null;

        console.log('========================================');
        console.log('[OrderPaid] Walking through raw line items from webhook payload');
        console.log('========================================');
        order.line_items.forEach((item: any, index: number) => {
          console.log(`[OrderPaid] Line Item #${index + 1}`, {
            id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            sku: item.sku,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
            fulfillment_status: item.fulfillment_status,
          });
        });

        for (const lineItem of order.line_items) {
          try {
            console.log('----------------------------------------');
            console.log('[OrderPaid] Processing line item', {
              id: lineItem.id,
              product_id: lineItem.product_id,
              variant_id: lineItem.variant_id,
              sku: lineItem.sku,
              name: lineItem.name,
              quantity: lineItem.quantity,
            });
            const itemResult = await processLineItem(db, {
              shop: shop!,
              admin,
              order,
              lineItem,
            });
            results.push(itemResult);

            // Check if this was a tier purchase that needs resolution
            if (itemResult?.needsResolution && itemResult?.customerId) {
              tierPurchaseMade = true;
              tierPurchaseCustomerId = itemResult.customerId;
            }
          } catch (e) {
            console.error(`[OrderPaid] Error processing line item ${lineItem.id}:`, e);
          }
        }

        // Step 3.5: Resolve effective tier if tier purchase was made
        // This must happen AFTER the transaction completes and BEFORE spending-based tier check
        if (tierPurchaseMade && tierPurchaseCustomerId) {
          try {
            console.log('========================================');
            console.log('[TIER RESOLUTION] Tier Purchase Detected - Starting Resolution');
            console.log('========================================');
            console.log(`[TIER RESOLUTION] Customer ID: ${tierPurchaseCustomerId}`);

            const tierPurchaseResults = results.filter(r => r?.type === 'one_time_tier' && r?.needsResolution);
            console.log(`[TIER RESOLUTION] Number of tier purchases to resolve: ${tierPurchaseResults.length}`);

            for (const purchaseResult of tierPurchaseResults) {
              console.log('[TIER RESOLUTION] Processing purchase:');
              console.log(`  - Customer ID: ${purchaseResult.customerId}`);
              console.log(`  - Tier ID: ${purchaseResult.tierId}`);
              console.log(`  - Purchase ID: ${purchaseResult.tierPurchaseId}`);
              console.log(`  - Order ID: ${order.id}`);
              console.log('[TIER RESOLUTION] → Calling updateCustomerToEffectiveTier()...');

              const resolutionResult = await updateCustomerToEffectiveTier(
                shop!,
                purchaseResult.customerId,
                {
                  triggeredBy: 'TIER_PURCHASE',
                  orderId: order.id?.toString(),
                  purchaseId: purchaseResult.tierPurchaseId
                }
              );

              console.log('[TIER RESOLUTION] ✅ Resolution Complete');
              console.log('[TIER RESOLUTION] Result:');
              console.log(`  - Changed: ${resolutionResult.changed}`);
              console.log(`  - Source: ${resolutionResult.source}`);
              console.log(`  - Previous Tier ID: ${resolutionResult.previousTierId || 'None'}`);
              console.log(`  - New Tier ID: ${resolutionResult.newTierId || 'None'}`);

              if (resolutionResult.changed) {
                console.log('[TIER RESOLUTION] 🎉 Customer tier has been updated!');
              } else {
                console.log('[TIER RESOLUTION] ℹ️ Customer tier unchanged (higher priority source exists)');
              }
              console.log('========================================');
            }
          } catch (e) {
            console.error(`[TIER RESOLUTION] ❌ Error resolving tier after purchase:`, e);
            // Don't fail the whole webhook - purchase is already recorded
          }
        }

        // Step 4: Process cashback and update customer (separate operations)
        try {
          await processCashback(db, {
            shop: shop!,
            order,
            admin,
          });

          await updateCustomerSpendingFromOrders(db, {
            shop: shop!,
            order,
          });

          // Check for tier progression
          if (order.customer?.id) {
            console.log(`[OrderPaid] Looking for customer with shopifyCustomerId: ${order.customer.id}`);

            const dbCustomer = await db.customer.findFirst({
              where: {
                shop: shop!,
                shopifyCustomerId: order.customer.id.toString()
              }
            });

            if (dbCustomer) {
              console.log(`[OrderPaid] Found customer ${dbCustomer.id}, checking tier progression...`);
              await checkTierProgression(db, {
                shop: shop!,
                customerId: dbCustomer.id,
                admin: admin, // Pass the admin context from webhook
                orderId: order.id?.toString() // Pass order ID for logging
              });
            } else {
              console.log(`[OrderPaid] Customer not found in database for Shopify ID: ${order.customer.id}`);
              // Customer might not exist yet - let's create them
              const customerId = crypto.randomUUID();
              await db.customer.create({
                data: {
                  id: customerId,
                  shop: shop!,
                  shopifyCustomerId: order.customer.id.toString(),
                  email: order.customer?.email || order.email || `customer_${order.customer.id}@shop.com`,
                  firstName: order.customer?.first_name || null,
                  lastName: order.customer?.last_name || null,
                  storeCredit: 0,
                  totalSpent: 0,
                  netSpent: 0,
                  totalRefunded: 0,
                  orderCount: 0,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              });
              console.log(`[OrderPaid] Created customer ${customerId}, now checking tier progression...`);

              // Now check tier progression for the new customer
              await checkTierProgression(db, {
                shop: shop!,
                customerId: customerId,
                admin: admin,
                orderId: order.id?.toString()
              });
            }
          } else {
            console.log(`[OrderPaid] No customer ID in order, skipping tier progression`);
          }
        } catch (e) {
          console.error(`[OrderPaid] Error in post-processing:`, e);
          // Don't fail the whole webhook - order is already created
        }

        return { success: true, results };
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
    
    webhookLogger.info('Order processed successfully', { orderId: order.id, shop });
    return json({ success: true, data: result });

  } catch (error) {
    const errorLogger = webhookLogger.withContext({ shop, orderId: order?.id || 'unknown' });
    errorLogger.error('Order processing failed', error);

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
      }).catch(e => errorLogger.error('Failed to log webhook error', e));
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

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    TIER PRODUCT RECOGNITION - LINE ITEM                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // ============================================
  // SECTION 1: RAW LINE ITEM DATA (from Shopify webhook)
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 1: RAW LINE ITEM DATA (from Shopify Webhook)                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('[TPR] Line Item ID:      ', lineItem.id, `(type: ${typeof lineItem.id})`);
  console.log('[TPR] Product ID:        ', lineItem.product_id, `(type: ${typeof lineItem.product_id})`);
  console.log('[TPR] Variant ID:        ', lineItem.variant_id, `(type: ${typeof lineItem.variant_id})`);
  console.log('[TPR] SKU:               ', lineItem.sku, `(type: ${typeof lineItem.sku})`);
  console.log('[TPR] Title:             ', lineItem.title);
  console.log('[TPR] Name:              ', lineItem.name);
  console.log('[TPR] Price:             ', lineItem.price, order.currency);
  console.log('[TPR] Quantity:          ', lineItem.quantity);
  console.log('[TPR] Vendor:            ', lineItem.vendor);
  console.log('[TPR] Product Exists:    ', lineItem.product_exists);
  console.log('[TPR] Fulfillable Qty:   ', lineItem.fulfillable_quantity);
  console.log('[TPR] Fulfillment Status:', lineItem.fulfillment_status);
  console.log('[TPR] Gift Card:         ', lineItem.gift_card);
  console.log('[TPR] Taxable:           ', lineItem.taxable);
  console.log('[TPR] Properties:        ', JSON.stringify(lineItem.properties || []));

  // ============================================
  // SECTION 2: NORMALIZED VALUES FOR MATCHING
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 2: NORMALIZED VALUES FOR MATCHING                                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  // Use the Shopify ID normalizer to extract numeric IDs from any format
  // This handles both REST API IDs (123456789) and GraphQL IDs (gid://shopify/Product/123456789)
  const normalizedProductId = extractNumericId(lineItem.product_id);
  const normalizedVariantId = extractNumericId(lineItem.variant_id);
  const normalizedSku = normalizeSku(lineItem.sku);

  // Also keep raw values for logging
  const rawProductId = lineItem.product_id?.toString() || null;
  const rawVariantId = lineItem.variant_id?.toString() || null;
  const rawSku = lineItem.sku || null;

  console.log('[TPR] Raw Product ID:        ', `"${rawProductId}"`, rawProductId ? `(type: ${typeof lineItem.product_id})` : '(null)');
  console.log('[TPR] Raw Variant ID:        ', `"${rawVariantId}"`, rawVariantId ? `(type: ${typeof lineItem.variant_id})` : '(null)');
  console.log('[TPR] Raw SKU:               ', `"${rawSku}"`);
  console.log('[TPR] Normalized Product ID: ', `"${normalizedProductId}"`, normalizedProductId !== rawProductId ? '(extracted from GID)' : '');
  console.log('[TPR] Normalized Variant ID: ', `"${normalizedVariantId}"`, normalizedVariantId !== rawVariantId ? '(extracted from GID)' : '');
  console.log('[TPR] Normalized SKU:        ', `"${normalizedSku}"`, normalizedSku !== rawSku ? '(normalized: uppercase, trimmed)' : '');
  console.log('[TPR] Shop:                  ', `"${shop}"`);

  // ============================================
  // SECTION 3: SUBSCRIPTION CHECK
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 3: SUBSCRIPTION CHECK                                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  const sellingPlanAllocation = lineItem.selling_plan_allocation;
  const isSubscription = !!sellingPlanAllocation;

  console.log('[TPR] Has selling_plan_allocation:', isSubscription);
  if (sellingPlanAllocation) {
    console.log('[TPR] Selling Plan ID:            ', sellingPlanAllocation.selling_plan_id);
    console.log('[TPR] Selling Plan Group ID:      ', sellingPlanAllocation.selling_plan_group_id);
    console.log('[TPR] Full Allocation:            ', JSON.stringify(sellingPlanAllocation, null, 2));
  }

  if (isSubscription) {
    console.log('[TPR] ✅ SUBSCRIPTION DETECTED - Routing to TierSubscriptionBridgeV2');
    console.log('══════════════════════════════════════════════════════════════════════════════\n');

    const contractId = sellingPlanAllocation.selling_plan_id;

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

  console.log('[TPR] ℹ️  Not a subscription - checking for one-time tier product...');

  // ============================================
  // SECTION 4: DATABASE TIER PRODUCTS
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 4: ALL TIER PRODUCTS IN DATABASE FOR THIS SHOP                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  // CRITICAL FIX: Filter out soft-deleted tier products
  // Products with deletedAt set should not be matched for purchases
  const allTierProducts = await tx.tierProduct.findMany({
    where: {
      shop,
      deletedAt: null  // Only active (non-deleted) tier products
    },
    include: {
      tier: {
        select: {
          id: true,
          name: true,
          minSpend: true,
          cashbackPercent: true
        }
      }
    }
  });

  console.log(`[TPR] Total tier products found for shop "${shop}": ${allTierProducts.length}`);

  if (allTierProducts.length === 0) {
    console.log('[TPR] ⚠️  WARNING: No tier products configured for this shop!');
    console.log('[TPR] ⚠️  Create tier products in the admin panel to enable tier purchases.');
  } else {
    console.log('[TPR] ─────────────────────────────────────────────────────────────────────────');
    allTierProducts.forEach((tp: any, idx: number) => {
      console.log(`[TPR] Tier Product #${idx + 1}:`);
      console.log(`[TPR]   ID:                ${tp.id}`);
      console.log(`[TPR]   Tier:              ${tp.tier?.name || 'MISSING TIER!'} (${tp.tierId})`);
      console.log(`[TPR]   Shopify Product ID: "${tp.shopifyProductId}" (type: ${typeof tp.shopifyProductId})`);
      console.log(`[TPR]   Shopify Variant ID: "${tp.shopifyVariantId}" (type: ${typeof tp.shopifyVariantId})`);
      console.log(`[TPR]   SKU:                "${tp.sku}" (type: ${typeof tp.sku})`);
      console.log(`[TPR]   Purchase Type:      ${tp.purchaseType}`);
      console.log(`[TPR]   Duration:           ${tp.duration}`);
      console.log(`[TPR]   One-Time Price:     ${tp.oneTimePrice}`);
      console.log(`[TPR]   Status:             ${tp.status}`);
      console.log(`[TPR]   Created At:         ${tp.createdAt}`);
      if (idx < allTierProducts.length - 1) {
        console.log('[TPR]   ---');
      }
    });
    console.log('[TPR] ─────────────────────────────────────────────────────────────────────────');
  }

  // ============================================
  // SECTION 5: MANUAL MATCH ANALYSIS
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 5: MANUAL MATCH ANALYSIS (comparing each tier product)              │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  let potentialMatches: any[] = [];

  for (const tp of allTierProducts) {
    console.log(`\n[TPR] Analyzing TierProduct: ${tp.id}`);
    console.log(`[TPR]   Tier: ${tp.tier?.name || 'MISSING'}`);

    // Check purchase type eligibility
    const purchaseTypeEligible = tp.purchaseType === 'ONE_TIME' || tp.purchaseType === 'BOTH';
    console.log(`[TPR]   Purchase Type Check: ${tp.purchaseType} → ${purchaseTypeEligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE (needs ONE_TIME or BOTH)'}`);

    if (!purchaseTypeEligible) {
      console.log(`[TPR]   → Skipping (purchase type is ${tp.purchaseType})`);
      continue;
    }

    // Normalize tier product IDs (handles GraphQL global ID format)
    const tpNormalizedProductId = extractNumericId(tp.shopifyProductId);
    const tpNormalizedVariantId = extractNumericId(tp.shopifyVariantId);
    const tpNormalizedSku = normalizeSku(tp.sku);

    // Check Product ID match (normalized comparison)
    const productIdMatch = normalizedProductId && tpNormalizedProductId &&
      normalizedProductId === tpNormalizedProductId;
    console.log(`[TPR]   Product ID Match: "${normalizedProductId}" === "${tpNormalizedProductId}" (from "${tp.shopifyProductId}") → ${productIdMatch ? '✅ MATCH' : '❌ NO MATCH'}`);

    // Check Variant ID match (normalized comparison)
    const variantIdMatch = normalizedVariantId && tpNormalizedVariantId &&
      normalizedVariantId === tpNormalizedVariantId;
    console.log(`[TPR]   Variant ID Match: "${normalizedVariantId}" === "${tpNormalizedVariantId}" (from "${tp.shopifyVariantId}") → ${variantIdMatch ? '✅ MATCH' : '❌ NO MATCH'}`);

    // Check SKU match (case-insensitive via normalization)
    const skuMatch = normalizedSku && tpNormalizedSku &&
      normalizedSku === tpNormalizedSku;
    console.log(`[TPR]   SKU Match:        "${normalizedSku}" === "${tpNormalizedSku}" (from "${tp.sku}") → ${skuMatch ? '✅ MATCH' : '❌ NO MATCH'}`);

    // Check if any match criteria is met
    const hasMatch = productIdMatch || variantIdMatch || skuMatch;

    if (hasMatch) {
      const matchReasons = [];
      if (productIdMatch) matchReasons.push('PRODUCT_ID');
      if (variantIdMatch) matchReasons.push('VARIANT_ID');
      if (skuMatch) matchReasons.push('SKU');

      console.log(`[TPR]   🎯 POTENTIAL MATCH FOUND! Matched by: ${matchReasons.join(', ')}`);
      potentialMatches.push({
        tierProduct: tp,
        matchReasons,
        productIdMatch,
        variantIdMatch,
        skuMatch
      });
    } else {
      console.log(`[TPR]   → No match criteria met`);

      // Additional debugging for near-misses
      if (normalizedProductId && tp.shopifyProductId) {
        if (normalizedProductId.includes(tp.shopifyProductId) || tp.shopifyProductId.includes(normalizedProductId)) {
          console.log(`[TPR]   ⚠️  NEAR MISS: Product IDs are similar but not exact`);
        }
      }
      if (normalizedVariantId && tp.shopifyVariantId) {
        if (normalizedVariantId.includes(tp.shopifyVariantId) || tp.shopifyVariantId.includes(normalizedVariantId)) {
          console.log(`[TPR]   ⚠️  NEAR MISS: Variant IDs are similar but not exact`);
        }
      }
      if (normalizedSku && tp.sku) {
        const skuLower = normalizedSku.toLowerCase();
        const tpSkuLower = tp.sku.toLowerCase();
        if (skuLower === tpSkuLower && normalizedSku !== tp.sku) {
          console.log(`[TPR]   ⚠️  NEAR MISS: SKUs match case-insensitively: "${normalizedSku}" vs "${tp.sku}"`);
        }
      }
    }
  }

  console.log(`\n[TPR] Total potential matches found: ${potentialMatches.length}`);

  // ============================================
  // SECTION 6: NORMALIZED TIER PRODUCT MATCHING
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 6: NORMALIZED TIER PRODUCT MATCHING                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  console.log('[TPR] Using findMatchingTierProduct utility for normalized matching');
  console.log('[TPR] This handles:');
  console.log('[TPR]   - REST API IDs vs GraphQL global IDs');
  console.log('[TPR]   - Case-insensitive SKU matching');
  console.log('[TPR]   - Whitespace normalization');

  const matchStartTime = Date.now();

  // Use the utility function for normalized matching
  // This handles the ID format mismatch between webhook (REST) and database (GraphQL)
  const matchResult = findMatchingTierProduct(
    {
      product_id: lineItem.product_id,
      variant_id: lineItem.variant_id,
      sku: lineItem.sku,
    },
    allTierProducts
  );

  const tierProduct = matchResult.matched ? matchResult.tierProduct : null;

  const matchDuration = Date.now() - matchStartTime;
  console.log(`[TPR] Matching completed in ${matchDuration}ms`);

  if (matchResult.matched) {
    console.log('[TPR] ✅ Match found via utility:');
    console.log(`[TPR]   Matched by: ${matchResult.matchedBy.join(', ')}`);
    console.log(`[TPR]   Details: ${JSON.stringify(matchResult.matchDetails, null, 2)}`);
  } else {
    // Provide detailed mismatch analysis
    const mismatchAnalysis = analyzeTierProductMismatch(
      {
        product_id: lineItem.product_id,
        variant_id: lineItem.variant_id,
        sku: lineItem.sku,
      },
      allTierProducts
    );

    console.log('[TPR] ❌ No match found. Mismatch analysis:');
    console.log(`[TPR]   Line Item IDs: ${JSON.stringify(mismatchAnalysis.lineItemIds)}`);
    console.log(`[TPR]   Eligible products checked: ${mismatchAnalysis.eligibleProducts}`);
    if (mismatchAnalysis.nearMisses.length > 0) {
      console.log('[TPR]   Near misses detected:');
      mismatchAnalysis.nearMisses.forEach(nm => {
        console.log(`[TPR]     - ${nm.tierName}: ${nm.reason}`);
      });
    }
  }

  // ============================================
  // SECTION 7: RESULT ANALYSIS
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SECTION 7: QUERY RESULT ANALYSIS                                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  if (tierProduct) {
    console.log('[TPR] ╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('[TPR] ║  ✅ TIER PRODUCT MATCH CONFIRMED!                                     ║');
    console.log('[TPR] ╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('[TPR] Matched TierProduct Details:');
    console.log(`[TPR]   ID:                 ${tierProduct.id}`);
    console.log(`[TPR]   Tier ID:            ${tierProduct.tierId}`);
    console.log(`[TPR]   Tier Name:          ${tierProduct.tier?.name || 'MISSING!'}`);
    console.log(`[TPR]   Tier Min Spend:     ${tierProduct.tier?.minSpend}`);
    console.log(`[TPR]   Tier Cashback:      ${tierProduct.tier?.cashbackPercent}%`);
    console.log(`[TPR]   Shopify Product ID: ${tierProduct.shopifyProductId}`);
    console.log(`[TPR]   Shopify Variant ID: ${tierProduct.shopifyVariantId}`);
    console.log(`[TPR]   SKU:                ${tierProduct.sku}`);
    console.log(`[TPR]   Purchase Type:      ${tierProduct.purchaseType}`);
    console.log(`[TPR]   Duration:           ${tierProduct.duration}`);
    console.log(`[TPR]   One-Time Price:     ${tierProduct.oneTimePrice}`);
    console.log(`[TPR]   Currency:           ${tierProduct.currency}`);
    console.log(`[TPR]   Status:             ${tierProduct.status}`);

    // Use match result from utility
    console.log(`[TPR]   Matched By:         ${matchResult.matchedBy.join(', ')}`);
    console.log(`[TPR]   Match Details:`);
    console.log(`[TPR]     - Product ID: ${matchResult.matchDetails.productIdMatch ? '✅' : '❌'} (line: ${matchResult.matchDetails.lineItemProductId} → db: ${matchResult.matchDetails.tierProductProductId})`);
    console.log(`[TPR]     - Variant ID: ${matchResult.matchDetails.variantIdMatch ? '✅' : '❌'} (line: ${matchResult.matchDetails.lineItemVariantId} → db: ${matchResult.matchDetails.tierProductVariantId})`);
    console.log(`[TPR]     - SKU:        ${matchResult.matchDetails.skuMatch ? '✅' : '❌'} (line: ${matchResult.matchDetails.lineItemSku} → db: ${matchResult.matchDetails.tierProductSku})`);

    // Validate tier exists
    if (!tierProduct.tier) {
      console.log('[TPR] ⚠️  WARNING: TierProduct references non-existent tier!');
      console.log(`[TPR] ⚠️  Tier ID ${tierProduct.tierId} does not exist in database`);
      console.log('[TPR] ⚠️  This will cause an error in processOneTimeTierPurchase()');
    }

    console.log('[TPR] → Proceeding to create TierPurchase record...');
    console.log('══════════════════════════════════════════════════════════════════════════════\n');

    return await processOneTimeTierPurchase(tx, {
      shop,
      order,
      lineItem,
      tierProduct,
    });
  }

  // No match found - detailed analysis
  console.log('[TPR] ╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('[TPR] ║  ❌ NO TIER PRODUCT MATCH FOUND                                        ║');
  console.log('[TPR] ╚═══════════════════════════════════════════════════════════════════════╝');

  console.log('\n[TPR] DIAGNOSTIC SUMMARY:');
  console.log('[TPR] ─────────────────────────────────────────────────────────────────────────');

  if (allTierProducts.length === 0) {
    console.log('[TPR] ⚠️  REASON: No tier products exist for this shop');
    console.log('[TPR]    ACTION: Create tier products in admin panel');
  } else {
    console.log(`[TPR] Tier products exist (${allTierProducts.length}), but none matched because:`);

    const eligibleProducts = allTierProducts.filter((tp: any) =>
      tp.purchaseType === 'ONE_TIME' || tp.purchaseType === 'BOTH'
    );

    if (eligibleProducts.length === 0) {
      console.log('[TPR] ⚠️  REASON: No tier products have purchaseType ONE_TIME or BOTH');
      console.log('[TPR]    All tier products are SUBSCRIPTION only');
    } else {
      console.log(`[TPR] ${eligibleProducts.length} tier product(s) eligible for one-time purchase:`);

      for (const tp of eligibleProducts) {
        console.log(`[TPR]   - ${tp.tier?.name || 'Unknown Tier'}:`);

        // Check why it didn't match
        const reasons = [];

        if (!tp.shopifyProductId && !tp.shopifyVariantId && !tp.sku) {
          reasons.push('No matching identifiers configured (Product ID, Variant ID, or SKU are all empty)');
        } else {
          if (tp.shopifyProductId && normalizedProductId && tp.shopifyProductId !== normalizedProductId) {
            reasons.push(`Product ID mismatch: DB="${tp.shopifyProductId}" vs Order="${normalizedProductId}"`);
          }
          if (tp.shopifyVariantId && normalizedVariantId && tp.shopifyVariantId !== normalizedVariantId) {
            reasons.push(`Variant ID mismatch: DB="${tp.shopifyVariantId}" vs Order="${normalizedVariantId}"`);
          }
          if (tp.sku && normalizedSku && tp.sku !== normalizedSku) {
            reasons.push(`SKU mismatch: DB="${tp.sku}" vs Order="${normalizedSku}"`);
          }
          if (!tp.shopifyProductId && !tp.shopifyVariantId && !tp.sku) {
            reasons.push('No identifiers configured in tier product');
          }
        }

        reasons.forEach(r => console.log(`[TPR]       → ${r}`));
      }
    }
  }

  console.log('[TPR] ─────────────────────────────────────────────────────────────────────────');
  console.log('[TPR] → Processing as regular line item (not a tier product)');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  return { type: 'regular', processed: false };
}

async function processOneTimeTierPurchase(tx: any, params: {
  shop: string;
  order: any;
  lineItem: any;
  tierProduct: any;
}) {
  const { shop, order, lineItem, tierProduct } = params;

  console.log('========================================');
  console.log('[TIER PURCHASE CREATION] Starting Tier Purchase Creation');
  console.log('========================================');

  // Validate price
  console.log('[TIER PURCHASE CREATION] Step 1: Validating Price');
  console.log(`  - Line Item Price: ${lineItem.price}`);
  console.log(`  - Currency: ${order.currency}`);

  const priceValidation = validatePrice(lineItem.price, order.currency);
  if (!priceValidation.valid) {
    console.log(`[TIER PURCHASE CREATION] ❌ Price validation failed: ${priceValidation.error}`);
    throw new Error(`Invalid price for tier product: ${priceValidation.error}`);
  }

  console.log(`[TIER PURCHASE CREATION] ✅ Price validated: ${priceValidation.sanitizedPrice}`);

  // Get or create customer
  console.log('[TIER PURCHASE CREATION] Step 2: Get or Create Customer');
  console.log(`  - Shopify Customer ID: ${order.customer?.id}`);
  console.log(`  - Has Email: ${!!(order.customer?.email || order.email)}`);

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
      totalSpent: 0,
      netSpent: 0,
      totalRefunded: 0,
      orderCount: 0,
      currentTierId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  });

  console.log(`[TIER PURCHASE CREATION] ✅ Customer: ${customer.id}`);

  // Validate that the tier exists before creating TierPurchase
  console.log('[TIER PURCHASE CREATION] Step 3: Validate Tier & TierProduct Status');
  console.log(`  - Tier ID: ${tierProduct.tierId}`);
  console.log(`  - TierProduct ID: ${tierProduct.id}`);

  // CRITICAL FIX: Check if TierProduct was soft-deleted (edge case: deleted between checkout and webhook)
  const currentTierProduct = await tx.tierProduct.findUnique({
    where: { id: tierProduct.id },
    select: { id: true, deletedAt: true, tierId: true }
  });

  if (!currentTierProduct || currentTierProduct.deletedAt) {
    console.error(`[TIER PURCHASE CREATION] ❌ CRITICAL: TierProduct was deleted between checkout and payment`);
    console.error(`  - TierProduct ID: ${tierProduct.id}`);
    console.error(`  - Deleted At: ${currentTierProduct?.deletedAt || 'Not found'}`);
    console.error(`  - Order ID: ${order.id}`);
    console.error(`  - Customer: ${order.customer?.email || 'Unknown'}`);
    console.error(`  - Line Item Price: ${lineItem.price} ${order.currency}`);

    // Create a failed tier purchase record for admin review
    try {
      await tx.webhookError.create({
        data: {
          id: uuidv4(),
          shop,
          topic: 'tier_purchase_failed',
          orderId: order.id.toString(),
          error: `TierProduct ${tierProduct.id} was deleted - customer charged but cannot receive tier`,
          payload: {
            tierProductId: tierProduct.id,
            tierId: tierProduct.tierId,
            lineItemId: lineItem.id,
            lineItemPrice: lineItem.price,
            currency: order.currency,
            customerEmail: order.customer?.email,
            customerId: order.customer?.id,
            sku: lineItem.sku,
            productTitle: lineItem.name,
            requiresManualReview: true,
            suggestedAction: 'REFUND_OR_ASSIGN_TIER_MANUALLY'
          },
          createdAt: new Date(),
        }
      });
      console.log(`[TIER PURCHASE CREATION] ⚠️ Created admin alert for manual review`);
    } catch (alertError) {
      console.error(`[TIER PURCHASE CREATION] Failed to create admin alert:`, alertError);
    }

    return {
      type: 'one_time_tier',
      processed: false,
      error: 'TIER_PRODUCT_DELETED',
      message: 'Tier product was deleted - requires manual review',
      orderId: order.id.toString(),
      lineItemId: lineItem.id.toString(),
      requiresRefund: true,
    };
  }

  const tier = await tx.tier.findUnique({
    where: { id: tierProduct.tierId },
  });

  if (!tier) {
    console.error(`[TIER PURCHASE CREATION] ❌ CRITICAL: Tier not found for TierProduct`);
    console.error(`  - TierProduct ID: ${tierProduct.id}`);
    console.error(`  - TierProduct.tierId: ${tierProduct.tierId}`);
    console.error(`  - This is an orphaned TierProduct record`);
    console.error(`  - Order ID: ${order.id}`);
    console.error(`  - Customer: ${order.customer?.email || 'Unknown'}`);
    console.error(`  - Line Item Price: ${lineItem.price} ${order.currency}`);

    // Create a failed tier purchase record for admin review
    try {
      await tx.webhookError.create({
        data: {
          id: uuidv4(),
          shop,
          topic: 'tier_purchase_failed',
          orderId: order.id.toString(),
          error: `Tier ${tierProduct.tierId} not found - TierProduct ${tierProduct.id} is orphaned`,
          payload: {
            tierProductId: tierProduct.id,
            tierId: tierProduct.tierId,
            lineItemId: lineItem.id,
            lineItemPrice: lineItem.price,
            currency: order.currency,
            customerEmail: order.customer?.email,
            customerId: order.customer?.id,
            sku: lineItem.sku,
            productTitle: lineItem.name,
            requiresManualReview: true,
            suggestedAction: 'REFUND_OR_ASSIGN_TIER_MANUALLY'
          },
          createdAt: new Date(),
        }
      });
      console.log(`[TIER PURCHASE CREATION] ⚠️ Created admin alert for manual review`);
    } catch (alertError) {
      console.error(`[TIER PURCHASE CREATION] Failed to create admin alert:`, alertError);
    }

    return {
      type: 'one_time_tier',
      processed: false,
      error: 'TIER_NOT_FOUND',
      message: 'Tier was deleted - requires manual review',
      orderId: order.id.toString(),
      lineItemId: lineItem.id.toString(),
      requiresRefund: true,
    };
  }

  console.log(`[TIER PURCHASE CREATION] ✅ Tier validated: ${tier.name}`);

  // Calculate tier duration
  console.log('[TIER PURCHASE CREATION] Step 4: Calculate Tier Duration');
  const now = new Date();
  let tierEndDate: Date | null = null;

  console.log(`  - Duration Type: ${tierProduct.duration || 'not specified'}`);
  console.log(`  - Start Date: ${now.toISOString()}`);

  if (tierProduct.duration) {
    tierEndDate = new Date(now);
    switch (tierProduct.duration) {
      case 'MONTHLY':
        tierEndDate.setMonth(tierEndDate.getMonth() + 1);
        console.log(`  - Calculated End Date (MONTHLY): ${tierEndDate.toISOString()}`);
        break;
      case 'ANNUAL':
        tierEndDate.setFullYear(tierEndDate.getFullYear() + 1);
        console.log(`  - Calculated End Date (ANNUAL): ${tierEndDate.toISOString()}`);
        break;
      case 'LIFETIME':
        tierEndDate = null; // No expiry
        console.log(`  - End Date: LIFETIME (null)`);
        break;
    }
  }

  // Create tier purchase record
  console.log('[TIER PURCHASE CREATION] Step 5: Creating TierPurchase Record');
  const tierPurchaseId = uuidv4();

  console.log('[TIER PURCHASE CREATION] TierPurchase Data:');
  console.log(`  - ID: ${tierPurchaseId}`);
  console.log(`  - Shop: ${shop}`);
  console.log(`  - Customer ID: ${customer.id}`);
  console.log(`  - Tier ID: ${tierProduct.tierId}`);
  console.log(`  - Tier Product ID: ${tierProduct.id}`);
  console.log(`  - Shopify Order ID: ${order.id}`);
  console.log(`  - Shopify Line Item ID: ${lineItem.id}`);
  console.log(`  - Purchase Price: ${priceValidation.sanitizedPrice}`);
  console.log(`  - Currency: ${order.currency}`);
  console.log(`  - Start Date: ${now.toISOString()}`);
  console.log(`  - End Date: ${tierEndDate?.toISOString() || 'LIFETIME'}`);
  console.log(`  - Status: ACTIVE`);

  const tierPurchase = await tx.tierPurchase.create({
    data: {
      id: tierPurchaseId,
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

  console.log('[TIER PURCHASE CREATION] ✅ TierPurchase record created successfully!');
  console.log(`[TIER PURCHASE CREATION] Purchase ID: ${tierPurchase.id}`);
  console.log(`[TIER PURCHASE CREATION] Duration: ${tierProduct.duration}`);
  console.log(`[TIER PURCHASE CREATION] End Date: ${tierEndDate?.toISOString() || 'LIFETIME'}`);
  console.log('[TIER PURCHASE CREATION] → Tier resolution will be triggered next');
  console.log('========================================');

  // NOTE: Do NOT directly update customer tier here!
  // Tier resolution will be called OUTSIDE the transaction to handle conflicts
  // This allows the resolution system to check all tier sources (manual override, subscription, purchase, spending)

  return {
    type: 'one_time_tier',
    processed: true,
    tierId: tierProduct.tierId,
    tierPurchaseId: tierPurchase.id,
    customerId: customer.id,
    endDate: tierEndDate,
    needsResolution: true, // Signal that tier resolution should be called
  };
}

/**
 * Process cashback calculation and create pending ledger entry
 * Note: Does NOT automatically issue store credit to Shopify
 * Cashback will be marked as PENDING for manual processing
 */
async function processCashback(tx: any, params: {
  shop: string;
  order: any;
  admin: any;
}) {
  const { shop, order, admin } = params;

  // Check automatic cashback processing setting (we'll use this later)
  const shopSettings = await tx.shopSettings.findUnique({
    where: { shop },
    select: { autoCashbackProcessingEnabled: true, storeCurrency: true }
  });

  const autoProcessingEnabled = shopSettings?.autoCashbackProcessingEnabled !== false; // Default to true if not set

  if (!order.customer?.id) {
    console.log('[OrderPaid] No customer ID, skipping cashback');
    return;
  }

  // Get customer
  const customer = await tx.customer.findUnique({
    where: {
      shop_shopifyCustomerId: {
        shop,
        shopifyCustomerId: order.customer.id.toString(),
      }
    }
  });

  if (!customer) {
    console.log('[OrderPaid] Customer not found, skipping cashback');
    return;
  }

  // Fetch current tier
  let currentTier = null;
  if (customer.currentTierId) {
    currentTier = await tx.tier.findUnique({
      where: { id: customer.currentTierId }
    });
  }

  if (!currentTier) {
    console.log('[OrderPaid] Customer has no tier, skipping cashback');
    return;
  }

  // Create transaction analyzer to check payment methods
  const analyzer = createTransactionAnalyzer(admin);

  // Analyze order transactions to determine cashback eligibility
  const { eligibleAmount, breakdown } = await analyzer.getCashbackEligibleAmount(order.id.toString());

  console.log(`[OrderPaid] Payment breakdown for order ${order.name}:`, {
    totalPaid: order.total_price,
    eligibleForCashback: eligibleAmount,
    giftCard: breakdown?.giftCardAmount || 0,
    storeCredit: breakdown?.storeCreditAmount || 0
  });

  // Calculate cashback only on eligible amount (excluding store credit and gift cards)
  const cashbackAmount = (eligibleAmount * currentTier.cashbackPercent) / 100;

  if (cashbackAmount <= 0) {
    console.log('[OrderPaid] No cashback eligible amount after excluding store credit/gift cards');
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

  // Check if cashback already exists
  const existingEntry = await tx.storeCreditLedger.findFirst({
    where: {
      shop,
      shopifyOrderId: order.id.toString(),
      type: 'CASHBACK_EARNED',
    }
  });

  if (!existingEntry) {
    const now = new Date();
    const ledgerId = uuidv4();
    const currency = shopSettings?.storeCurrency || order.currency || 'USD';

    let actualBalance = customer.storeCredit;
    let isProcessed = false;
    let syncStatus = 'PENDING';

    // If auto-processing is enabled, issue store credit to Shopify immediately
    if (autoProcessingEnabled) {
      try {
        console.log(`[OrderPaid] Auto-processing enabled - issuing store credit to Shopify`);

        const { createStoreCreditService } = await import("~/services/shopify-store-credit.service");
        const storeCreditService = createStoreCreditService(admin, shop);

        const result = await storeCreditService.issueStoreCredit(
          customer.shopifyCustomerId,
          cashbackAmount,
          currency,
          `${currentTier.cashbackPercent}% cashback on order ${order.name}`
        );

        if (result.success) {
          actualBalance = result.balance || (customer.storeCredit + cashbackAmount);
          isProcessed = true;
          syncStatus = 'SYNCED';
          console.log(`[OrderPaid] Store credit issued successfully - new balance: ${actualBalance}`);

          // Update customer balance in database
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              storeCredit: actualBalance,
              updatedAt: now
            }
          });
        } else {
          console.error(`[OrderPaid] Failed to issue store credit: ${result.error}`);
          // Fall back to pending
          actualBalance = customer.storeCredit; // Don't update balance
          syncStatus = 'PENDING';
        }
      } catch (error) {
        console.error(`[OrderPaid] Error issuing store credit:`, error);
        // Fall back to pending
        actualBalance = customer.storeCredit; // Don't update balance
        syncStatus = 'PENDING';
      }
    } else {
      console.log(`[OrderPaid] Auto-processing disabled - creating pending cashback entry`);
      // Don't update customer balance - will be done manually
      actualBalance = customer.storeCredit;
    }

    // Create ledger entry in local database
    await tx.storeCreditLedger.create({
      data: {
        id: ledgerId,
        customerId: customer.id,
        shop,
        amount: cashbackAmount,
        balance: isProcessed ? actualBalance : (customer.storeCredit + cashbackAmount), // Future balance if not processed yet
        type: 'CASHBACK_EARNED',
        shopifyOrderId: order.id.toString(),
        orderId: orderRecord.id,
        metadata: {
          orderId: order.id,
          orderName: order.name,
          orderTotal: eligibleAmount,
          cashbackPercent: currentTier.cashbackPercent,
          tierName: currentTier.name,
          description: `${currentTier.cashbackPercent}% cashback on order ${order.name}`,
          paymentBreakdown: breakdown,
          syncStatus: syncStatus,
          autoProcessed: isProcessed
        },
        createdAt: now,
      }
    });

    console.log(`[OrderPaid] Created ${isProcessed ? 'processed' : 'pending'} cashback for ${cashbackAmount} ${currency}`);

    // Update Order record with cashback status
    await tx.order.update({
      where: { id: orderRecord.id },
      data: {
        cashbackProcessed: isProcessed,
        cashbackAmount: cashbackAmount,
        updatedAt: now
      }
    });

    // Track order and cashback events in Klaviyo (non-blocking)
    try {
      if (await isKlaviyoEnabled(shop)) {
        // Build customer object with tier
        const customerWithTier = {
          ...customer,
          currentTier,
        };

        // Track order placed event (uses trackOrderForKlaviyo from email-provider)
        await trackOrderForKlaviyo(shop, customerWithTier, {
          id: order.id.toString(),
          orderNumber: order.name,
          totalPrice: eligibleAmount,
          cashbackEarned: cashbackAmount,
          cashbackUsed: extractStoreCreditUsed(order),
          currency: currency,
          lineItems: order.line_items?.map((item: any) => ({
            productId: item.product_id?.toString(),
            sku: item.sku,
            title: item.title || item.name,
            quantity: item.quantity,
            price: parseFloat(item.price || '0'),
            imageUrl: item.image?.src,
          })),
        });

        // Track cashback earned event if cashback was issued
        if (cashbackAmount > 0) {
          await trackCashbackEarned(
            shop,
            customerWithTier,
            cashbackAmount,
            order.id.toString(),
            order.name
          );
        }

        console.log(`[OrderPaid] Klaviyo events tracked for order ${order.name}`);
      }
    } catch (klaviyoError) {
      // Log but don't fail the webhook
      console.error(`[OrderPaid] Failed to track Klaviyo events (non-fatal):`, klaviyoError);
    }
  } else {
    console.log(`[OrderPaid] Cashback already processed for order ${order.name}`);
  }
}

async function createOrderRecord(_dbOrTx: any, params: {
  shop: string;
  order: any;
}) {
  const { shop, order } = params;

  // Extract Shopify order ID (match the sync service pattern)
  const shopifyOrderId = order.id.toString();

  // Check if order already exists (using db directly, not tx)
  const existingOrder = await db.order.findFirst({
    where: {
      shop,
      shopifyOrderId
    }
  });

  if (existingOrder) {
    console.log(`[OrderPaid] Order ${order.name} already exists in database`);
    return null; // Return null to indicate already exists
  }
  
  // Find customer if exists (match sync service pattern - don't create here)
  let customer = null;
  let currentTier = null;
  if (order.customer?.id) {
    customer = await db.customer.findFirst({
      where: {
        shop,
        shopifyCustomerId: order.customer.id.toString()
      }
    });

    // Fetch tier separately
    if (customer?.currentTierId) {
      currentTier = await db.tier.findUnique({
        where: { id: customer.currentTierId }
      });
    }
  }

  // Calculate cashback based on current tier
  let cashbackPercent = 0;
  let cashbackAmount = 0;
  let tierIdAtOrder = null;
  let tierNameAtOrder = null;

  if (currentTier) {
    cashbackPercent = currentTier.cashbackPercent;
    tierIdAtOrder = currentTier.id;
    tierNameAtOrder = currentTier.name;
    
    // Calculate cashback on subtotal after discounts
    const subtotal = parseFloat(order.subtotal_price || '0');
    const discounts = parseFloat(order.total_discounts || '0');
    const netAmount = subtotal - discounts;
    cashbackAmount = (netAmount * cashbackPercent) / 100;
  }
  
  // Create Order record (match sync service pattern - simple direct insert)
  const orderId = uuidv4();
  const now = new Date();

  // Use the same pattern as the working sync service
  // IMPORTANT: REST API total_price is in SHOP CURRENCY, not presentment currency
  // So we must store the shop currency code to match the amount
  // See: docs/multi-currency-order-handling.md for full analysis
  const shopCurrencyCode = order.total_price_set?.shop_money?.currency_code;
  const presentmentCurrencyCode = order.currency;
  const orderCurrency = shopCurrencyCode || presentmentCurrencyCode || 'USD';

  // Multi-currency tracking
  const shopAmount = parseFloat(order.total_price_set?.shop_money?.amount || order.total_price || '0');
  const presentmentAmount = parseFloat(order.total_price_set?.presentment_money?.amount || order.total_price || '0');
  const isMultiCurrency = shopCurrencyCode && shopCurrencyCode !== presentmentCurrencyCode;

  // Calculate exchange rate: presentment / shop (e.g., €100 / £86.21 = 1.16)
  const exchangeRate = isMultiCurrency && shopAmount > 0
    ? presentmentAmount / shopAmount
    : null;

  if (isMultiCurrency) {
    console.log(`[OrderPaid] Multi-currency order detected:`);
    console.log(`  - Customer paid in: ${presentmentCurrencyCode} (${presentmentAmount})`);
    console.log(`  - Shop receives: ${shopCurrencyCode} (${shopAmount})`);
    console.log(`  - Exchange rate: ${exchangeRate?.toFixed(6)}`);
    console.log(`  - Storing as: ${orderCurrency}`);
  }

  const newOrder = await db.order.create({
    data: {
      id: orderId,
      shop,
      shopifyOrderId,
      shopifyOrderNumber: order.order_number?.toString() || order.number?.toString() || '',
      shopifyOrderName: order.name || '',
      customerId: customer?.id || "unknown", // Match sync service - use "unknown" for guest orders
      email: order.email || order.customer?.email || '',
      currency: orderCurrency, // Use shop currency to match total_price amount
      // Multi-currency tracking fields
      presentmentCurrency: isMultiCurrency ? presentmentCurrencyCode : null,
      presentmentTotal: isMultiCurrency ? presentmentAmount : null,
      exchangeRate: exchangeRate,
      subtotalPrice: parseFloat(order.subtotal_price || '0'),
      totalDiscounts: parseFloat(order.total_discounts || '0'),
      totalShipping: parseFloat(order.total_shipping_price || order.shipping_lines?.reduce((sum: number, line: any) => sum + parseFloat(line.price || '0'), 0) || '0'),
      totalTax: parseFloat(order.total_tax || '0'),
      totalPrice: parseFloat(order.total_price || '0'),
      totalRefunded: 0,
      netAmount: parseFloat(order.total_price || '0'),
      financialStatus: 'PAID',
      fulfillmentStatus: order.fulfillment_status || null,
      cashbackEligible: true,
      cashbackPercent,
      cashbackAmount,
      cashbackProcessed: false, // Will be true when manually processed
      tierIdAtOrder,
      tierNameAtOrder,
      shopifyCreatedAt: new Date(order.created_at),
      shopifyUpdatedAt: new Date(order.updated_at || order.created_at),
      processedAt: order.processed_at ? new Date(order.processed_at) : now,
      createdAt: now,
      updatedAt: now
    }
  });
  
  console.log(`[OrderPaid] Created Order record ${orderId} for Shopify order ${order.name}`);

  // Process line items separately (like sync service does)
  if (order.line_items && order.line_items.length > 0) {
    for (const item of order.line_items) {
      try {
        await db.orderLineItem.create({
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
            isTierProduct: false,
            tierProductId: null,
            createdAt: now
          }
        });
      } catch (e) {
        console.error(`[OrderPaid] Failed to create line item ${item.id}:`, e);
      }
    }
  }

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
  
  // Calculate totals from Order records (use db directly)
  const orderStats = await db.order.aggregate({
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
  
  // Update customer spending totals (use db directly)
  await db.customer.update({
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

async function checkTierProgression(_dbOrTx: any, params: {
  shop: string;
  customerId: string;
  admin: any;  // Not used with local DB calculation, but kept for compatibility
  orderId?: string;
}) {
  const { shop, customerId, orderId } = params;

  if (!customerId) {
    return;
  }

  try {
    // Use TIER RESOLUTION SYSTEM to handle all tier sources
    // This checks: manual override, tier subscription, tier purchase, AND spending-based
    console.log(`[OrderPaid] Resolving effective tier for customer ${customerId} after order ${orderId || 'unknown'}`);

    const result = await updateCustomerToEffectiveTier(shop, customerId, {
      triggeredBy: 'ORDER_PAID',
      orderId: orderId
    });

    console.log(`[OrderPaid] Tier resolution result:`, {
      customerId,
      changed: result.changed,
      source: result.source,
      previousTier: result.previousTierId,
      newTier: result.newTierId,
      orderId: orderId
    });

    if (result.error) {
      console.error(`[OrderPaid] Tier resolution returned error: ${result.error}`);
    }

    if (result.changed) {
      console.log(`[OrderPaid] ✅ Tier changed for customer ${customerId} via ${result.source}`);

      // Send tier upgrade email (non-blocking)
      try {
        // Get customer details
        const customer = await db.customer.findUnique({
          where: { id: customerId },
        });

        // Get new tier details
        const newTier = result.newTierId
          ? await db.tier.findUnique({ where: { id: result.newTierId } })
          : null;

        // Get previous tier details (if any)
        const previousTier = result.previousTierId
          ? await db.tier.findUnique({ where: { id: result.previousTierId } })
          : null;

        if (customer && newTier) {
          // Only send if it's an upgrade (new tier has higher minSpend or first tier)
          const isUpgrade = !previousTier || (newTier.minSpend > previousTier.minSpend);

          if (isUpgrade) {
            console.log(`[OrderPaid] Sending tier upgrade email to customer ${customer.id}`);
            await sendTierUpgradeEmailNotification(
              shop,
              {
                id: customer.id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                shop: shop,
              },
              previousTier ? {
                id: previousTier.id,
                name: previousTier.name,
                cashbackPercent: previousTier.cashbackPercent,
              } : null,
              {
                id: newTier.id,
                name: newTier.name,
                cashbackPercent: newTier.cashbackPercent,
              }
            );

            // Track tier upgrade in Klaviyo (non-blocking)
            try {
              if (await isKlaviyoEnabled(shop)) {
                // Get all tiers for progress tracking
                const allTiers = await db.tier.findMany({
                  where: { shop },
                  orderBy: { minSpend: 'asc' },
                });

                // Sync profile first to update tier info
                await syncCustomerToKlaviyo(
                  shop,
                  { ...customer, currentTier: newTier },
                  allTiers
                );

                // Track tier upgrade event
                await trackTierUpgraded(
                  shop,
                  customer,
                  previousTier,
                  newTier,
                  orderId,
                  allTiers
                );

                console.log(`[OrderPaid] Klaviyo tier upgrade event tracked for customer ${customer.id}`);
              }
            } catch (klaviyoError) {
              console.error(`[OrderPaid] Failed to track Klaviyo tier upgrade (non-fatal):`, klaviyoError);
            }
          } else {
            console.log(`[OrderPaid] Tier change is not an upgrade, skipping email`);
          }
        }
      } catch (emailError) {
        // Log but don't fail the webhook
        console.error(`[OrderPaid] Failed to send tier upgrade email (non-fatal):`, emailError);
      }
    } else {
      console.log(`[OrderPaid] No tier change for customer ${customerId}, effective tier source: ${result.source}`);
    }

    // Note: Using tier resolution system instead of direct calculation
    // This ensures manual overrides, tier subscriptions, and tier purchases are respected
    // The resolution system automatically handles priority: Manual > Subscription > Purchase > Spending

  } catch (error) {
    console.error(`[OrderPaid] ❌ Error resolving tier for customer ${customerId}:`, error);
    console.error(`[OrderPaid] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    // Don't throw - we don't want tier resolution errors to fail the webhook
  }
}
