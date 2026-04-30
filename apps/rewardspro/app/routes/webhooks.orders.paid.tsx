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
import { sendTierUpgradeEmailNotification, sendTierDowngradeEmailNotification } from "../services/email-notifications.server";
import { processAutomationTrigger } from "../services/automation-trigger.server";
import { withRetry } from "../utils/retry";
import { createTransactionAnalyzer } from "../utils/transaction-analyzer";
import {
  TierProductMatcher,
  TierProductPurchaseService,
  tierPurchaseExists,
} from "../services/tier-products";
import { trackOrderForKlaviyo } from "../services/email-provider.server";
import { isKlaviyoEnabled } from "../services/klaviyo.server";
import {
  syncCustomerToKlaviyo,
  trackTierUpgraded,
  trackCashbackEarned,
} from "../services/klaviyo-events.server";
import { createLogger } from "../services/logger.server";
import { SentryService } from "../services/monitoring/sentry.service";
import { logWebhookEntitlementContext } from "../services/webhook-entitlement-monitor.server";
// Removed: calculateCustomerTierFromDB - now using tier resolution system
// Removed: createStoreCreditService - no longer auto-issuing store credit
import * as crypto from 'crypto';

// Create scoped logger for this webhook
const webhookLogger = createLogger('OrderPaid');

const uuidv4 = () => crypto.randomUUID();

