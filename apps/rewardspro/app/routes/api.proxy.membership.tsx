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

function getTransactionDescription(type: string, metadata: any): string {
  switch (type) {
    case 'CASHBACK_EARNED':
      return metadata?.orderName 
        ? `Cashback earned on order ${metadata.orderName}`
        : 'Cashback earned';
    case 'ORDER_PAYMENT':
      return metadata?.orderName
        ? `Store credit used for order ${metadata.orderName}`
        : 'Store credit used';
    case 'REFUND_CREDIT':
      return metadata?.orderName
        ? `Refund for order ${metadata.orderName}`
        : 'Store credit refund';
    case 'MANUAL_ADJUSTMENT':
      return metadata?.reason || 'Manual adjustment';
    case 'SHOPIFY_SYNC':
      return 'Balance sync';
    default:
      return type.replace(/_/g, ' ').toLowerCase();
  }
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
    
    // Calculate how much store credit has been used (spent)
    const storeCreditUsed = await db.storeCreditLedger.aggregate({
      where: {
        customerId: customer.id,
        shop: shop,
        type: "ORDER_PAYMENT"
      },
      _sum: {
        amount: true
      }
    });
    
    // Step 10: Calculate lifetime spent from order metadata
    // We need to get the actual order amounts from the metadata field
    const cashbackEntries = await db.storeCreditLedger.findMany({
      where: {
        customerId: customer.id,
        shop: shop,
        type: "CASHBACK_EARNED"
      },
      select: {
        metadata: true
      }
    });
    
    // Sum up the actual order amounts from metadata
    let totalSpent = 0;
    for (const entry of cashbackEntries) {
      const metadata = entry.metadata as any;
      // Check both orderTotal (new) and orderAmount (legacy) fields
      if (metadata) {
        const amount = metadata.orderTotal || metadata.orderAmount;
        if (amount) {
          totalSpent += parseFloat(amount) || 0;
        }
      }
    }
    
    // If no order amounts in metadata, fallback to estimate from cashback
    // This is only for backwards compatibility with old data
    if (totalSpent === 0 && lifetimeEarned._sum.amount) {
      const earnedValue = typeof lifetimeEarned._sum.amount === 'object' && lifetimeEarned._sum.amount?.toNumber
        ? lifetimeEarned._sum.amount.toNumber()
        : Number(lifetimeEarned._sum.amount);
      
      // Estimate based on average cashback rate (fallback only)
      totalSpent = currentTier?.cashbackPercent 
        ? (earnedValue / currentTier.cashbackPercent) * 100
        : earnedValue * 10; // Assume 10% if no tier
    }
    
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
    
    // Step 12: Get recent transaction history
    const recentTransactions = await db.storeCreditLedger.findMany({
      where: {
        customerId: customer.id,
        shop: shop
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10 // Last 10 transactions
    });
    
    // Format transactions for display
    const formattedTransactions = recentTransactions.map(tx => {
      const metadata = tx.metadata as any;
      const amountValue = typeof tx.amount === 'object' && tx.amount?.toNumber 
        ? tx.amount.toNumber() 
        : Number(tx.amount);
      const balanceValue = typeof tx.balance === 'object' && tx.balance?.toNumber 
        ? tx.balance.toNumber() 
        : Number(tx.balance);
      
      return {
        id: tx.id,
        type: tx.type,
        amount: formatCurrency(Math.abs(amountValue), shopSettings),
        amountRaw: amountValue,
        balance: formatCurrency(balanceValue, shopSettings),
        balanceRaw: balanceValue,
        description: metadata?.description || getTransactionDescription(tx.type, metadata),
        orderName: metadata?.orderName,
        orderId: metadata?.orderId || tx.shopifyOrderId,
        date: tx.createdAt.toISOString(),
        formattedDate: new Date(tx.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      };
    });
    
    // Step 13: Count available rewards (placeholder - implement based on your rewards system)
    // Handle storeCredit as either a Decimal object or a number
    const storeCreditValue = typeof customer.storeCredit === 'object' && customer.storeCredit?.toNumber 
      ? customer.storeCredit.toNumber() 
      : Number(customer.storeCredit);
    
    const availableRewards = storeCreditValue > 0 ? 1 : 0;
    
    // Step 14: Build and return member response
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
        // Total spent should show actual order values, not store credit used
        lifetimeSpent: formatCurrency(totalSpent, shopSettings),
        // Store credit used/redeemed
        storeCreditRedeemed: storeCreditUsed._sum.amount
          ? formatCurrency(
              Math.abs(typeof storeCreditUsed._sum.amount === 'object' && storeCreditUsed._sum.amount?.toNumber
                ? storeCreditUsed._sum.amount.toNumber()
                : Number(storeCreditUsed._sum.amount)),
              shopSettings
            )
          : formatCurrency(0, shopSettings),
        
        // Other info
        availableRewards,
        memberSince: customer.createdAt.toISOString(),
        lastUpdated: customer.updatedAt.toISOString(),
        
        // Transaction history
        transactions: formattedTransactions
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