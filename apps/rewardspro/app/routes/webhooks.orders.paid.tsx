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
import { withRetry } from "../utils/retry";
import { validatePrice } from "../utils/price-validation";
import { createTransactionAnalyzer } from "../utils/transaction-analyzer";
// Removed: calculateCustomerTierFromDB - now using tier resolution system
// Removed: createStoreCreditService - no longer auto-issuing store credit
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
  let admin: any;

  try {
    // Use Shopify's built-in webhook authentication which handles HMAC verification
    const webhookData = await authenticate.webhook(request);
    shop = webhookData.shop;
    topic = webhookData.topic;
    order = webhookData.payload;
    admin = webhookData.admin; // Get admin API access for GraphQL

    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  ORDERS/PAID WEBHOOK RECEIVED                                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log(`[OrderPaid] Webhook Details:`);
    console.log(`  - Order ID: ${order.id}`);
    console.log(`  - Order Name: ${order.name}`);
    console.log(`  - Shop: ${shop}`);
    console.log(`  - Topic: ${topic}`);
    console.log(`  - Webhook ID: ${request.headers.get('X-Shopify-Webhook-Id') || 'N/A'}`);
    console.log(`  - Order Updated At: ${order.updated_at}`);
    console.log(`  - Customer: ${order.customer?.email || 'Guest'}`);
    console.log(`  - Total: ${order.total_price} ${order.currency}`);
    console.log('─────────────────────────────────────────────────────────────────────\n');

    // Generate idempotency key
    const idempotencyKey = `order-${order.id}-${order.updated_at}`;

    // Check if already processed using webhook ID
    const webhookId = request.headers.get('X-Shopify-Webhook-Id') || idempotencyKey;
    try {
      const existingProcess = await db.webhookProcessed.findUnique({
        where: { webhookId }
      });

      if (existingProcess) {
        console.log(`[OrderPaid] Already processed order ${order.id}`);
        return json({ success: true, message: "Already processed" });
      }
    } catch (e) {
      // webhookProcessed table might not exist, continue processing
      console.log(`[OrderPaid] Could not check idempotency (table may not exist)`);
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
        console.log(`[OrderPaid] Customer: ${order.customer?.email || 'Guest'}`);
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

            // Check if it's a tier product
            const tierProduct = await db.tierProduct.findFirst({
              where: {
                shop: shop!,
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

        // Show all tier products in database for comparison
        console.log('\n[OrderPaid] DATABASE TIER PRODUCTS FOR THIS SHOP:');
        console.log('----------------------------------------');
        const allTierProducts = await db.tierProduct.findMany({
          where: { shop: shop! },
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

  console.log('========================================');
  console.log('[TIER PRODUCT RECOGNITION] Processing Line Item');
  console.log('========================================');
  console.log('[TIER PRODUCT RECOGNITION] Line Item Details:');
  console.log(`  - Line Item ID: ${lineItem.id}`);
  console.log(`  - Product ID: ${lineItem.product_id}`);
  console.log(`  - Variant ID: ${lineItem.variant_id}`);
  console.log(`  - SKU: ${lineItem.sku || 'N/A'}`);
  console.log(`  - Name: ${lineItem.name}`);
  console.log(`  - Price: ${lineItem.price} ${order.currency}`);
  console.log(`  - Quantity: ${lineItem.quantity}`);

  // Check if this is a subscription purchase
  const sellingPlanAllocation = lineItem.selling_plan_allocation;
  const isSubscription = !!sellingPlanAllocation;

  console.log(`[TIER PRODUCT RECOGNITION] Is Subscription: ${isSubscription}`);

  if (isSubscription) {
    console.log('[TIER PRODUCT RECOGNITION] ✅ Identified as SUBSCRIPTION - routing to subscription handler');
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
  console.log('[TIER PRODUCT RECOGNITION] Checking for tier product match...');
  console.log('[TIER PRODUCT RECOGNITION] Query criteria:');
  console.log(`  - Shop: ${shop}`);
  console.log(`  - Matching by Product ID: ${lineItem.product_id?.toString()}`);
  console.log(`  - Matching by Variant ID: ${lineItem.variant_id?.toString()}`);
  console.log(`  - Matching by SKU: ${lineItem.sku}`);
  console.log(`  - Purchase Type: ONE_TIME or BOTH`);

  // DEBUG: Show all tier products in database for this shop
  const allTierProducts = await tx.tierProduct.findMany({
    where: { shop },
    select: {
      id: true,
      shopifyProductId: true,
      shopifyVariantId: true,
      sku: true,
      purchaseType: true,
      duration: true,
      oneTimePrice: true
    }
  });
  console.log(`[TIER PRODUCT RECOGNITION] DEBUG: Found ${allTierProducts.length} tier products in database:`);
  allTierProducts.forEach((tp, idx) => {
    console.log(`[TIER PRODUCT RECOGNITION]   ${idx + 1}. Product ID: ${tp.shopifyProductId}, Variant ID: ${tp.shopifyVariantId}, SKU: ${tp.sku}, Type: ${tp.purchaseType}`);
  });

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
    console.log('[TIER PRODUCT RECOGNITION] ✅ TIER PRODUCT MATCH FOUND!');
    console.log('[TIER PRODUCT RECOGNITION] Matched TierProduct:');
    console.log(`  - ID: ${tierProduct.id}`);
    console.log(`  - Tier ID: ${tierProduct.tierId}`);
    console.log(`  - Shopify Product ID: ${tierProduct.shopifyProductId}`);
    console.log(`  - Shopify Variant ID: ${tierProduct.shopifyVariantId}`);
    console.log(`  - SKU: ${tierProduct.sku}`);
    console.log(`  - Purchase Type: ${tierProduct.purchaseType}`);
    console.log(`  - Duration: ${tierProduct.duration}`);
    console.log(`  - Price: ${tierProduct.price || tierProduct.oneTimePrice}`);
    console.log('[TIER PRODUCT RECOGNITION] → Proceeding to create TierPurchase record');

    return await processOneTimeTierPurchase(tx, {
      shop,
      order,
      lineItem,
      tierProduct,
    });
  }

  console.log('[TIER PRODUCT RECOGNITION] ❌ No tier product match found');
  console.log('[TIER PRODUCT RECOGNITION] → Processing as regular line item');
  console.log('========================================');

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
  console.log(`  - Email: ${order.customer?.email || order.email}`);

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

  console.log(`[TIER PURCHASE CREATION] ✅ Customer: ${customer.id} (${customer.email})`);

  // Calculate tier duration
  console.log('[TIER PURCHASE CREATION] Step 3: Calculate Tier Duration');
  const now = new Date();
  let tierEndDate: Date | null = null;

  console.log(`  - Duration Type: ${tierProduct.duration}`);
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
  console.log('[TIER PURCHASE CREATION] Step 4: Creating TierPurchase Record');
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

  // Check if automatic cashback processing is enabled
  const shopSettings = await tx.shopSettings.findUnique({
    where: { shop },
    select: { autoCashbackProcessingEnabled: true }
  });

  if (!shopSettings?.autoCashbackProcessingEnabled) {
    console.log('[OrderPaid] Automatic cashback processing is disabled for this shop - skipping cashback');
    return;
  }

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

    // Create ledger entry in local database
    const newBalance = customer.storeCredit + cashbackAmount;

    await tx.storeCreditLedger.create({
      data: {
        id: ledgerId,
        customerId: customer.id,
        shop,
        amount: cashbackAmount,
        balance: newBalance,
        type: 'CASHBACK_EARNED',
        shopifyOrderId: order.id.toString(),
        orderId: orderRecord.id,
        // Removed syncStatus field - doesn't exist in production schema
        metadata: {
          orderId: order.id,
          orderName: order.name,
          orderTotal: eligibleAmount,
          cashbackPercent: currentTier.cashbackPercent,
          tierName: currentTier.name,
          description: `${currentTier.cashbackPercent}% cashback on order ${order.name}`,
          paymentBreakdown: breakdown,
          syncStatus: 'PENDING' // Store in metadata instead
        },
        createdAt: now,
      }
    });

    // Note: We're NOT updating the customer balance automatically anymore
    // The balance will be updated when the merchant manually processes the cashback

    console.log(`[OrderPaid] Created pending cashback for ${cashbackAmount} ${order.currency}`);

    // Update Order record with pending cashback amount (but NOT marked as processed)
    await tx.order.update({
      where: { id: orderRecord.id },
      data: {
        cashbackProcessed: false, // Keep as false - will be true when manually processed
        cashbackAmount: cashbackAmount, // Store the calculated cashback amount
        updatedAt: new Date()
      }
    });
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
  const newOrder = await db.order.create({
    data: {
      id: orderId,
      shop,
      shopifyOrderId,
      shopifyOrderNumber: order.order_number?.toString() || order.number?.toString() || '',
      shopifyOrderName: order.name || '',
      customerId: customer?.id || "unknown", // Match sync service - use "unknown" for guest orders
      email: order.email || order.customer?.email || '',
      currency: order.currency || 'USD',
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
