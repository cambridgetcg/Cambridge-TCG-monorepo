import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import * as crypto from "crypto";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";
import { refreshEntitlements } from "~/services/entitlements.server";
import { markTrialUsed } from "~/services/billing/trial-eligibility.server";
import { invalidateShopSettings, invalidateShopBilling, invalidateShopEntitlements } from "~/services/shop-data-provider.server";
import {
  checkWebhookIdempotency,
  markWebhookCompleted,
  markWebhookFailed,
  clearWebhookForRetry,
  extractTimestamps,
  hashPayload,
} from "~/services/billing/webhook-processing.server";

/**
 * Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 * Fired when a merchant's app subscription is updated (plan changes, cancellations, etc.)
 *
 * SECURITY: HMAC verification required before processing
 * RELIABILITY: Implements idempotency, ordering, and proper error handling
 *
 * @see https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic
 * @see https://shopify.dev/docs/apps/build/webhooks/best-practices
 */
export async function action({ request }: ActionFunctionArgs) {
  console.log("[APP_SUBSCRIPTIONS_UPDATE] Webhook received");

  // 1. Get raw body for HMAC verification
  const rawBody = await request.text();

  // 2. VERIFY HMAC FIRST! (Critical security requirement)
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const webhookId = request.headers.get("x-shopify-webhook-id");

  if (!hmacHeader || !shopDomain) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] Missing required headers");
    return new Response("Unauthorized", { status: 401 });
  }

  // Generate webhook ID if not provided (shouldn't happen, but be safe)
  const effectiveWebhookId = webhookId || `generated-${uuidv4()}`;

  // Verify HMAC using timing-safe comparison
  // Use dedicated webhook secret if configured, fall back to API secret
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!webhookSecret) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] Neither SHOPIFY_WEBHOOK_SECRET nor SHOPIFY_API_SECRET configured");
    return new Response("Server configuration error", { status: 500 });
  }

  const hash = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader))) {
      console.error("[APP_SUBSCRIPTIONS_UPDATE] HMAC verification failed");
      return new Response("Unauthorized", { status: 401 });
    }
  } catch (error) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] HMAC comparison error:", error);
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`[APP_SUBSCRIPTIONS_UPDATE] HMAC verified for shop: ${shopDomain}`);

  // 3. Parse verified webhook body
  let webhookData: any;
  try {
    webhookData = JSON.parse(rawBody);
  } catch (error) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] Failed to parse webhook body:", error);
    return new Response("Bad Request", { status: 400 });
  }

  const { app_subscription: subscription } = webhookData;

  if (!subscription) {
    console.warn("[APP_SUBSCRIPTIONS_UPDATE] No subscription data in webhook");
    return json({ success: true, message: "No subscription data" });
  }

  // 4. Extract timestamps for ordering check
  const timestamps = extractTimestamps(subscription, request.headers);

  // 5. Check idempotency - should we process this webhook?
  const idempotencyCheck = await checkWebhookIdempotency({
    webhookId: effectiveWebhookId,
    topic: "APP_SUBSCRIPTIONS_UPDATE",
    shop: shopDomain,
    triggeredAt: timestamps.triggeredAt,
    updatedAt: timestamps.updatedAt,
    payloadHash: hashPayload(rawBody),
  });

  if (!idempotencyCheck.shouldProcess) {
    console.log(`[APP_SUBSCRIPTIONS_UPDATE] ${idempotencyCheck.message}`);

    // For duplicates and stale webhooks, return 200 (don't retry)
    if (idempotencyCheck.reason === "DUPLICATE" || idempotencyCheck.reason === "STALE") {
      return json({
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
        message: idempotencyCheck.message,
      });
    }

    // For infrastructure errors, return 500 (trigger retry)
    if (idempotencyCheck.reason === "INFRASTRUCTURE_ERROR") {
      return new Response("Infrastructure error - please retry", { status: 500 });
    }

    // For processing conflicts, return 200 (another instance is handling it)
    return json({
      success: true,
      skipped: true,
      reason: idempotencyCheck.reason,
      message: idempotencyCheck.message,
    });
  }

  // 6. Process subscription update with proper error handling
  try {
    // Extract line items to identify recurring and usage charges
    const lineItems = subscription.line_items || [];
    const recurringLineItem = lineItems.find((item: any) =>
      item.plan?.pricing_details?.__typename === 'AppRecurringPricing'
    );
    const usageLineItem = lineItems.find((item: any) =>
      item.plan?.pricing_details?.__typename === 'AppUsagePricing'
    );

    console.log(`[APP_SUBSCRIPTIONS_UPDATE] Processing subscription update:`, {
      shop: shopDomain,
      webhookId: effectiveWebhookId,
      subscriptionId: subscription.admin_graphql_api_id,
      name: subscription.name,
      status: subscription.status,
      test: subscription.test,
      trialDays: subscription.trial_days,
      updatedAt: timestamps.updatedAt,
    });

    // 7. Update all subscription state in a transaction
    await db.$transaction(async (tx) => {
      // Update or create ShopSettings
      const existingShop = await tx.shopSettings.findUnique({
        where: { shop: shopDomain }
      });

      if (!existingShop) {
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] Shop ${shopDomain} not found, creating settings`);
        await tx.shopSettings.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            storeName: shopDomain,
            storeUrl: `https://${shopDomain}`,
            subscriptionStatus: subscription.status || "ACTIVE",
            subscriptionUpdatedAt: new Date(),
            currentPlanName: subscription.name || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
      } else {
        await tx.shopSettings.update({
          where: { shop: shopDomain },
          data: {
            subscriptionStatus: subscription.status || "ACTIVE",
            subscriptionUpdatedAt: new Date(),
            currentPlanName: subscription.name || null,
            billingStatus: (subscription.status === "ACTIVE") ? "ACTIVE" : "INACTIVE",
            updatedAt: new Date(),
          }
        });
      }

      // Update AppSubscription with webhook timestamp for ordering
      await tx.appSubscription.upsert({
        where: { shop: shopDomain },
        create: {
          id: uuidv4(),
          shop: shopDomain,
          shopifySubscriptionId: subscription.admin_graphql_api_id,
          planName: subscription.name || "Unknown",
          status: subscription.status || "ACTIVE",
          test: subscription.test || false,
          trialDays: subscription.trial_days || null,
          lastWebhookUpdate: new Date(),
          webhookUpdateCount: 1,
          webhookTimestamp: timestamps.updatedAt || timestamps.triggeredAt || new Date(),
        },
        update: {
          shopifySubscriptionId: subscription.admin_graphql_api_id,
          planName: subscription.name || "Unknown",
          status: subscription.status || "ACTIVE",
          test: subscription.test || false,
          trialDays: subscription.trial_days || null,
          lastWebhookUpdate: new Date(),
          webhookUpdateCount: { increment: 1 },
          webhookTimestamp: timestamps.updatedAt || timestamps.triggeredAt || new Date(),
        },
      });

      // Update BillingSubscription for usage tracking
      await tx.billingSubscription.upsert({
        where: { shop: shopDomain },
        create: {
          id: uuidv4(),
          shop: shopDomain,
          subscriptionId: subscription.admin_graphql_api_id,
          subscriptionStatus: subscription.status || "ACTIVE",
          recurringLineItemId: recurringLineItem?.id || null,
          usageLineItemId: usageLineItem?.id || null,
          usageCappedAmount: subscription.capped_amount?.amount
            ? parseFloat(subscription.capped_amount.amount)
            : null,
        },
        update: {
          subscriptionId: subscription.admin_graphql_api_id,
          subscriptionStatus: subscription.status || "ACTIVE",
          recurringLineItemId: recurringLineItem?.id || null,
          usageLineItemId: usageLineItem?.id || null,
          usageCappedAmount: subscription.capped_amount?.amount
            ? parseFloat(subscription.capped_amount.amount)
            : null,
        },
      });

      // Log status changes for audit trail
      if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] ⚠️  Subscription ${subscription.status} for ${shopDomain}`);

        await tx.billingHistory.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            eventType: "SUBSCRIPTION_" + subscription.status,
            planName: subscription.name || "Unknown",
            status: subscription.status,
            metadata: {
              subscriptionId: subscription.admin_graphql_api_id,
              webhookId: effectiveWebhookId,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
    });

    console.log(`[APP_SUBSCRIPTIONS_UPDATE] Transaction completed for ${shopDomain}`);

    // 7.5 Invalidate caches (non-critical, outside transaction)
    try {
      await Promise.all([
        invalidateShopSettings(shopDomain),
        invalidateShopBilling(shopDomain),
        invalidateShopEntitlements(shopDomain),
      ]);
      console.log(`[APP_SUBSCRIPTIONS_UPDATE] Invalidated caches for ${shopDomain}`);
    } catch (cacheError) {
      console.error("[APP_SUBSCRIPTIONS_UPDATE] Failed to invalidate caches:", cacheError);
      // Non-critical - don't fail webhook
    }

    // 8. Handle trial tracking (non-critical, outside transaction)
    if (subscription.status === "ACTIVE" && subscription.trial_days > 0) {
      try {
        const existingSubscription = await db.appSubscription.findUnique({
          where: { shop: shopDomain },
          select: { hasUsedTrial: true }
        });

        if (!existingSubscription?.hasUsedTrial) {
          const planId = subscription.name?.toLowerCase()?.replace('rewardspro ', '') || 'unknown';
          await markTrialUsed(shopDomain, planId, subscription.trial_days);
          console.log(`[APP_SUBSCRIPTIONS_UPDATE] 🎁 Trial marked as used for ${shopDomain}`);
        }
      } catch (trialError) {
        console.error("[APP_SUBSCRIPTIONS_UPDATE] Failed to mark trial as used:", trialError);
        // Non-critical - don't fail webhook
      }
    }

    // 9. Refresh entitlements (non-critical, outside transaction)
    try {
      await refreshEntitlements(shopDomain);
      console.log(`[APP_SUBSCRIPTIONS_UPDATE] Refreshed entitlements for ${shopDomain}`);
    } catch (entitlementsError) {
      console.error("[APP_SUBSCRIPTIONS_UPDATE] Failed to refresh entitlements:", entitlementsError);
      // Non-critical - don't fail webhook
    }

    // 10. Mark webhook as completed
    await markWebhookCompleted(effectiveWebhookId);

    console.log(`[APP_SUBSCRIPTIONS_UPDATE] ✅ Successfully processed for ${shopDomain}`);
    return json({
      success: true,
      shop: shopDomain,
      webhookId: effectiveWebhookId,
      subscriptionId: subscription.admin_graphql_api_id
    });

  } catch (error: any) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] Critical processing error:", error);

    // Mark webhook as failed
    await markWebhookFailed(effectiveWebhookId, error.message || "Unknown error");

    // Clear the webhook record so Shopify retry will be processed
    await clearWebhookForRetry(effectiveWebhookId);

    // CRITICAL: Return 500 to trigger Shopify retry
    // This is the key fix - we were returning 200 on error before
    return new Response(
      JSON.stringify({
        success: false,
        error: "Processing failed",
        webhookId: effectiveWebhookId,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
