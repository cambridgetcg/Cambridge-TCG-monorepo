/**
 * Customer Account UI Extension - Loyalty Data API
 *
 * This endpoint provides loyalty program data to the customer account UI extension.
 *
 * AUTHENTICATION:
 * - Uses Shopify session tokens (NOT app proxy HMAC)
 * - Token provided by customer account extension via sessionToken API
 * - Validated using authenticate.public.customerAccount()
 *
 * PREVIEW MODE HANDLING:
 * - In theme/customer-account preview, Shopify sends tokens with blank dest/sub claims
 * - We decode the JWT payload first to detect this case
 * - Returns friendly "not enrolled" preview state instead of attempting authentication
 * - This avoids noisy errors from the auth helper when no real customer session exists
 *
 * SECURITY:
 * - All queries scoped to authenticated shop
 * - Customer ID verified from token sub claim
 * - Read-only access (GET only)
 * - CORS configured for Shopify domains
 *
 * DATA RETURNED:
 * - Store credit balance
 * - Current tier info
 * - Lifetime earned total
 * - Recent transaction history
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Import standardized spending calculation used by tier recalculation
interface CustomerSpending {
  customerId: string;
  shopifyCustomerId: string;
  totalSpending: number;
  orderCount: number;
  lastOrderDate: Date | null;
}

/**
 * Get customer spending from LOCAL DATABASE
 * This is the SAME calculation used by tier recalculation for consistency
 */
async function getCustomerSpendingFromDB(
  shop: string,
  customerId: string,
  evaluationPeriod: 'ANNUAL' | 'LIFETIME'
): Promise<CustomerSpending> {
  try {
    console.log(`[CustomerAccount] Getting spending from local DB for customer ${customerId}, period: ${evaluationPeriod}`);

    // Fetch all orders for manual calculation (Aurora Data API aggregates are unreliable)
    const allOrders = await db.order.findMany({
      where: {
        shop,
        customerId,
        financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
        cashbackEligible: true // Exclude tier product orders
      },
      select: {
        id: true,
        shopifyOrderName: true,
        totalPrice: true,
        totalRefunded: true,
        financialStatus: true,
        cashbackEligible: true,
        shopifyCreatedAt: true,
        createdAt: true
      }
    });

    console.log(`[CustomerAccount] Found ${allOrders.length} total orders for customer`);

    // Manual calculation of spending (more reliable than Aurora aggregates)
    let totalSpent = 0;
    let totalRefunded = 0;
    let eligibleOrderCount = 0;
    let lastOrderDate: Date | null = null;

    // Filter based on evaluation period
    const oneYearAgo = evaluationPeriod === 'ANNUAL' ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) : null;

    for (const order of allOrders) {
      // Skip if not eligible
      if (!order.cashbackEligible) {
        continue;
      }

      // Skip if wrong financial status
      if (order.financialStatus !== 'PAID' && order.financialStatus !== 'PARTIALLY_REFUNDED') {
        continue;
      }

      // Skip if outside evaluation period
      if (evaluationPeriod === 'ANNUAL' && oneYearAgo && order.shopifyCreatedAt) {
        const orderDate = new Date(order.shopifyCreatedAt);
        if (orderDate < oneYearAgo) {
          continue;
        }
      }

      // Add to totals
      const price = order.totalPrice ? parseFloat(order.totalPrice.toString()) : 0;
      const refunded = order.totalRefunded ? parseFloat(order.totalRefunded.toString()) : 0;

      totalSpent += price;
      totalRefunded += refunded;
      eligibleOrderCount++;

      // Track last order date
      if (order.shopifyCreatedAt) {
        const orderDate = new Date(order.shopifyCreatedAt);
        if (!lastOrderDate || orderDate > lastOrderDate) {
          lastOrderDate = orderDate;
        }
      }
    }

    const netSpending = totalSpent - totalRefunded;

    console.log(`[CustomerAccount] Manual calculation results:`);
    console.log(`[CustomerAccount]   - Total orders: ${allOrders.length}`);
    console.log(`[CustomerAccount]   - Eligible orders: ${eligibleOrderCount}`);
    console.log(`[CustomerAccount]   - Total spent: $${totalSpent.toFixed(2)}`);
    console.log(`[CustomerAccount]   - Total refunded: $${totalRefunded.toFixed(2)}`);
    console.log(`[CustomerAccount]   - Net spending: $${netSpending.toFixed(2)}`);

    return {
      customerId,
      shopifyCustomerId: customerId, // Already have customer ID
      totalSpending: Math.max(0, netSpending),
      orderCount: eligibleOrderCount,
      lastOrderDate: lastOrderDate
    };
  } catch (error) {
    console.error(`[CustomerAccount] Error fetching spending from DB for customer ${customerId}:`, error);

    // Return zero spending on error
    return {
      customerId,
      shopifyCustomerId: '',
      totalSpending: 0,
      orderCount: 0,
      lastOrderDate: null
    };
  }
}

