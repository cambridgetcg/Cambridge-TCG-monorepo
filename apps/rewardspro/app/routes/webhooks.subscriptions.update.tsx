import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyWebhookHMAC } from "~/utils/security";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 * 
 * This webhook fires when:
 * - A merchant upgrades/downgrades their plan
 * - A subscription is renewed
 * - A subscription is cancelled
 * - Usage charges are applied
 * 
 * We use this to:
 * - Update our billing records
 * - Track plan changes
 * - Reset usage caps for new billing periods
 */

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    console.log("[Webhook] APP_SUBSCRIPTIONS_UPDATE received");
    
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
    
    console.log("[Webhook] Processing subscription update for:", {
      shop,
      subscriptionId: webhookData.app_subscription?.id,
      status: webhookData.app_subscription?.status,
    });
    
    const subscription = webhookData.app_subscription;
    
    // Extract plan details
    const planName = subscription?.name || "Unknown Plan";
    const status = subscription?.status || "UNKNOWN";
    const currentPeriodEnd = subscription?.current_period_end;
    const lineItems = subscription?.line_items || [];
    
    // Find usage-based line items
    const usageItems = lineItems.filter((item: any) => 
      item.plan?.pricing_details?.usage !== undefined
    );
    
    // Find subscription line items
    const subscriptionItems = lineItems.filter((item: any) => 
      item.plan?.pricing_details?.recurring !== undefined
    );
    
    // Calculate monthly price from subscription items
    let monthlyPrice = 0;
    subscriptionItems.forEach((item: any) => {
      const amount = item.plan?.pricing_details?.price?.amount || 0;
      const interval = item.plan?.pricing_details?.recurring?.interval;
      
      if (interval === "ANNUAL") {
        monthlyPrice += amount / 12;
      } else {
        monthlyPrice += amount;
      }
    });
    
    // Extract usage caps if any
    let usageCap = null;
    usageItems.forEach((item: any) => {
      const cappedAmount = item.plan?.pricing_details?.usage?.capped_amount?.amount;
      if (cappedAmount) {
        usageCap = cappedAmount;
      }
    });
    
    // Update or create billing plan record
    const billingPlan = await db.billingPlan.upsert({
      where: { shop },
      create: {
        id: uuidv4(),
        shop,
        planName,
        status,
        monthlyPrice,
        usageCap,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
        cap80AlertSent: false,
        cap90AlertSent: false,
        metadata: webhookData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {
        planName,
        status,
        monthlyPrice,
        usageCap,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
        metadata: webhookData,
        updatedAt: new Date(),
        // Reset cap alerts if this is a new billing period
        ...(isNewBillingPeriod(currentPeriodEnd) && {
          cap80AlertSent: false,
          cap90AlertSent: false,
        }),
      },
    });
    
    console.log("[Webhook] Billing plan updated:", {
      shop,
      planName,
      status,
      monthlyPrice,
      usageCap,
    });
    
    // Track plan changes
    if (status === "ACTIVE" || status === "CANCELLED") {
      await db.billingHistory.create({
        data: {
          id: uuidv4(),
          shop,
          eventType: "SUBSCRIPTION_UPDATE",
          planName,
          status,
          amount: monthlyPrice,
          metadata: webhookData,
          createdAt: new Date(),
        },
      });
    }
    
    // Handle cancellation
    if (status === "CANCELLED") {
      console.log("[Webhook] Subscription cancelled, marking for cleanup");
      
      // You might want to:
      // 1. Send cancellation email
      // 2. Schedule data export
      // 3. Set grace period
      // 4. Disable premium features
    }
    
    return json({ success: true, subscription: billingPlan });
    
  } catch (error: any) {
    console.error("[Webhook] Error processing subscription update:", error);
    return json(
      { error: "Failed to process subscription update", details: error.message },
      { status: 500 }
    );
  }
};

/**
 * Check if this is a new billing period
 */
function isNewBillingPeriod(currentPeriodEnd: string | null): boolean {
  if (!currentPeriodEnd) return false;
  
  const endDate = new Date(currentPeriodEnd);
  const now = new Date();
  
  // If the period end is in the future and more than 25 days away,
  // it's likely a new period (monthly renewals)
  const daysUntilEnd = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  
  return daysUntilEnd > 25;
}