// HMAC Verification
function _verifyWebhookHMAC(request: Request, rawBody: string): boolean {
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

  // Start Sentry transaction for webhook tracing
  const webhookId = request.headers.get('X-Shopify-Webhook-Id') || 'unknown';
  const sentryWebhook = SentryService.startWebhookTransaction({
    topic: 'orders/paid',
    shop: 'pending',
    webhookId,
  });
  const startTime = Date.now();

  try {
    // Use Shopify's built-in webhook authentication which handles HMAC verification
    const webhookData = await authenticate.webhook(request);
    shop = webhookData.shop;
    topic = webhookData.topic;
    order = webhookData.payload;
    admin = webhookData.admin; // Get admin API access for GraphQL

    // Set Sentry context now that we have shop info
    SentryService.setShopContext({ domain: shop });
    SentryService.setOperationContext({
      type: 'webhook',
      name: 'orders/paid',
      correlationId: webhookId,
    });

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

    // Log entitlement context for monitoring (P4: Webhook bypass visibility)
    const webhookIdForMonitor = request.headers.get('X-Shopify-Webhook-Id') || `order-${order.id}`;
    await logWebhookEntitlementContext(shop, 'orders/paid', webhookIdForMonitor);

    // Generate idempotency key
    const idempotencyKey = `order-${order.id}-${order.updated_at}`;

    // Use the already-declared webhookId, falling back to idempotencyKey if 'unknown'
    const idempotencyWebhookId = webhookId !== 'unknown' ? webhookId : idempotencyKey;

    // Atomic idempotency check: try to INSERT first (acts as lock)
    // If unique constraint fails, another instance already claimed this webhook
    try {
      await db.webhookProcessed.create({
        data: {
          id: uuidv4(),
          shop: shop!,
          topic: topic || 'orders/paid',
          webhookId: idempotencyWebhookId,
          processedAt: new Date(),
        }
      });
    } catch (e: any) {
      if (e.code === 'P2002' || e.message?.includes('unique') || e.message?.includes('Unique')) {
        logger.info('Order already processed (atomic check), skipping');
        return json({ success: true, message: "Already processed" });
      }
      // Table might not exist or other error - continue processing
      logger.debug('Idempotency atomic insert skipped', { error: e.message });
    }

    // Process with retry logic - OPTIMIZED VERSION
    // Break up the large transaction to avoid timeouts
    const result = await withRetry(
      async () => {
        // NOTE: Webhook idempotency record is created AFTER processing succeeds
        // This prevents partial failures from blocking Shopify retries

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
            if ((itemResult as any)?.needsResolution && (itemResult as any)?.customerId) {
              tierPurchaseMade = true;
              tierPurchaseCustomerId = (itemResult as any).customerId;
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

            const tierPurchaseResults = results.filter(r => (r as any)?.type === 'one_time_tier' && (r as any)?.needsResolution);
            console.log(`[TIER RESOLUTION] Number of tier purchases to resolve: ${tierPurchaseResults.length}`);

            for (const purchaseResult of tierPurchaseResults) {
              const pr = purchaseResult as any;
              console.log('[TIER RESOLUTION] Processing purchase:');
              console.log(`  - Customer ID: ${pr.customerId}`);
              console.log(`  - Tier ID: ${pr.tierId}`);
              console.log(`  - Purchase ID: ${pr.tierPurchaseId}`);
              console.log(`  - Order ID: ${order.id}`);
              console.log('[TIER RESOLUTION] → Calling updateCustomerToEffectiveTier()...');

              const resolutionResult = await updateCustomerToEffectiveTier(
                shop!,
                pr.customerId,
                {
                  triggeredBy: 'TIER_PURCHASE',
                  orderId: order.id?.toString(),
                  purchaseId: pr.tierPurchaseId
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

        // Step 4: Process cashback, points earning, and update customer (separate operations)
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

          // Step 4.6: Process challenge progress (Challenges Engagement System)
          if (order.customer?.id) {
            try {
              const { processOrderForChallenges } = await import("~/services/challenge-progress.server");
              const dbCustomerForChallenge = await db.customer.findFirst({
                where: {
                  shop: shop!,
                  shopifyCustomerId: order.customer.id.toString()
                },
                select: { id: true }
              });

              if (dbCustomerForChallenge) {
                // Calculate order amount for challenge progress
                const orderAmount = parseFloat(order.subtotal_price || order.total_price || '0');
                const orderData = {
                  orderId: order.id.toString(),
                  orderNumber: order.name,
                  totalAmount: orderAmount,
                  customerId: dbCustomerForChallenge.id,
                  lineItems: (order.line_items || []).map((item: any) => ({
                    productId: item.product_id?.toString(),
                    variantId: item.variant_id?.toString(),
                    quantity: item.quantity,
                    price: parseFloat(item.price || '0'),
                  })),
                };

                const challengeResults = await processOrderForChallenges(
                  shop!,
                  dbCustomerForChallenge.id,
                  orderData
                );

                if (challengeResults.length > 0) {
                  console.log(`[OrderPaid] Challenge progress updated for ${challengeResults.length} challenge(s):`,
                    challengeResults.map(r => ({
                      challengeId: r.challengeId,
                      newProgress: r.newProgress,
                      isCompleted: r.isCompleted,
                    }))
                  );
                }
              }
            } catch (challengeError) {
              // Non-fatal - log but don't fail the webhook
              console.error(`[OrderPaid] Challenge progress processing failed (non-fatal):`, challengeError);
            }
          }

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
              // Skip tier resolution if Step 3.5 already resolved this customer's tier
              const skipTierResolution = tierPurchaseMade && tierPurchaseCustomerId === dbCustomer.id;
              if (skipTierResolution) {
                console.log(`[OrderPaid] Skipping tier progression - already resolved in Step 3.5 for customer ${dbCustomer.id}`);
              } else {
                console.log(`[OrderPaid] Found customer ${dbCustomer.id}, checking tier progression...`);
                await checkTierProgression(db, {
                  shop: shop!,
                  customerId: dbCustomer.id,
                  admin: admin,
                  orderId: order.id?.toString()
                });
              }

              // =========================================================================
              // GIFT CARD MEMBERSHIP ACTIVATION
              // Check if order used gift card payment and activate any bundled memberships
              // =========================================================================
              try {
                const { GiftCardRedemptionHandler } = await import('../services/gift-card');
                const redemptionResult = await GiftCardRedemptionHandler.checkAndProcessRedemption(
                  shop!,
                  order.id.toString(),
                  dbCustomer.id,
                  {
                    hasGiftCardPayment: false,
                    paymentGateways: order.payment_gateway_names || [],
                  }
                );

                if (redemptionResult.membershipActivated) {
                  console.log(`[OrderPaid] Gift card membership activated for customer ${dbCustomer.id}:`, {
                    tierName: redemptionResult.tierName,
                    giftCardId: redemptionResult.giftCardId,
                  });
                } else if (redemptionResult.detected) {
                  console.log(`[OrderPaid] Gift card payment detected but no membership to activate`);
                }
              } catch (giftCardError) {
                // Non-fatal - log but don't fail the webhook
                console.error(`[OrderPaid] Gift card redemption check failed (non-fatal):`, giftCardError);
              }
            } else {
              console.log(`[OrderPaid] Customer not found in database for Shopify ID: ${order.customer.id}`);

              // Use upsert to handle race condition with customers/create webhook.
              // If the customer was just created by another webhook, we'll find and use them.
              const shopifyCustomerId = order.customer.id.toString();
              const newCustomer = await db.customer.upsert({
                where: {
                  shop_shopifyCustomerId: {
                    shop: shop!,
                    shopifyCustomerId,
                  }
                },
                create: {
                  id: crypto.randomUUID(),
                  shop: shop!,
                  shopifyCustomerId,
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
                },
                update: {
                  // If already created by customers/create webhook, just touch updatedAt
                  updatedAt: new Date(),
                }
              });
              console.log(`[OrderPaid] Customer upserted: ${newCustomer.id} (shopify: ${shopifyCustomerId})`);

              // Link the order we just created (which has customerId: "unknown") to the actual customer.
              // Without this, tier calculation queries orders by customerId and finds nothing.
              const shopifyOrderId = order.id.toString();
              const linkedOrder = await db.order.updateMany({
                where: {
                  shop: shop!,
                  shopifyOrderId,
                  customerId: "unknown",
                },
                data: {
                  customerId: newCustomer.id,
                }
              });
              if (linkedOrder.count > 0) {
                console.log(`[OrderPaid] Linked order ${shopifyOrderId} to customer ${newCustomer.id}`);
              }

              // Update spending from orders now that the order is linked to the customer.
              // This was skipped earlier because the customer didn't exist yet.
              await updateCustomerSpendingFromOrders(db, {
                shop: shop!,
                order,
              });

              // Check tier progression with actual spending data
              await checkTierProgression(db, {
                shop: shop!,
                customerId: newCustomer.id,
                admin: admin,
                orderId: order.id?.toString()
              });

              // Retry cashback — it was skipped earlier because the customer didn't exist.
              // Now the customer has a tier assigned, so cashback can be calculated.
              try {
                await processCashback(db, {
                  shop: shop!,
                  order,
                  admin,
                });
              } catch (cashbackError) {
                console.error(`[OrderPaid] Cashback for new customer failed (non-fatal):`, cashbackError);
              }
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

    // Webhook was already recorded at the start (atomic insert) for idempotency
    logger.debug('Webhook processing completed successfully');

    // Track successful webhook processing in Sentry
    const durationMs = Date.now() - startTime;
    SentryService.events.webhookProcessed({
      shop: shop!,
      topic: 'orders/paid',
      success: true,
      durationMs,
      orderId: order.id?.toString(),
    });
    sentryWebhook.finish('ok');

    // Fire "purchase" automation trigger (non-blocking)
    try {
      const customerEmail = order.customer?.email || order.email;
      if (customerEmail) {
        await processAutomationTrigger({
          type: "purchase",
          shop: shop!,
          customer: {
            email: customerEmail,
            firstName: order.customer?.first_name || null,
            lastName: order.customer?.last_name || null,
            customerId: order.customer?.id?.toString(),
          },
          data: {
            orderId: order.id?.toString(),
            orderTotal: parseFloat(order.total_price || "0"),
          },
        });
      }
    } catch (autoError) {
      console.error(`[OrderPaid] Purchase automation trigger failed (non-fatal):`, autoError);
    }

    webhookLogger.info('Order processed successfully', { orderId: order.id, shop });
    return json({ success: true, data: result });

  } catch (error) {
    // If the error is a Response (from authenticate.webhook), return it directly
    // This handles auth failures (401), bad requests (400), etc.
    if (error instanceof Response) {
      return error;
    }

    const errorLogger = webhookLogger.withContext({ shop, orderId: order?.id || 'unknown' });
    errorLogger.error('Order processing failed', error);

    // Track failed webhook in Sentry with business impact
    const durationMs = Date.now() - startTime;
    SentryService.captureException(error, {
      shop: shop ? { domain: shop } : undefined,
      operation: {
        type: 'webhook',
        name: 'orders/paid',
        correlationId: webhookId,
      },
      businessImpact: {
        orderValue: parseFloat(order?.total_price || '0'),
        affectedCustomers: 1,
      },
      tags: {
        'webhook.topic': 'orders/paid',
        'order.id': order?.id?.toString() || 'unknown',
      },
    });
    SentryService.events.webhookProcessed({
      shop: shop || 'unknown',
      topic: 'orders/paid',
      success: false,
      durationMs,
      orderId: order?.id?.toString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sentryWebhook.finish('error');

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

async function processLineItem(_tx: any, params: {
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

  // Log raw line item data for debugging
  console.log('[TPR] Line Item:', {
    id: lineItem.id,
    product_id: lineItem.product_id,
    variant_id: lineItem.variant_id,
    sku: lineItem.sku,
    title: lineItem.title || lineItem.name,
    price: lineItem.price,
    quantity: lineItem.quantity,
    has_selling_plan: !!lineItem.selling_plan_allocation,
  });

  // ============================================
  // SUBSCRIPTION CHECK (handled by matcher, but route separately)
  // ============================================
  if (lineItem.selling_plan_allocation) {
    console.log('[TPR] ✅ SUBSCRIPTION DETECTED - Routing to TierSubscriptionBridgeV2');
    const contractId = lineItem.selling_plan_allocation.selling_plan_id;

    return await TierSubscriptionBridgeV2.handleTierSubscriptionPurchase({
      shop,
      admin,
      customerId: order.customer?.id?.toString() || '',
      customerShopifyId: order.customer?.id?.toString() || '',
      lineItem,
      orderId: order.id.toString(),
      sellingPlanId: lineItem.selling_plan_allocation.selling_plan_id,
      contractId,
    });
  }

  console.log('[TPR] ℹ️  Not a subscription - checking for one-time tier product...');

  // ============================================
  // USE TIER PRODUCT MATCHER SERVICE
  // ============================================
  const matchStartTime = Date.now();

  const matchResult = await TierProductMatcher.matchLineItem(shop, lineItem, {
    includeDiagnostics: true,
  });

  const matchDuration = Date.now() - matchStartTime;

  console.log(`[TPR] TierProductMatcher completed in ${matchDuration}ms`);
  console.log('[TPR] Match result:', {
    matched: matchResult.matched,
    matchedBy: matchResult.matchedBy,
    isSubscription: matchResult.isSubscription,
    tierProductId: matchResult.tierProduct?.id,
    tierName: matchResult.tierProduct?.tier?.name,
    diagnostics: matchResult.diagnostics,
  });

  // ============================================
  // HANDLE MATCH RESULT
  // ============================================
  if (matchResult.matched && matchResult.tierProduct) {
    const tierProduct = matchResult.tierProduct;

    console.log('[TPR] ╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('[TPR] ║  ✅ TIER PRODUCT MATCH CONFIRMED!                                     ║');
    console.log('[TPR] ╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('[TPR] Matched TierProduct:', {
      id: tierProduct.id,
      tierId: tierProduct.tierId,
      tierName: tierProduct.tier?.name,
      duration: tierProduct.duration,
      matchedBy: matchResult.matchedBy.join(', '),
    });
    console.log('[TPR] Match Details:', matchResult.matchDetails);

    console.log('[TPR] → Proceeding to create TierPurchase record...');
    console.log('══════════════════════════════════════════════════════════════════════════════\n');

    return await processOneTimeTierPurchase(shop, order, lineItem, tierProduct);
  }

  // No match found
  console.log('[TPR] ╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('[TPR] ║  ❌ NO TIER PRODUCT MATCH FOUND                                        ║');
  console.log('[TPR] ╚═══════════════════════════════════════════════════════════════════════╝');

  if (matchResult.diagnostics) {
    console.log('[TPR] Diagnostics:', {
      tierProductsChecked: matchResult.diagnostics.tierProductsChecked,
      eligibleProducts: matchResult.diagnostics.eligibleProducts,
      nearMisses: matchResult.diagnostics.nearMisses,
    });
  }

  console.log('[TPR] → Processing as regular line item (not a tier product)');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  return { type: 'regular', processed: false };
}

async function processOneTimeTierPurchase(
  shop: string,
  order: any,
  lineItem: any,
  tierProduct: any
) {
  console.log('========================================');
  console.log('[TIER PURCHASE CREATION] Starting Tier Purchase Creation');
  console.log('========================================');

  // Check idempotency - prevent duplicate purchases on webhook retries
  const alreadyExists = await tierPurchaseExists(
    shop,
    order.id.toString(),
    lineItem.id.toString()
  );

  if (alreadyExists) {
    console.log('[TIER PURCHASE CREATION] ⚠️ Tier purchase already exists for this line item (idempotency check)');
    return {
      type: 'one_time_tier',
      processed: false,
      error: 'ALREADY_EXISTS',
      message: 'Tier purchase already exists - skipping duplicate',
      orderId: order.id.toString(),
      lineItemId: lineItem.id.toString(),
    };
  }

  // Use the TierProductPurchaseService for all purchase logic
  const result = await TierProductPurchaseService.createPurchase(
    shop,
    order,
    lineItem,
    tierProduct
  );

  if (result.success) {
    console.log('[TIER PURCHASE CREATION] ✅ TierPurchase created successfully!');
    console.log('[TIER PURCHASE CREATION] Result:', {
      purchaseId: result.tierPurchase?.id,
      customerId: result.customerId,
      tierId: result.tierId,
      endDate: result.endDate?.toISOString() || 'LIFETIME',
    });
    console.log('[TIER PURCHASE CREATION] → Tier resolution will be triggered next');
    console.log('========================================');

    return {
      type: 'one_time_tier',
      processed: true,
      tierId: result.tierId,
      tierPurchaseId: result.tierPurchase?.id,
      customerId: result.customerId,
      endDate: result.endDate,
      needsResolution: result.needsResolution,
    };
  }

  // Handle failure cases
  console.error('[TIER PURCHASE CREATION] ❌ Failed:', result.error);
  console.error('[TIER PURCHASE CREATION] Error Code:', result.errorCode);

  return {
    type: 'one_time_tier',
    processed: false,
    error: result.errorCode,
    message: result.error,
    orderId: order.id.toString(),
    lineItemId: lineItem.id.toString(),
    requiresRefund: result.requiresRefund,
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

  // =========================================================================
  // NEUROSURGICAL FIX: Exclude gift card PRODUCTS and tier PRODUCTS from cashback
  // Transaction analyzer handles payment methods, but we also need to exclude
  // certain PRODUCT types from earning cashback:
  // 1. Gift card products - prevents abuse loop (buy gift card, use, earn cashback, repeat)
  // 2. Tier products - membership purchases shouldn't earn cashback on themselves
  // =========================================================================
  let excludedProductAmount = 0;

  // Calculate gift card product value from line items
  if (order.line_items && Array.isArray(order.line_items)) {
    for (const item of order.line_items) {
      // Exclude gift card products
      if (item.gift_card === true) {
        const itemTotal = parseFloat(item.price || '0') * (item.quantity || 1);
        excludedProductAmount += itemTotal;
        console.log(`[OrderPaid] Excluding gift card product from cashback: ${item.title} (${itemTotal})`);
      }
    }
  }

  // Get the Order record for tier product lookup
  // NOTE: Must use orderId directly instead of relation filter for Data API compatibility
  const orderRecord = await tx.order.findFirst({
    where: {
      shop,
      shopifyOrderId: order.id.toString()
    }
  });

  // Check for tier product purchases in this order
  // Using orderId instead of relation filter (order: {...}) for Data API compatibility
  const orderLineItems = orderRecord
    ? await tx.orderLineItem.findMany({
        where: {
          orderId: orderRecord.id,
          isTierProduct: true
        },
        select: {
          totalPrice: true,
          title: true
        }
      })
    : [];

  for (const tierItem of orderLineItems) {
    const itemTotal = Number(tierItem.totalPrice);
    excludedProductAmount += itemTotal;
    console.log(`[OrderPaid] Excluding tier product from cashback: ${tierItem.title} (${itemTotal})`);
  }

  // Adjust eligible amount by excluding ineligible products
  const adjustedEligibleAmount = Math.max(0, eligibleAmount - excludedProductAmount);

  if (excludedProductAmount > 0) {
    console.log(`[OrderPaid] Product exclusions applied:`, {
      originalEligible: eligibleAmount,
      excludedProducts: excludedProductAmount,
      adjustedEligible: adjustedEligibleAmount
    });
  }

  // Calculate cashback only on adjusted eligible amount
  const cashbackAmount = (adjustedEligibleAmount * currentTier.cashbackPercent) / 100;

  if (cashbackAmount <= 0) {
    console.log('[OrderPaid] No cashback eligible amount after exclusions (store credit, gift cards, tier products)');
    return;
  }

  // Verify Order record exists (was fetched earlier for tier product lookup)
  if (!orderRecord) {
    console.error('[OrderPaid] Order record not found after creation');
    return;
  }

  // Check if cashback already exists (idempotency guard)
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

    // =========================================================================
    // TRANSACTIONAL SAFETY FIX: Create ledger entry FIRST as idempotency lock
    // This prevents double-crediting if Shopify succeeds but subsequent ops fail
    // 1. Create ledger with PENDING status (acts as lock)
    // 2. Attempt Shopify sync
    // 3. Update ledger to SYNCED if successful
    // On retry: ledger entry exists → skip processing (even if still PENDING)
    // =========================================================================

    // Step 1: Create ledger entry FIRST with PENDING status
    await tx.storeCreditLedger.create({
      data: {
        id: ledgerId,
        customerId: customer.id,
        shop,
        amount: cashbackAmount,
        balance: customer.storeCredit + cashbackAmount, // Projected balance
        type: 'CASHBACK_EARNED',
        shopifyOrderId: order.id.toString(),
        orderId: orderRecord.id,
        metadata: {
          orderId: order.id,
          orderName: order.name,
          orderTotal: eligibleAmount,
          adjustedOrderTotal: adjustedEligibleAmount,
          excludedProductAmount: excludedProductAmount,
          cashbackPercent: currentTier.cashbackPercent,
          tierName: currentTier.name,
          description: `${currentTier.cashbackPercent}% cashback on order ${order.name}`,
          paymentBreakdown: breakdown,
          syncStatus: 'PENDING',
          autoProcessed: false
        },
        createdAt: now,
      }
    });

    console.log(`[OrderPaid] Created PENDING ledger entry ${ledgerId} for ${cashbackAmount} ${currency} (idempotency lock)`);

    let actualBalance = customer.storeCredit;
    let isProcessed = false;

    // Step 2: If auto-processing enabled, attempt Shopify sync
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
          console.log(`[OrderPaid] Store credit issued successfully - new balance: ${actualBalance}`);

          // Step 3: Update ledger and customer ONLY if Shopify succeeded
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              storeCredit: actualBalance,
              updatedAt: now
            }
          });

          // Update ledger entry to SYNCED
          await tx.storeCreditLedger.update({
            where: { id: ledgerId },
            data: {
              balance: actualBalance,
              metadata: {
                orderId: order.id,
                orderName: order.name,
                orderTotal: eligibleAmount,
                adjustedOrderTotal: adjustedEligibleAmount,
                excludedProductAmount: excludedProductAmount,
                cashbackPercent: currentTier.cashbackPercent,
                tierName: currentTier.name,
                description: `${currentTier.cashbackPercent}% cashback on order ${order.name}`,
                paymentBreakdown: breakdown,
                syncStatus: 'SYNCED',
                autoProcessed: true,
                syncedAt: now.toISOString()
              }
            }
          });

          console.log(`[OrderPaid] Updated ledger entry ${ledgerId} to SYNCED`);
        } else {
          console.error(`[OrderPaid] Failed to issue store credit: ${result.error}`);
          // Ledger remains PENDING - will be retried by reconciliation or manual process
        }
      } catch (error) {
        console.error(`[OrderPaid] Error issuing store credit:`, error);
        // Ledger remains PENDING - Shopify sync can be retried later
      }
    } else {
      console.log(`[OrderPaid] Auto-processing disabled - ledger entry remains PENDING`);
    }

    console.log(`[OrderPaid] Cashback processing complete: ${isProcessed ? 'SYNCED' : 'PENDING'} for ${cashbackAmount} ${currency}`);

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
          const isDowngrade = previousTier && newTier.minSpend < previousTier.minSpend;

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
          } else if (isDowngrade && previousTier) {
            console.log(`[OrderPaid] Sending tier downgrade email to customer ${customer.id}`);
            await sendTierDowngradeEmailNotification(
              shop,
              {
                id: customer.id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                shop: shop,
              },
              {
                id: previousTier.id,
                name: previousTier.name,
                cashbackPercent: previousTier.cashbackPercent,
              },
              {
                id: newTier.id,
                name: newTier.name,
                cashbackPercent: newTier.cashbackPercent,
              }
            );
          }

          if (isUpgrade) {

            // Process automation triggers for tier upgrade (non-blocking)
            try {
              await processAutomationTrigger({
                type: "tier_change",
                shop,
                customer: {
                  email: customer.email || "",
                  firstName: customer.firstName,
                  lastName: customer.lastName,
                  customerId: customer.id,
                },
                data: { tierId: newTier.id, tierName: newTier.name },
              });
            } catch (autoError) {
              console.error(`[OrderPaid] Automation trigger failed (non-fatal):`, autoError);
            }

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