// Rate limiting (simple in-memory, consider Redis for production)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(key: string, limit = 100): boolean {
  const now = Date.now();
  const entry = requestCounts.get(key);

  if (!entry || entry.resetTime < now) {
    requestCounts.set(key, { count: 1, resetTime: now + 60000 });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

function getTransactionDescription(transaction: any): string {
  const metadata = transaction.metadata as any;

  switch (transaction.type) {
    case 'CASHBACK_EARNED':
      return metadata?.orderName
        ? `Cashback from order ${metadata.orderName}`
        : 'Cashback earned';
    case 'ORDER_PAYMENT':
      return metadata?.orderName
        ? `Used for order ${metadata.orderName}`
        : 'Store credit used';
    case 'REFUND_CREDIT':
      return metadata?.orderName
        ? `Refund from order ${metadata.orderName}`
        : 'Refund credit';
    case 'MANUAL_ADJUSTMENT':
      return metadata?.reason || metadata?.note || 'Account adjustment';
    default:
      return transaction.type.replace(/_/g, ' ').toLowerCase();
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const origin = request.headers.get('origin');

  console.log(`\n[${requestId}] ========== NEW REQUEST ==========`);
  console.log(`[${requestId}] URL: ${request.url}`);
  console.log(`[${requestId}] Method: ${request.method}`);
  console.log(`[${requestId}] Origin: ${origin}`);

  // Handle OPTIONS preflight immediately
  if (request.method === 'OPTIONS') {
    console.log(`[${requestId}] OPTIONS preflight request - returning 204 with CORS headers`);
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin)
    });
  }

  // Error boundary for entire function
  try {
    // Step 0: Check if token has required claims before attempting authentication
    // In preview mode, Shopify sends a token with blank dest/sub claims
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Decode JWT payload (without verification - just to peek at claims)
        const [, payloadBase64] = token.split('.');
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64));

          // Check if required claims are present
          if (!payload.dest || !payload.sub) {
            console.log(`[${requestId}] Preview mode detected - token missing dest/sub claims`);

            // Return friendly preview state instead of error
            return json(
              {
                success: true,
                enrolled: false,
                balance: 0,
                message: "Sign in to view your membership tier and store credit balance",
                isPreview: true,
                tier: null,
                nextTier: null,
                progressToNextTier: 0,
                amountToNextTier: 0,
                totalEarned: 0,
                stats: {
                  orderCount: 0,
                  totalSpent: 0,
                  netSpent: 0,
                  averageCashbackPerOrder: 0,
                  lastOrderDate: null
                },
                allTiers: [],
                recentTransactions: [],
                currency: 'USD'
              },
              {
                status: 200,
                headers: {
                  ...getCorsHeaders(origin),
                  "Cache-Control": "no-store",
                  "X-Response-Time": `${Date.now() - startTime}ms`,
                  "X-Preview-Mode": "true"
                }
              }
            );
          }
        }
      } catch (decodeError) {
        // If we can't decode, let the auth helper handle it
        console.log(`[${requestId}] Could not decode token, proceeding with authentication`);
      }
    }

    // Step 1: Validate session token from customer account extension
    console.log(`[${requestId}] Step 1: Authenticating request...`);

    let authResult;
    try {
      authResult = await authenticate.public.customerAccount(request);
      console.log(`[${requestId}] Step 2: Authenticated successfully`);
    } catch (authError: any) {
      console.log(`[${requestId}] Authentication failed:`, authError.message || 'Unknown error');
      return json({
        error: "Authentication failed",
        message: authError.message || "Unable to authenticate customer account session"
      }, {
        status: 401,
        headers: getCorsHeaders(origin)
      });
    }

    // Extract customer and shop from session token
    const sessionToken = authResult?.sessionToken;

    if (!sessionToken) {
      console.error(`[${requestId}] No session token in auth result`);
      return json(
        { error: "Unauthorized", message: "Invalid session token" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    const customerGid = sessionToken.sub; // gid://shopify/Customer/23893043347801
    const shop = sessionToken.dest; // rewardspro-dev.myshopify.com

    console.log(`[${requestId}] Customer GID: ${customerGid}`);
    console.log(`[${requestId}] Shop: ${shop}`);

    // Validate that we have the required claims (should always be present if auth succeeded)
    if (!customerGid || !shop) {
      console.error(`[${requestId}] Missing required claims after successful authentication:`, {
        hasCustomerGid: !!customerGid,
        hasShop: !!shop
      });
      return json(
        { error: "Invalid session token", message: "Session token is missing required claims" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Step 3: Rate limiting per customer
    const rateLimitKey = `customer-account:${shop}:${customerGid}`;
    if (!checkRateLimit(rateLimitKey, 100)) {
      console.warn(`[Customer Account API] Rate limit exceeded for ${customerGid}`);
      return json(
        { error: "Too many requests", message: "Please try again in a minute" },
        {
          status: 429,
          headers: {
            ...getCorsHeaders(origin),
            "Retry-After": "60"
          }
        }
      );
    }

    // Step 4: Extract numeric customer ID from GID
    // GID format: "gid://shopify/Customer/6789012345"
    const customerId = customerGid.split('/').pop();

    if (!customerId) {
      console.error(`[Customer Account API] Invalid customer GID format: ${customerGid}`);
      return json(
        { error: "Invalid customer ID", message: "Unable to extract customer ID from token" },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    console.log(`[${requestId}] Step 4: Extracted customer ID: ${customerId}`);
    console.log(`[${requestId}] Step 5: Querying database for customer...`);
    console.log(`[${requestId}] Query params:`, { shopifyCustomerId: customerId, shop });

    // Step 5: Fetch customer from database (scoped to shop!)
    let customer;
    try {
      customer = await db.customer.findFirst({
        where: {
          shopifyCustomerId: customerId,
          shop: shop  // CRITICAL: Always scope to shop!
        }
      });
      console.log(`[${requestId}] Database query result:`, customer ? 'Customer found' : 'Customer not found');
      if (customer) {
        console.log(`[${requestId}] Customer details:`, {
          id: customer.id,
          email: customer.email,
          storeCredit: customer.storeCredit,
          currentTierId: customer.currentTierId
        });
      }
    } catch (dbError: any) {
      console.error(`[${requestId}] Database query error:`, {
        message: dbError.message,
        stack: dbError.stack,
        name: dbError.name
      });
      throw dbError;
    }

    // Step 6: Handle non-enrolled customers
    if (!customer) {
      console.log(`[${requestId}] Customer ${customerId} not enrolled in ${shop}`);
      return json(
        {
          success: true,
          enrolled: false,
          message: "You're not enrolled in the rewards program yet",
          canEnroll: true
        },
        {
          headers: {
            ...getCorsHeaders(origin),
            "Cache-Control": "private, max-age=300",
            "X-Response-Time": `${Date.now() - startTime}ms`
          }
        }
      );
    }

    // Step 7: Fetch tier information and all available tiers
    console.log(`[${requestId}] Step 7: Fetching tier information...`);
    console.log(`[${requestId}] Current tier ID:`, customer.currentTierId || 'None');

    let tier = null;
    if (customer.currentTierId) {
      tier = await db.tier.findFirst({
        where: {
          id: customer.currentTierId,
          shop: shop  // CRITICAL: Scope to shop!
        }
      });
      console.log(`[${requestId}] Current tier found:`, tier ? {
        id: tier.id,
        name: tier.name,
        cashbackPercent: tier.cashbackPercent,
        minSpend: tier.minSpend,
        evaluationPeriod: tier.evaluationPeriod
      } : 'Not found');
    }

    // Fetch all tiers sorted by minSpend to calculate next tier
    console.log(`[${requestId}] Fetching all tiers for shop...`);
    const allTiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' }
    });
    console.log(`[${requestId}] Found ${allTiers.length} tiers:`, allTiers.map(t => ({
      name: t.name,
      minSpend: t.minSpend,
      cashbackPercent: t.cashbackPercent
    })));

    // Step 8: Get customer spending stats using standardized calculation FIRST
    // This uses the SAME method as tier recalculation for consistency
    // We use the current tier's evaluation period, or LIFETIME if no tier
    console.log(`[${requestId}] Step 8: Fetching customer spending stats...`);
    const evaluationPeriod = tier?.evaluationPeriod || 'LIFETIME';
    console.log(`[${requestId}] Evaluation period: ${evaluationPeriod}`);

    const spendingStats = await getCustomerSpendingFromDB(
      shop,
      customer.id,
      evaluationPeriod
    );

    console.log(`[${requestId}] Spending stats from DB:`, {
      totalSpending: `$${spendingStats.totalSpending.toFixed(2)}`,
      orderCount: spendingStats.orderCount,
      lastOrderDate: spendingStats.lastOrderDate?.toISOString() || 'None'
    });

    // Use the standardized spending calculation for tier progress
    const currentSpending = spendingStats.totalSpending;
    console.log(`[${requestId}] Step 9: Calculating next tier and progress...`);
    console.log(`[${requestId}] Current spending (standardized): $${currentSpending.toFixed(2)}`);

    const currentTierMinSpend = tier ? (typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
      ? (tier.minSpend as any).toNumber()
      : Number(tier.minSpend)) : 0;
    console.log(`[${requestId}] Current tier min spend: $${currentTierMinSpend.toFixed(2)}`);

    const nextTier = allTiers.find(t => {
      const minSpend = typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
        ? (t.minSpend as any).toNumber()
        : Number(t.minSpend);
      return minSpend > currentTierMinSpend;
    });
    console.log(`[${requestId}] Next tier:`, nextTier ? {
      name: nextTier.name,
      minSpend: nextTier.minSpend,
      cashbackPercent: nextTier.cashbackPercent
    } : 'None (at highest tier)');

    // Calculate progress to next tier
    let progressToNextTier = 100;
    let amountToNextTier = 0;
    if (nextTier) {
      const nextTierMinSpend = typeof nextTier.minSpend === 'object' && 'toNumber' in nextTier.minSpend
        ? (nextTier.minSpend as any).toNumber()
        : Number(nextTier.minSpend);

      amountToNextTier = Math.max(0, nextTierMinSpend - currentSpending);

      const progressInTier = currentSpending - currentTierMinSpend;
      const tierRange = nextTierMinSpend - currentTierMinSpend;
      progressToNextTier = Math.min(100, Math.max(0, (progressInTier / tierRange) * 100));

      console.log(`[${requestId}] Tier progress calculation:`, {
        nextTierMinSpend: nextTierMinSpend.toFixed(2),
        amountToNextTier: amountToNextTier.toFixed(2),
        progressInTier: progressInTier.toFixed(2),
        tierRange: tierRange.toFixed(2),
        progressPercent: progressToNextTier.toFixed(1)
      });
    } else {
      console.log(`[${requestId}] Customer at highest tier - no next tier`);
    }

    // Step 10: Fetch recent transactions (last 50 for pagination in frontend)
    console.log(`[${requestId}] Step 10: Fetching recent transactions...`);
    const transactions = await db.storeCreditLedger.findMany({
      where: {
        customerId: customer.id,
        shop: shop  // CRITICAL: Scope to shop!
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    console.log(`[${requestId}] Found ${transactions.length} transactions`);

    // Step 11: Calculate lifetime earned (cashback + refunds) from ledger entries
    console.log(`[${requestId}] Step 11: Calculating lifetime earned...`);
    const totalEarned = transactions
      .filter(t => ['CASHBACK_EARNED', 'REFUND_CREDIT'].includes(t.type))
      .reduce((sum, t) => {
        const amount = typeof t.amount === 'object' && 'toNumber' in t.amount
          ? (t.amount as any).toNumber()
          : Number(t.amount);
        return sum + (amount > 0 ? amount : 0);
      }, 0);
    console.log(`[${requestId}] Total earned from ${transactions.filter(t => ['CASHBACK_EARNED', 'REFUND_CREDIT'].includes(t.type)).length} earn transactions: $${totalEarned.toFixed(2)}`);

    // Step 12: Get shop settings for currency
    console.log(`[${requestId}] Step 12: Fetching shop settings...`);
    const shopSettings = await db.shopSettings.findUnique({
      where: { shop }
    });
    console.log(`[${requestId}] Shop currency:`, shopSettings?.storeCurrency || 'USD (default)');

    // Step 13: Get actual balance from most recent ledger entry (source of truth)
    console.log(`[${requestId}] Step 13: Determining current store credit balance...`);
    const latestLedgerEntry = await db.storeCreditLedger.findFirst({
      where: {
        customerId: customer.id,
        shop: shop
      },
      orderBy: { createdAt: 'desc' }
    });

    // Use ledger balance as source of truth, fallback to customer.storeCredit
    const actualBalance = latestLedgerEntry
      ? (typeof latestLedgerEntry.balance === 'object' && 'toNumber' in latestLedgerEntry.balance
          ? (latestLedgerEntry.balance as any).toNumber()
          : Number(latestLedgerEntry.balance))
      : (typeof customer.storeCredit === 'object' && 'toNumber' in customer.storeCredit
          ? (customer.storeCredit as any).toNumber()
          : Number(customer.storeCredit));

    console.log(`[${requestId}] Balance sources:`, {
      customerStoreCreditField: typeof customer.storeCredit === 'object' ? (customer.storeCredit as any).toNumber() : Number(customer.storeCredit),
      latestLedgerBalance: latestLedgerEntry ? (typeof latestLedgerEntry.balance === 'object' ? (latestLedgerEntry.balance as any).toNumber() : Number(latestLedgerEntry.balance)) : 'No ledger entries',
      finalBalance: actualBalance.toFixed(2),
      source: latestLedgerEntry ? 'ledger' : 'customer record'
    });

    // Step 14: Format and return response
    console.log(`[${requestId}] Step 14: Formatting response data...`);
    const responseData = {
      success: true,
      enrolled: true,
      balance: actualBalance,
      tier: tier ? {
        name: tier.name,
        cashbackPercent: typeof tier.cashbackPercent === 'object' && 'toNumber' in tier.cashbackPercent
          ? (tier.cashbackPercent as any).toNumber()
          : Number(tier.cashbackPercent),
        minSpend: typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
          ? (tier.minSpend as any).toNumber()
          : Number(tier.minSpend)
      } : null,
      nextTier: nextTier ? {
        name: nextTier.name,
        cashbackPercent: typeof nextTier.cashbackPercent === 'object' && 'toNumber' in nextTier.cashbackPercent
          ? (nextTier.cashbackPercent as any).toNumber()
          : Number(nextTier.cashbackPercent),
        minSpend: typeof nextTier.minSpend === 'object' && 'toNumber' in nextTier.minSpend
          ? (nextTier.minSpend as any).toNumber()
          : Number(nextTier.minSpend)
      } : null,
      progressToNextTier,
      amountToNextTier,
      totalEarned,
      stats: {
        orderCount: spendingStats.orderCount, // From standardized calculation
        totalSpent: spendingStats.totalSpending, // From standardized calculation
        netSpent: spendingStats.totalSpending, // Same as totalSpent (already net of refunds)
        averageCashbackPerOrder: spendingStats.orderCount > 0 ? totalEarned / spendingStats.orderCount : 0,
        lastOrderDate: spendingStats.lastOrderDate?.toISOString() || null
      },
      allTiers: allTiers.map(t => ({
        name: t.name,
        cashbackPercent: typeof t.cashbackPercent === 'object' && 'toNumber' in t.cashbackPercent
          ? (t.cashbackPercent as any).toNumber()
          : Number(t.cashbackPercent),
        minSpend: typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
          ? (t.minSpend as any).toNumber()
          : Number(t.minSpend)
      })),
      recentTransactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: typeof t.amount === 'object' && 'toNumber' in t.amount
          ? (t.amount as any).toNumber()
          : Number(t.amount),
        date: t.createdAt.toISOString(),
        description: getTransactionDescription(t)
      })),
      currency: shopSettings?.storeCurrency || 'USD'
    };

    console.log(`[${requestId}] ========== RESPONSE SUMMARY ==========`);
    console.log(`[${requestId}] Success: true`);
    console.log(`[${requestId}] Balance: $${actualBalance.toFixed(2)}`);
    console.log(`[${requestId}] Current tier: ${tier?.name || 'None'}`);
    console.log(`[${requestId}] Next tier: ${nextTier?.name || 'None'}`);
    console.log(`[${requestId}] Progress to next: ${progressToNextTier.toFixed(1)}%`);
    console.log(`[${requestId}] Amount to next tier: $${amountToNextTier.toFixed(2)}`);
    console.log(`[${requestId}] Total earned: $${totalEarned.toFixed(2)}`);
    console.log(`[${requestId}] Order count: ${spendingStats.orderCount}`);
    console.log(`[${requestId}] Total spent: $${spendingStats.totalSpending.toFixed(2)}`);
    console.log(`[${requestId}] Transaction count: ${transactions.length}`);
    console.log(`[${requestId}] Response time: ${Date.now() - startTime}ms`);
    console.log(`[${requestId}] ========== REQUEST COMPLETE ==========`);

    return json(responseData, {
      headers: {
        ...getCorsHeaders(origin),
        "Cache-Control": "private, max-age=60",  // Cache for 1 minute
        "X-Response-Time": `${Date.now() - startTime}ms`
      }
    });

  } catch (error: any) {
    console.error(`[${requestId}] ========== UNHANDLED ERROR ==========`);
    console.error(`[${requestId}] Error type:`, error?.constructor?.name || 'Unknown');
    console.error(`[${requestId}] Error message:`, error?.message || 'No message');
    console.error(`[${requestId}] Error stack:`, error?.stack || 'No stack trace');

    // Try to stringify the error object
    try {
      console.error(`[${requestId}] Error details:`, JSON.stringify(error, null, 2));
    } catch (e) {
      console.error(`[${requestId}] Error details: [Unable to stringify]`);
    }

    // Check if error is from authentication
    if (error?.message?.includes('Unauthorized') || error?.status === 401) {
      return json(
        { error: "Authentication failed", message: "Invalid or expired session token" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Generic server error with more details in development
    return json(
      {
        error: "Internal server error",
        message: error?.message || "Failed to load loyalty data",
        details: process.env.NODE_ENV === 'development' ? {
          type: error?.constructor?.name,
          message: error?.message,
          stack: error?.stack?.split('\n').slice(0, 5)
        } : undefined
      },
      {
        status: 500,
        headers: getCorsHeaders(origin)
      }
    );
  }
}

// CORS headers for customer account extensions
function getCorsHeaders(origin?: string | null) {
  // Customer account extensions are served from extensions.shopifycdn.com
  // We need to allow credentials (for session tokens in Authorization header)
  const allowedOrigins = [
    'https://extensions.shopifycdn.com',
    'https://shopify.com',
    'https://admin.shopify.com'
  ];

  // Check if the request origin is allowed
  const isAllowed = origin && allowedOrigins.some(allowed =>
    origin === allowed || origin.endsWith('.shopifycdn.com') || origin.endsWith('.shopify.com')
  );

  return {
    // Must specify exact origin (not *) when using credentials
    "Access-Control-Allow-Origin": isAllowed ? origin! : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true", // Required for session tokens
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

// OPTIONS requests are handled in the loader function above
