import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { v4 as uuidv4 } from "uuid";

/**
 * Get the currency for a shop from shop settings
 * Falls back to USD if not configured
 */
async function getShopCurrency(shop: string): Promise<string> {
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { storeCurrency: true }
  });
  return settings?.storeCurrency ?? 'USD';
}

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

    // SECURITY: Maximum amount per charge to prevent accidental over-billing
    // These limits can be configured via environment variables
    const MAX_SINGLE_CHARGE = Number(process.env.BILLING_MAX_SINGLE_CHARGE) || 1000; // Default $1,000
    const MAX_DAILY_TOTAL = Number(process.env.BILLING_MAX_DAILY_TOTAL) || 5000;     // Default $5,000

    // Validate input - SECURITY: Check for Infinity, NaN, and -0
    if (!data.description ||
        typeof data.amount !== 'number' ||
        data.amount <= 0 ||
        !Number.isFinite(data.amount)) {
      return json({
        error: "Invalid input. Description and positive finite amount are required.",
        code: "INVALID_INPUT"
      }, { status: 400 });
    }

    // SECURITY: Enforce maximum single charge limit
    if (data.amount > MAX_SINGLE_CHARGE) {
      console.warn(`[Usage Billing] Rejected charge exceeding max: ${data.amount} > ${MAX_SINGLE_CHARGE}`);
      return json({
        error: `Amount exceeds maximum allowed per charge ($${MAX_SINGLE_CHARGE})`,
        code: "AMOUNT_EXCEEDS_LIMIT",
        maxAllowed: MAX_SINGLE_CHARGE,
      }, { status: 400 });
    }

    // SECURITY: Check daily total to prevent rapid accumulation
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const dailyTotal = await prisma.usageRecord.aggregate({
      where: {
        shop,
        processedAt: { gte: todayStart },
      },
      _sum: { amount: true },
    });

    const currentDailyTotal = dailyTotal._sum.amount || 0;
    if (currentDailyTotal + data.amount > MAX_DAILY_TOTAL) {
      console.warn(`[Usage Billing] Rejected: daily total would exceed max: ${currentDailyTotal} + ${data.amount} > ${MAX_DAILY_TOTAL}`);
      return json({
        error: `Daily usage limit reached ($${MAX_DAILY_TOTAL}). Please contact support if you need higher limits.`,
        code: "DAILY_LIMIT_REACHED",
        currentDailyTotal,
        maxDailyTotal: MAX_DAILY_TOTAL,
      }, { status: 429 });
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
    const existingRecord = await prisma.usageRecord.findFirst({
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
      // Get shop currency for multi-currency support
      const shopCurrency = await getShopCurrency(shop);

      const usageResult = await billing.createUsageRecord({
        description: data.description,
        price: {
          amount: data.amount,
          currencyCode: shopCurrency,
        },
        idempotencyKey,
        isTest: process.env.NODE_ENV === 'development',
      });

      console.log("[Usage Billing] Shopify usage record created:", usageResult);

      // Store the usage record in our database for tracking
      const dbRecord = await prisma.usageRecord.create({
        data: {
          id: uuidv4(),
          shop,
          shopifyUsageRecordId: usageResult.id,
          description: data.description,
          amount: data.amount,
          currencyCode: shopCurrency,
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
    // SECURITY: Log full error server-side, return sanitized error to client
    console.error("[Usage Billing] Error:", error);
    return json({
      error: "Failed to create usage charge",
      code: "USAGE_CHARGE_FAILED"
      // SECURITY: Don't leak internal error details to clients
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
    
    const monthlyUsage = await prisma.usageRecord.aggregate({
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
    const billingSubscription = await prisma.billingSubscription.findUnique({
      where: { shop },
    }).catch(() => null);

    if (billingSubscription && billingSubscription.cappedAmount) {
      const capAmount = Number(billingSubscription.cappedAmount);
      const usagePercentage = (totalUsage / capAmount) * 100;

      // Alert at 80% and 90% of cap
      if (usagePercentage >= 90) {
        console.log(`[Usage Billing] ${shop} at ${usagePercentage.toFixed(1)}% of usage cap`);

        // Update balance tracking
        await prisma.billingSubscription.update({
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
        await prisma.billingSubscription.update({
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
    const records = await prisma.usageRecord.findMany({
      where: { shop },
      orderBy: { processedAt: "desc" },
      take: limit,
      skip: offset,
    });
    
    // Get total count for pagination
    const totalCount = await prisma.usageRecord.count({
      where: { shop },
    });
    
    // Calculate current month total
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyTotal = await prisma.usageRecord.aggregate({
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
    // SECURITY: Log full error server-side, return sanitized error to client
    console.error("[Usage Billing] Loader error:", error);
    return json({
      error: "Failed to retrieve usage history",
      code: "USAGE_HISTORY_FAILED"
      // SECURITY: Don't leak internal error details to clients
    }, { status: 500 });
  }
};