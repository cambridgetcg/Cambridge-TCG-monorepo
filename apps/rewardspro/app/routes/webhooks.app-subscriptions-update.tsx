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
      subscriptionId: subscription.admin_graphql_api_id,
      name: subscription.name,
      status: subscription.status,
      test: subscription.test,
      trialDays: subscription.trial_days,
      cappedAmount: subscription.capped_amount?.amount,
      balanceUsed: subscription.balance_used,
      balanceRemaining: subscription.balance_remaining,
      recurringLineItemId: recurringLineItem?.id,
      usageLineItemId: usageLineItem?.id,
    });

    // 5. Update ShopSettings with simplified billing data
    // NOTE: We use billing.check() as source of truth, so we only store minimal data here
    try {
      // Ensure the shop exists
      const shop = await db.shopSettings.findUnique({
        where: { shop: shopDomain }
      });

      if (!shop) {
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] Shop ${shopDomain} not found, creating settings`);
        await db.shopSettings.create({
          data: {
            id: uuidv4(),
            shop: shopDomain,
            subscriptionStatus: subscription.status || "ACTIVE",
            subscriptionUpdatedAt: new Date(),
            currentPlanName: subscription.name || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
      } else {
        // Update existing shop with simplified billing data
        await db.shopSettings.update({
          where: { shop: shopDomain },
          data: {
            subscriptionStatus: subscription.status || "ACTIVE",
            subscriptionUpdatedAt: new Date(),
            currentPlanName: subscription.name || null,
            // Keep legacy billingStatus in sync for backwards compatibility
            billingStatus: (subscription.status === "ACTIVE") ? "ACTIVE" : "INACTIVE",
            updatedAt: new Date(),
          }
        });
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] Updated ShopSettings for ${shopDomain}`);
      }

      // Log status changes for audit trail
      if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] ⚠️  Subscription ${subscription.status} for ${shopDomain}`);

        await db.billingHistory.create({
          data: {
            shop: shopDomain,
            eventType: "SUBSCRIPTION_" + subscription.status,
            planName: subscription.name,
            status: subscription.status,
            metadata: {
              subscriptionId: subscription.admin_graphql_api_id,
              timestamp: new Date().toISOString(),
            },
          },
        });
      } else if (subscription.status === "ACTIVE") {
        console.log(`[APP_SUBSCRIPTIONS_UPDATE] ✅ Subscription ACTIVE for ${shopDomain}`);
      }

    } catch (error) {
      console.error("[APP_SUBSCRIPTIONS_UPDATE] Database error:", error);
      // Don't fail the webhook - Shopify will retry if we return an error
    }

    // 6. Return success to Shopify
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