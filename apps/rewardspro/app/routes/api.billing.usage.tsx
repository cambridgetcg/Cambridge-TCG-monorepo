import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * API Route for creating usage-based billing charges
 * 
 * This route handles usage billing for:
 * - Order processing overages
 * - Premium feature usage
 * - Any other metered billing
 * 
 * Implements idempotency to prevent duplicate charges
 */

interface UsageRecordInput {
  description: string;
  amount: number;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    console.log("[Usage Billing] Processing usage charge request...");
    
    // Authenticate the request
    const { session, billing } = await authenticate.admin(request);
    
    if (!session?.shop) {
      console.error("[Usage Billing] No shop in session");
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const shop = session.shop;
    const data = await request.json() as UsageRecordInput;
    
    // Validate input
    if (!data.description || typeof data.amount !== 'number' || data.amount <= 0) {
      return json({ 
        error: "Invalid input. Description and positive amount are required." 
      }, { status: 400 });
    }
    
    // Generate idempotency key if not provided
    const idempotencyKey = data.idempotencyKey || uuidv4();
    
    console.log("[Usage Billing] Creating usage record:", {
      shop,
      description: data.description,
      amount: data.amount,
      idempotencyKey,
    });
    
    // Check if this idempotency key has been used before (within last 24 hours)
    const existingRecord = await db.usageRecord.findFirst({
      where: {
        shop,
        idempotencyKey,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });
    
    if (existingRecord) {
      console.log("[Usage Billing] Duplicate request detected, returning existing record");
      return json({
        success: true,
        usageRecord: existingRecord,
        duplicate: true,
      });
    }
    
    // Create the usage charge via Shopify Billing API
    try {
      const usageResult = await billing.createUsageRecord({
        description: data.description,
        price: {
          amount: data.amount,
          currencyCode: "USD", // TODO: Support multi-currency
        },
        idempotencyKey,
        isTest: process.env.NODE_ENV === 'development',
      });
      
      console.log("[Usage Billing] Shopify usage record created:", usageResult);
      
      // Store the usage record in our database for tracking
      const dbRecord = await db.usageRecord.create({
        data: {
          id: uuidv4(),
          shop,
          shopifyUsageRecordId: usageResult.id,
          description: data.description,
          amount: data.amount,
          currencyCode: "USD",
          idempotencyKey,
          processedAt: new Date(),
          metadata: data.metadata || {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      
      console.log("[Usage Billing] Usage record stored in database");
      
      // Check if we're approaching usage caps
      await checkUsageCaps(shop, billing);
      
      return json({
        success: true,
        usageRecord: dbRecord,
        shopifyRecord: usageResult,
      });
      
    } catch (billingError: any) {
      console.error("[Usage Billing] Shopify billing error:", billingError);
      
      // Handle specific Shopify billing errors
      if (billingError.message?.includes("cap")) {
        return json({
          error: "Usage cap reached. Please upgrade your plan.",
          code: "CAP_REACHED",
        }, { status: 402 });
      }
      
      if (billingError.message?.includes("subscription")) {
        return json({
          error: "No active subscription found.",
          code: "NO_SUBSCRIPTION",
        }, { status: 402 });
      }
      
      throw billingError;
    }
    
  } catch (error: any) {
    console.error("[Usage Billing] Error:", error);
    return json({ 
      error: "Failed to create usage charge",
      details: error.message,
    }, { status: 500 });
  }
};

/**
 * Check if merchant is approaching usage caps and send notifications
 */
async function checkUsageCaps(shop: string, billing: any) {
  try {
    // Calculate current month's usage
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const monthlyUsage = await db.usageRecord.aggregate({
      where: {
        shop,
        processedAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });
    
    const totalUsage = monthlyUsage._sum.amount || 0;
    console.log(`[Usage Billing] Monthly usage for ${shop}: $${totalUsage}`);
    
    // Get billing subscription to check caps (new GraphQL billing)
    const billingSubscription = await db.billingSubscription.findUnique({
      where: { shop },
    }).catch(() => null);

    if (billingSubscription && billingSubscription.cappedAmount) {
      const capAmount = Number(billingSubscription.cappedAmount);
      const usagePercentage = (totalUsage / capAmount) * 100;

      // Alert at 80% and 90% of cap
      if (usagePercentage >= 90) {
        console.log(`[Usage Billing] ${shop} at ${usagePercentage.toFixed(1)}% of usage cap`);

        // Update balance tracking
        await db.billingSubscription.update({
          where: { shop },
          data: {
            balanceUsed: totalUsage,
            balanceRemaining: Math.max(0, capAmount - totalUsage),
            updatedAt: new Date(),
          },
        }).catch(err => console.error("[Usage Billing] Failed to update balance:", err));

        // TODO: Send email notification or in-app alert (90% threshold)
      } else if (usagePercentage >= 80) {
        console.log(`[Usage Billing] ${shop} at ${usagePercentage.toFixed(1)}% of usage cap`);

        // Update balance tracking
        await db.billingSubscription.update({
          where: { shop },
          data: {
            balanceUsed: totalUsage,
            balanceRemaining: Math.max(0, capAmount - totalUsage),
            updatedAt: new Date(),
          },
        }).catch(err => console.error("[Usage Billing] Failed to update balance:", err));

        // TODO: Send email notification or in-app alert (80% threshold)
      }
    }
  } catch (error) {
    console.error("[Usage Billing] Error checking usage caps:", error);
    // Don't throw - this is a non-critical operation
  }
}

// GET method to retrieve usage history
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const shop = session.shop;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    
    // Get usage records for the shop
    const records = await db.usageRecord.findMany({
      where: { shop },
      orderBy: { processedAt: "desc" },
      take: limit,
      skip: offset,
    });
    
    // Get total count for pagination
    const totalCount = await db.usageRecord.count({
      where: { shop },
    });
    
    // Calculate current month total
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyTotal = await db.usageRecord.aggregate({
      where: {
        shop,
        processedAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });
    
    return json({
      records,
      totalCount,
      monthlyTotal: monthlyTotal._sum.amount || 0,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
    
  } catch (error: any) {
    console.error("[Usage Billing] Loader error:", error);
    return json({ 
      error: "Failed to retrieve usage history",
      details: error.message,
    }, { status: 500 });
  }
};