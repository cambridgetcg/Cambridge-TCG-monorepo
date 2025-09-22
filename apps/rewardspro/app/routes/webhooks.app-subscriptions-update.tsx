import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import * as crypto from "crypto";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 * Fired when a merchant's app subscription is updated (plan changes, cancellations, etc.)
 *
 * @security HMAC verification required before processing
 * @see https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic
 */
export async function action({ request }: ActionFunctionArgs) {
  console.log("[APP_SUBSCRIPTIONS_UPDATE] Webhook received");

  // 1. Get raw body for HMAC verification
  const rawBody = await request.text();

  // 2. VERIFY HMAC FIRST! (Critical security requirement)
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  if (!hmacHeader || !shopDomain) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] Missing required headers");
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify HMAC using timing-safe comparison
  // Use the app's Client Secret (API Secret) as per Shopify docs
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiSecret) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] SHOPIFY_API_SECRET not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  const hash = crypto
    .createHmac("sha256", apiSecret)
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

  // 4. Process subscription update
  try {
    const {
      app_subscription: subscription
    } = webhookData;

    if (!subscription) {
      console.warn("[APP_SUBSCRIPTIONS_UPDATE] No subscription data in webhook");
      return json({ success: true, message: "No subscription data" });
    }

    console.log(`[APP_SUBSCRIPTIONS_UPDATE] Processing subscription update:`, {
      shop: shopDomain,
      subscriptionId: subscription.admin_graphql_api_id,
      name: subscription.name,
      status: subscription.status,
      test: subscription.test,
      trialDays: subscription.trial_days,
      cappedAmount: subscription.capped_amount?.amount,
      balanceUsed: subscription.balance_used,
      balanceRemaining: subscription.balance_remaining,
    });

    // 5. Check if BillingSubscription table exists and update database
    try {
      // First, ensure the shop exists
      const shop = await db.shopSettings.findUnique({
        where: { shop: shopDomain }
      });

      if (!shop) {
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] Shop ${shopDomain} not found, creating settings`);
        await db.shopSettings.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
      }

      // Try to update billing subscription if table exists
      // Using a try-catch in case the table doesn't exist yet
      try {
        const existingSubscription = await db.billingSubscription.findUnique({
          where: { shop: shopDomain }
        });

        const subscriptionData = {
          shop: shopDomain,
          subscriptionId: subscription.admin_graphql_api_id,
          planName: subscription.name || "Unknown",
          status: subscription.status || "ACTIVE",
          isTest: subscription.test === true,
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end) : null,
          cappedAmount: subscription.capped_amount?.amount ? parseFloat(subscription.capped_amount.amount) : null,
          balanceUsed: subscription.balance_used ? parseFloat(subscription.balance_used) : 0,
          balanceRemaining: subscription.balance_remaining ? parseFloat(subscription.balance_remaining) : null,
          createdAt: subscription.created_at ? new Date(subscription.created_at) : new Date(),
          updatedAt: new Date(),
        };

        if (existingSubscription) {
          // Update existing subscription
          await db.billingSubscription.update({
            where: { shop: shopDomain },
            data: {
              ...subscriptionData,
              createdAt: undefined, // Don't update createdAt on updates
            }
          });
          console.log(`[APP_SUBSCRIPTIONS_UPDATE] Updated subscription for ${shopDomain}`);
        } else {
          // Create new subscription record
          await db.billingSubscription.create({
            data: {
              id: uuidv4(),
              ...subscriptionData,
            }
          });
          console.log(`[APP_SUBSCRIPTIONS_UPDATE] Created subscription for ${shopDomain}`);
        }

        // Handle subscription cancellation
        if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
          console.log(`[APP_SUBSCRIPTIONS_UPDATE] Subscription ${subscription.status} for ${shopDomain}`);
          // You might want to:
          // - Disable premium features
          // - Send notification email
          // - Update shop settings
          await db.shopSettings.update({
            where: { shop: shopDomain },
            data: {
              billingStatus: "INACTIVE",
              updatedAt: new Date(),
            }
          });
        } else if (subscription.status === "ACTIVE") {
          await db.shopSettings.update({
            where: { shop: shopDomain },
            data: {
              billingStatus: "ACTIVE",
              updatedAt: new Date(),
            }
          });
        }

      } catch (dbError: any) {
        if (dbError.code === 'P2021' || dbError.message?.includes('billingSubscription')) {
          console.log("[APP_SUBSCRIPTIONS_UPDATE] BillingSubscription table not found, skipping database update");
        } else {
          throw dbError;
        }
      }

    } catch (error) {
      console.error("[APP_SUBSCRIPTIONS_UPDATE] Database error:", error);
      // Don't fail the webhook - Shopify will retry if we return an error
      // Better to acknowledge receipt and handle errors separately
    }

    // 6. Handle usage cap approaching (90% threshold)
    if (subscription.balance_remaining && subscription.capped_amount?.amount) {
      const cappedAmount = parseFloat(subscription.capped_amount.amount);
      const remaining = parseFloat(subscription.balance_remaining);
      const usagePercentage = ((cappedAmount - remaining) / cappedAmount) * 100;

      if (usagePercentage >= 90) {
        console.warn(`[APP_SUBSCRIPTIONS_UPDATE] Shop ${shopDomain} approaching usage cap: ${usagePercentage.toFixed(2)}% used`);
        // TODO: Send notification to merchant
        // TODO: Consider pausing usage-based features
      }
    }

    // 7. Return success to Shopify
    console.log(`[APP_SUBSCRIPTIONS_UPDATE] Successfully processed for ${shopDomain}`);
    return json({
      success: true,
      shop: shopDomain,
      subscriptionId: subscription.admin_graphql_api_id
    });

  } catch (error) {
    console.error("[APP_SUBSCRIPTIONS_UPDATE] Processing error:", error);
    // Still return 200 to acknowledge receipt
    // Shopify will retry if we return an error status
    return json({
      success: false,
      error: "Processing failed but acknowledged"
    });
  }
}