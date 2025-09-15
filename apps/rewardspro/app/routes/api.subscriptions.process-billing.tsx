/**
 * API endpoint for processing subscription billing
 * This should be called by a cron job or scheduled task
 * 
 * Security: Requires API key or webhook signature validation
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "~/db.server";
import { BillingScheduler } from "~/services/subscription/billing-scheduler.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Validate request authorization
  const authHeader = request.headers.get("Authorization");
  const apiKey = process.env.INTERNAL_API_KEY || "default-key-change-in-production";
  
  if (authHeader !== `Bearer ${apiKey}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const shop = formData.get("shop") as string;
  const action = formData.get("action") as string;

  if (!shop) {
    return json({ error: "Shop parameter required" }, { status: 400 });
  }

  try {
    // Get admin context for the shop
    const shopSession = await db.session.findFirst({
      where: { shop },
      orderBy: { id: 'desc' },
    });

    if (!shopSession) {
      return json({ error: "Shop session not found" }, { status: 404 });
    }

    // Create admin context
    const admin = {
      graphql: async (query: string, options?: any) => {
        // This would need to be implemented with proper Shopify API client
        // For now, returning a mock response
        console.log('GraphQL query:', query, options);
        return {
          json: async () => ({ data: {} }),
        };
      },
    } as any;

    let results;

    switch (action) {
      case "process-due":
        // Process all subscriptions due for billing
        results = await BillingScheduler.processDueBillings(admin, shop);
        break;

      case "retry-failed":
        // Retry failed billing attempts
        results = await BillingScheduler.retryFailedBillings(admin, shop);
        break;

      case "health-check":
        // Check subscription health and send notifications
        await BillingScheduler.checkSubscriptionHealth(shop);
        results = { message: "Health check completed" };
        break;

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }

    return json({
      success: true,
      shop,
      action,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`Error processing billing for shop ${shop}:`, error);
    return json(
      {
        success: false,
        error: error.message,
        shop,
        action,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

// GET endpoint for health check
export const loader = async ({ request }: ActionFunctionArgs) => {
  return json({
    status: "ok",
    service: "subscription-billing",
    timestamp: new Date().toISOString(),
  });
};