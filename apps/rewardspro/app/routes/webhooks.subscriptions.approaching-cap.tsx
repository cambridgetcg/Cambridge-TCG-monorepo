import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyWebhookHMAC } from "~/utils/webhook-validation";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * Webhook handler for APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT
 * 
 * This webhook fires when a merchant is approaching their usage cap.
 * Shopify sends this when usage reaches 90% of the capped amount.
 * 
 * We use this to:
 * - Alert the merchant via email/in-app notification
 * - Update our internal tracking
 * - Potentially offer plan upgrades
 * - Prepare for cap enforcement
 */

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    console.log("[Webhook] APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT received");
    
    // Get raw body for HMAC verification
    const rawBody = await request.text();
    
    // CRITICAL: Verify HMAC
    if (!verifyWebhookHMAC(request, rawBody)) {
      console.error("[Webhook] HMAC verification failed");
      return new Response("Unauthorized", { status: 401 });
    }
    
    // Parse verified webhook data
    const webhookData = JSON.parse(rawBody);
    const shop = request.headers.get("X-Shopify-Shop-Domain");
    
    if (!shop) {
      console.error("[Webhook] No shop domain in headers");
      return new Response("Bad Request", { status: 400 });
    }
    
    console.log("[Webhook] Processing approaching cap for:", {
      shop,
      subscriptionId: webhookData.app_subscription?.id,
      cappedAmount: webhookData.app_subscription?.capped_amount,
      balanceUsed: webhookData.app_subscription?.balance_used,
      balanceRemaining: webhookData.app_subscription?.balance_remaining,
    });
    
    const subscription = webhookData.app_subscription;
    const cappedAmount = subscription?.capped_amount?.amount || 0;
    const balanceUsed = subscription?.balance_used?.amount || 0;
    const balanceRemaining = subscription?.balance_remaining?.amount || 0;
    const percentageUsed = cappedAmount > 0 ? (balanceUsed / cappedAmount) * 100 : 0;
    
    // Update billing plan with cap alert status
    const billingPlan = await db.billingPlan.update({
      where: { shop },
      data: {
        cap90AlertSent: true,
        lastCapAlert: new Date(),
        metadata: {
          ...((await db.billingPlan.findUnique({ where: { shop } }))?.metadata || {}),
          lastCapWarning: {
            timestamp: new Date().toISOString(),
            cappedAmount,
            balanceUsed,
            balanceRemaining,
            percentageUsed,
          },
        },
        updatedAt: new Date(),
      },
    });
    
    // Create notification record
    await db.notification.create({
      data: {
        id: uuidv4(),
        shop,
        type: "USAGE_CAP_WARNING",
        title: "Approaching Usage Limit",
        message: `You've used ${percentageUsed.toFixed(1)}% of your monthly usage allowance. Consider upgrading your plan to avoid service interruption.`,
        severity: "WARNING",
        read: false,
        metadata: {
          cappedAmount,
          balanceUsed,
          balanceRemaining,
          percentageUsed,
        },
        createdAt: new Date(),
      },
    });
    
    // Track in billing history
    await db.billingHistory.create({
      data: {
        id: uuidv4(),
        shop,
        eventType: "APPROACHING_CAP",
        planName: billingPlan?.planName || "Unknown",
        status: "WARNING",
        amount: balanceUsed,
        metadata: {
          cappedAmount,
          balanceUsed,
          balanceRemaining,
          percentageUsed,
        },
        createdAt: new Date(),
      },
    });
    
    console.log("[Webhook] Cap warning processed:", {
      shop,
      percentageUsed: `${percentageUsed.toFixed(1)}%`,
      balanceRemaining,
    });
    
    // TODO: Send email notification to merchant
    // This would typically integrate with your email service
    // await sendCapWarningEmail(shop, percentageUsed, balanceRemaining);
    
    // TODO: Consider auto-upgrade logic
    // If merchant has auto-upgrade enabled, initiate plan upgrade
    // if (merchantSettings.autoUpgradeEnabled && percentageUsed >= 95) {
    //   await initiateAutoUpgrade(shop);
    // }
    
    return json({
      success: true,
      warning: {
        percentageUsed,
        balanceRemaining,
        message: `Usage at ${percentageUsed.toFixed(1)}% of cap`,
      },
    });
    
  } catch (error: any) {
    console.error("[Webhook] Error processing approaching cap:", error);
    return json(
      { error: "Failed to process cap warning", details: error.message },
      { status: 500 }
    );
  }
};