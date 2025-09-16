/**
 * Shopify App Proxy Handler for RewardsPro Widget
 * 
 * This endpoint handles requests from the storefront widget via Shopify App Proxy.
 * Requests come through: https://store.myshopify.com/apps/rewardspro/membership
 * And are proxied to: https://app-domain.com/api/proxy/membership
 * 
 * SECURITY:
 * - Automatic HMAC signature verification via authenticate.public.appProxy()
 * - Shop domain validation through session
 * - Customer ID provided by Shopify (trusted)
 * - All queries scoped to authenticated shop
 * - Rate limiting implemented
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { formatCurrency } from "../utils/currency";
import { Decimal } from "@prisma/client/runtime/library";

// Simple in-memory rate limiter (consider Redis for production)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(shop: string, limit = 60): boolean {
  const now = Date.now();
  const key = `proxy:${shop}`;
  const entry = requestCounts.get(key);
  
  // Reset if time window expired (1 minute)
  if (!entry || entry.resetTime < now) {
    requestCounts.set(key, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  // Check if under limit
  if (entry.count >= limit) {
    return false;
  }
  
  // Increment counter
  entry.count++;
  return true;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  
  try {
    // Step 1: Authenticate the app proxy request using Shopify's helper
    // This automatically verifies the HMAC signature and provides session context
    const { session, admin, storefront } = await authenticate.public.appProxy(request);
    
    // Step 2: Check if app is installed for this shop
    if (!session) {
      console.log("App proxy: No session found (app not installed or invalid signature)");
      return json(
        { 
          error: "App not installed", 
          requiresInstall: true,
          message: "Please ask your store admin to install RewardsPro"
        },
        { 
          status: 401,
          headers: {
            "X-Response-Time": `${Date.now() - startTime}ms`
          }
        }
      );
    }
    
    const shop = session.shop;
    console.log(`App proxy request from shop: ${shop}`);
    
    // Step 3: Rate limiting check
    if (!checkRateLimit(shop)) {
      console.warn(`Rate limit exceeded for shop: ${shop}`);
      return json(
        { error: "Too many requests. Please try again later." },
        { 
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": "60",
            "X-RateLimit-Remaining": "0",
            "X-Response-Time": `${Date.now() - startTime}ms`
          }
        }
      );
    }
    
    // Step 4: Extract customer ID from Shopify-provided params
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");
    const timestamp = url.searchParams.get("timestamp");
    
    // Optional: Check timestamp freshness to prevent replay attacks
    if (timestamp) {
      const requestTime = parseInt(timestamp, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime - requestTime > 300) { // 5 minute window
        console.warn(`Stale request from shop ${shop}: ${currentTime - requestTime}s old`);
        return json(
          { error: "Request expired" },
          { 
            status: 400,
            headers: {
              "X-Response-Time": `${Date.now() - startTime}ms`
            }
          }
        );
      }
    }
    
    // Step 5: Handle guest users (not logged in)
    if (!customerId) {
      console.log(`Guest user accessing widget for shop: ${shop}`);
      return json({
        success: true,
        requiresLogin: true,
        message: "Please log in to view your rewards",
        shopInfo: {
          name: session.shop.replace('.myshopify.com', ''),
          hasRewardsProgram: true
        }
      }, {
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Response-Time": `${Date.now() - startTime}ms`
        }
      });
    }
    
    console.log(`Fetching data for customer ${customerId} from shop ${shop}`);
    
    // Step 6: Fetch customer data scoped to shop (CRITICAL for security)
    // Note: Data API adapter doesn't support include, fetch separately
    const customer = await db.customer.findFirst({
      where: {
        shopifyCustomerId: customerId,
        shop: shop // CRITICAL: Always scope to authenticated shop
      }
    });
    
    // Fetch tier data separately if customer has a tier
    let currentTier = null;
    if (customer && customer.currentTierId) {
      currentTier = await db.tier.findFirst({
        where: {
          id: customer.currentTierId,
          shop: shop
        }
      });
    }
    
    // Step 7: Get shop settings for formatting
    // Note: Data API adapter doesn't support select
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });
    
    // Step 8: Handle non-enrolled customers
    if (!customer) {
      console.log(`Customer ${customerId} not enrolled in rewards for shop ${shop}`);
      return json({
        success: true,
        enrolled: false,
        message: "Join our rewards program to start earning cashback!",
        benefits: [
          "Earn cashback on every purchase",
          "Unlock exclusive member tiers",
          "Get personalized rewards"
        ]
      }, {
        headers: {
          "Cache-Control": "private, max-age=60",
          "X-Response-Time": `${Date.now() - startTime}ms`
        }
      });
    }
    
    // Step 9: Calculate lifetime earned (sum of all cashback earned)
    const lifetimeEarned = await db.storeCreditLedger.aggregate({
      where: {
        customerId: customer.id,
        shop: shop,
        type: "CASHBACK_EARNED"
      },
      _sum: {
        amount: true
      }
    });
    
    // Step 10: Calculate lifetime spent (for tier progress)
    const lifetimeSpending = await db.storeCreditLedger.aggregate({
      where: {
        customerId: customer.id,
        shop: shop,
        type: {
          in: ["CASHBACK_EARNED"] // Base spending on cashback earned (which is based on order totals)
        }
      },
      _sum: {
        amount: true
      }
    });
    
    // Calculate spending based on cashback rate (reverse calculation)
    const lifetimeSpendingValue = lifetimeSpending._sum.amount
      ? (typeof lifetimeSpending._sum.amount === 'object' && lifetimeSpending._sum.amount?.toNumber
          ? lifetimeSpending._sum.amount.toNumber()
          : Number(lifetimeSpending._sum.amount))
      : 0;
    
    const totalSpent = lifetimeSpendingValue && currentTier?.cashbackPercent
      ? (lifetimeSpendingValue / currentTier.cashbackPercent) * 100
      : 0;
    
    // Step 11: Calculate next tier progress
    let nextTierInfo = null;
    if (currentTier) {
      const nextTier = await db.tier.findFirst({
        where: {
          shop,
          minSpend: { gt: currentTier.minSpend }
        },
        orderBy: { minSpend: 'asc' }
      });
      
      if (nextTier) {
        const currentSpend = totalSpent;
        const progress = Math.min(100, 
          (currentSpend / nextTier.minSpend) * 100
        );
        
        nextTierInfo = {
          name: nextTier.name,
          progress: Math.round(progress),
          remaining: formatCurrency(
            Math.max(0, nextTier.minSpend - currentSpend),
            shopSettings
          ),
          threshold: formatCurrency(nextTier.minSpend, shopSettings),
          cashbackRate: nextTier.cashbackPercent
        };
      }
    } else {
      // Customer has no tier, show first available tier
      const firstTier = await db.tier.findFirst({
        where: { shop },
        orderBy: { minSpend: 'asc' }
      });
      
      if (firstTier) {
        nextTierInfo = {
          name: firstTier.name,
          progress: 0,
          remaining: formatCurrency(firstTier.minSpend, shopSettings),
          threshold: formatCurrency(firstTier.minSpend, shopSettings),
          cashbackRate: firstTier.cashbackPercent
        };
      }
    }
    
    // Step 12: Count available rewards (placeholder - implement based on your rewards system)
    // Handle storeCredit as either a Decimal object or a number
    const storeCreditValue = typeof customer.storeCredit === 'object' && customer.storeCredit?.toNumber 
      ? customer.storeCredit.toNumber() 
      : Number(customer.storeCredit);
    
    const availableRewards = storeCreditValue > 0 ? 1 : 0;
    
    // Step 13: Build and return member response
    const memberResponse = {
      success: true,
      enrolled: true,
      memberData: {
        // Balance information
        storeCredit: formatCurrency(
          storeCreditValue,
          shopSettings
        ),
        storeCreditRaw: storeCreditValue,
        
        // Tier information
        tierName: currentTier?.name || "No Tier",
        cashbackRate: currentTier?.cashbackPercent || 0,
        
        // Progress information
        nextTier: nextTierInfo?.name,
        progressToNextTier: nextTierInfo?.progress,
        remainingToNextTier: nextTierInfo?.remaining,
        nextTierThreshold: nextTierInfo?.threshold,
        nextTierCashbackRate: nextTierInfo?.cashbackRate,
        
        // Lifetime statistics
        lifetimeEarned: lifetimeEarned._sum.amount 
          ? formatCurrency(
              typeof lifetimeEarned._sum.amount === 'object' && lifetimeEarned._sum.amount?.toNumber
                ? lifetimeEarned._sum.amount.toNumber()
                : Number(lifetimeEarned._sum.amount),
              shopSettings
            )
          : formatCurrency(0, shopSettings),
        lifetimeSpent: formatCurrency(totalSpent, shopSettings),
        
        // Other info
        availableRewards,
        memberSince: customer.createdAt.toISOString(),
        lastUpdated: customer.updatedAt.toISOString()
      },
      shopInfo: {
        name: shopSettings?.storeName || shop.replace('.myshopify.com', ''),
        currency: shopSettings?.storeCurrency || 'USD'
      }
    };
    
    console.log(`Successfully fetched data for customer ${customerId} from shop ${shop}`);
    
    // Return with appropriate cache headers
    return json(memberResponse, {
      headers: {
        "Cache-Control": "private, max-age=30", // Cache for 30 seconds
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Response-Time": `${Date.now() - startTime}ms`,
        "Vary": "Authorization"
      }
    });
    
  } catch (error) {
    console.error("App proxy error:", error);
    
    // Log detailed error for debugging
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    // Don't expose internal errors to client
    return json(
      { 
        error: "Service temporarily unavailable",
        message: "We're having trouble loading your rewards. Please try again later."
      },
      { 
        status: 503,
        headers: { 
          "Retry-After": "60",
          "X-Response-Time": `${Date.now() - startTime}ms`
        }
      }
    );
  }
}

// Reject non-GET requests (app proxy should only use GET)
export async function action() {
  return json(
    { error: "Method not allowed" },
    { 
      status: 405,
      headers: {
        "Allow": "GET"
      }
    }
  );
}