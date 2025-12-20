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

// ============================================================================
// Configurable Logging
// ============================================================================

const LOG_LEVEL = process.env.CUSTOMER_ACCOUNT_LOG_LEVEL || 'error';
const isDebugLogging = LOG_LEVEL === 'debug';
const isInfoLogging = LOG_LEVEL === 'info' || isDebugLogging;

const log = {
  debug: (...args: unknown[]) => isDebugLogging && console.log('[CustomerAccount]', ...args),
  info: (...args: unknown[]) => isInfoLogging && console.log('[CustomerAccount]', ...args),
  warn: (...args: unknown[]) => console.warn('[CustomerAccount]', ...args),
  error: (...args: unknown[]) => console.error('[CustomerAccount]', ...args),
};

// ============================================================================
// Types
// ============================================================================

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
    log.debug(`Getting spending from local DB for customer ${customerId}, period: ${evaluationPeriod}`);

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

    log.debug(`Found ${allOrders.length} total orders for customer`);

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

    log.debug('Manual calculation results:', {
      totalOrders: allOrders.length,
      eligibleOrders: eligibleOrderCount,
      totalSpent: totalSpent.toFixed(2),
      totalRefunded: totalRefunded.toFixed(2),
      netSpending: netSpending.toFixed(2)
    });

    return {
      customerId,
      shopifyCustomerId: customerId, // Already have customer ID
      totalSpending: Math.max(0, netSpending),
      orderCount: eligibleOrderCount,
      lastOrderDate: lastOrderDate
    };
  } catch (error) {
    log.error(`Error fetching spending from DB for customer ${customerId}:`, error);

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

/**
 * Generate a list of benefits based on tier cashback percentage
 * In the future, this could be configured per-tier in the database
 */
function generateBenefitsList(cashbackPercent: number, isMaxTier: boolean): string[] {
  const benefits: string[] = [];

  // Core benefit - cashback
  benefits.push(`${cashbackPercent}% cashback on every order`);

  // Add more benefits based on tier level
  if (cashbackPercent >= 2) {
    benefits.push('Member-only promotions');
  }

  if (cashbackPercent >= 5) {
    benefits.push('Early access to new products');
  }

  if (cashbackPercent >= 7) {
    benefits.push('Priority customer support');
  }

  if (isMaxTier) {
    benefits.push('Exclusive VIP perks');
  }

  return benefits;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const origin = request.headers.get('origin');

  log.debug(`[${requestId}] New request:`, {
    url: request.url,
    method: request.method,
    origin
  });

  // Handle OPTIONS preflight immediately
  if (request.method === 'OPTIONS') {
    log.debug(`[${requestId}] OPTIONS preflight`);
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
            log.debug(`[${requestId}] Preview mode detected - token missing dest/sub claims`);

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
        log.debug(`[${requestId}] Could not decode token, proceeding with authentication`);
      }
    }

    // Step 1: Validate session token from customer account extension
    log.debug(`[${requestId}] Authenticating request...`);

    let authResult;
    try {
      authResult = await authenticate.public.customerAccount(request);
      log.debug(`[${requestId}] Authenticated successfully`);
    } catch (authError: any) {
      log.info(`[${requestId}] Authentication failed:`, authError.message || 'Unknown error');
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
      log.error(`[${requestId}] No session token in auth result`);
      return json(
        { error: "Unauthorized", message: "Invalid session token" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    const customerGid = sessionToken.sub; // gid://shopify/Customer/23893043347801
    const shop = sessionToken.dest; // rewardspro-dev.myshopify.com

    log.debug(`[${requestId}] Customer: ${customerGid}, Shop: ${shop}`);

    // Validate that we have the required claims (should always be present if auth succeeded)
    if (!customerGid || !shop) {
      log.error(`[${requestId}] Missing required claims after successful authentication`);
      return json(
        { error: "Invalid session token", message: "Session token is missing required claims" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Step 3: Rate limiting per customer
    const rateLimitKey = `customer-account:${shop}:${customerGid}`;
    if (!checkRateLimit(rateLimitKey, 100)) {
      log.warn(`[${requestId}] Rate limit exceeded for ${customerGid}`);
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
      log.error(`[${requestId}] Invalid customer GID format: ${customerGid}`);
      return json(
        { error: "Invalid customer ID", message: "Unable to extract customer ID from token" },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    log.debug(`[${requestId}] Extracted customer ID: ${customerId}`);

    // Step 5: Fetch customer with tier AND tier state included (optimized single query)
    let customer;
    try {
      customer = await db.customer.findFirst({
        where: {
          shopifyCustomerId: customerId,
          shop: shop  // CRITICAL: Always scope to shop!
        },
        include: {
          currentTier: true,  // Include tier in same query
          tierState: {        // Include tier state for source information
            include: {
              effectiveTier: true,
              nextTier: true
            }
          },
          currentSubscription: true  // Include active subscription for renewal info
        }
      });
      log.debug(`[${requestId}] Customer lookup:`, customer ? 'found' : 'not found');
    } catch (dbError: any) {
      log.error(`[${requestId}] Database query error:`, dbError.message);
      throw dbError;
    }

    // Step 6: Handle non-enrolled customers
    if (!customer) {
      log.info(`[${requestId}] Customer ${customerId} not enrolled`);
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

    // Use tier from the included relation (already fetched with customer)
    const tier = customer.currentTier;
    log.debug(`[${requestId}] Current tier:`, tier?.name || 'None');

    // Step 7: Fetch all tiers sorted by minSpend to calculate next tier
    const allTiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' }
    });
    log.debug(`[${requestId}] Found ${allTiers.length} tiers`);

    // Step 8: Get customer spending stats using standardized calculation
    // This uses the SAME method as tier recalculation for consistency
    const evaluationPeriod = tier?.evaluationPeriod || 'LIFETIME';

    const spendingStats = await getCustomerSpendingFromDB(
      shop,
      customer.id,
      evaluationPeriod
    );

    log.debug(`[${requestId}] Spending: $${spendingStats.totalSpending.toFixed(2)}, Orders: ${spendingStats.orderCount}`);

    // Use the standardized spending calculation for tier progress
    const currentSpending = spendingStats.totalSpending;

    const currentTierMinSpend = tier ? (typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
      ? (tier.minSpend as any).toNumber()
      : Number(tier.minSpend)) : 0;

    const nextTier = allTiers.find(t => {
      const minSpend = typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
        ? (t.minSpend as any).toNumber()
        : Number(t.minSpend);
      return minSpend > currentTierMinSpend;
    });

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
    }

    log.debug(`[${requestId}] Next tier: ${nextTier?.name || 'none'}, Progress: ${progressToNextTier.toFixed(0)}%`);

    // Step 10-13: Batch fetch transactions, shop settings, tier purchase, and orders (parallel)
    const [transactions, shopSettings, activeTierPurchase, recentOrders] = await Promise.all([
      // Transactions (last 50 for pagination in frontend)
      db.storeCreditLedger.findMany({
        where: {
          customerId: customer.id,
          shop: shop  // CRITICAL: Scope to shop!
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          order: {
            select: {
              shopifyOrderName: true,
              shopifyOrderNumber: true
            }
          }
        }
      }),
      // Shop settings for currency
      db.shopSettings.findUnique({
        where: { shop }
      }),
      // Active tier purchase (for expiration info)
      db.tierPurchase.findFirst({
        where: {
          customerId: customer.id,
          shop: shop,
          status: 'ACTIVE',
          OR: [
            { endDate: null },  // Lifetime
            { endDate: { gte: new Date() } }  // Not expired
          ]
        },
        include: {
          tier: true
        }
      }),
      // Recent orders for enhanced transaction context
      db.order.findMany({
        where: {
          customerId: customer.id,
          shop: shop
        },
        orderBy: { shopifyCreatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          shopifyOrderId: true,
          shopifyOrderName: true,
          shopifyOrderNumber: true
        }
      })
    ]);

    log.debug(`[${requestId}] Fetched ${transactions.length} transactions`);

    // Calculate lifetime earned (cashback + refunds) from ledger entries
    const totalEarned = transactions
      .filter(t => ['CASHBACK_EARNED', 'REFUND_CREDIT'].includes(t.type))
      .reduce((sum, t) => {
        const amount = typeof t.amount === 'object' && 'toNumber' in t.amount
          ? (t.amount as any).toNumber()
          : Number(t.amount);
        return sum + (amount > 0 ? amount : 0);
      }, 0);

    // Get actual balance from most recent ledger entry (source of truth)
    // Since we already fetched transactions ordered by date, the first one is the latest
    const latestLedgerEntry = transactions.length > 0 ? transactions[0] : null;

    // Use ledger balance as source of truth, fallback to customer.storeCredit
    const actualBalance = latestLedgerEntry
      ? (typeof latestLedgerEntry.balance === 'object' && 'toNumber' in latestLedgerEntry.balance
          ? (latestLedgerEntry.balance as any).toNumber()
          : Number(latestLedgerEntry.balance))
      : (typeof customer.storeCredit === 'object' && 'toNumber' in customer.storeCredit
          ? (customer.storeCredit as any).toNumber()
          : Number(customer.storeCredit));

    log.debug(`[${requestId}] Balance: $${actualBalance.toFixed(2)}, Total earned: $${totalEarned.toFixed(2)}`);

    // Determine tier source from CustomerTierState
    const tierState = customer.tierState;
    const tierSource = tierState?.tierSource || 'SPENDING_BASED';

    // Determine if max tier
    const isMaxTier = !nextTier || (tierState?.isMaxTier ?? false);

    // Build tier source details based on source type
    let tierSourceDetails: Record<string, any> | undefined;

    if (tierSource === 'TIER_SUBSCRIPTION' && customer.currentSubscription) {
      const sub = customer.currentSubscription;
      tierSourceDetails = {
        type: 'subscription',
        nextBillingDate: sub.nextBillingDate?.toISOString() || null,
        billingInterval: sub.billingInterval || 'MONTHLY',
        status: sub.status
      };
    } else if (tierSource === 'TIER_PURCHASE' && activeTierPurchase) {
      tierSourceDetails = {
        type: 'purchase',
        expiresAt: activeTierPurchase.endDate?.toISOString() || null,
        isLifetime: !activeTierPurchase.endDate
      };
    } else if (tierSource === 'MANUAL_OVERRIDE' && tierState?.hasManualOverride) {
      tierSourceDetails = {
        type: 'manual',
        expiresAt: tierState.manualOverrideExpiry?.toISOString() || null,
        note: tierState.manualOverrideNote || null
      };
    } else {
      tierSourceDetails = {
        type: 'spending',
        annualSpend: currentSpending,
        evaluationPeriod: evaluationPeriod
      };
    }

    // Generate benefits list based on tier
    const tierCashbackPercent = tier
      ? (typeof tier.cashbackPercent === 'object' && 'toNumber' in tier.cashbackPercent
          ? (tier.cashbackPercent as any).toNumber()
          : Number(tier.cashbackPercent))
      : 0;

    const benefits = generateBenefitsList(tierCashbackPercent, isMaxTier);

    // Create order lookup map for enhanced transaction descriptions
    const orderMap = new Map(recentOrders.map(o => [o.id, o]));

    // Format and return response
    const responseData = {
      success: true,
      enrolled: true,

      // NEW: Customer personalization
      customer: {
        firstName: customer.firstName || null,
        lastName: customer.lastName || null,
        memberSince: customer.createdAt.toISOString(),
        tags: customer.tags ? customer.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      },

      // Balance information (compact format)
      balance: {
        current: actualBalance,
        lifetimeEarned: totalEarned
      },

      // Enhanced tier information
      tier: tier ? {
        id: tier.id,
        name: tier.name,
        icon: tier.icon || '⭐',
        color: tier.color || '#FFD700',
        cashbackPercent: tierCashbackPercent,
        minSpend: typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
          ? (tier.minSpend as any).toNumber()
          : Number(tier.minSpend),
        source: tierSource,
        sourceDetails: tierSourceDetails
      } : null,

      // Benefits list
      benefits,

      // Progress information
      progress: {
        nextTierName: nextTier?.name || null,
        nextTierCashback: nextTier
          ? (typeof nextTier.cashbackPercent === 'object' && 'toNumber' in nextTier.cashbackPercent
              ? (nextTier.cashbackPercent as any).toNumber()
              : Number(nextTier.cashbackPercent))
          : null,
        percent: progressToNextTier,
        amountRemaining: amountToNextTier,
        isMaxTier
      },

      // Stats
      stats: {
        orderCount: spendingStats.orderCount,
        totalSpent: spendingStats.totalSpending,
        lastOrderDate: spendingStats.lastOrderDate?.toISOString() || null
      },

      // All tiers for comparison
      allTiers: allTiers.map(t => {
        const tMinSpend = typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
          ? (t.minSpend as any).toNumber()
          : Number(t.minSpend);
        return {
          id: t.id,
          name: t.name,
          icon: t.icon || '⭐',
          cashbackPercent: typeof t.cashbackPercent === 'object' && 'toNumber' in t.cashbackPercent
            ? (t.cashbackPercent as any).toNumber()
            : Number(t.cashbackPercent),
          minSpend: tMinSpend,
          isCurrentTier: tier?.id === t.id,
          isAchieved: currentSpending >= tMinSpend
        };
      }),

      // Enhanced recent transactions with order info
      recentTransactions: transactions.map(t => {
        const order = t.orderId ? orderMap.get(t.orderId) : null;
        return {
          id: t.id,
          type: t.type,
          amount: typeof t.amount === 'object' && 'toNumber' in t.amount
            ? (t.amount as any).toNumber()
            : Number(t.amount),
          date: t.createdAt.toISOString(),
          description: getTransactionDescription(t),
          orderNumber: order?.shopifyOrderName || (t as any).order?.shopifyOrderName || null
        };
      }),

      currency: shopSettings?.storeCurrency || 'USD',

      // Legacy fields for backward compatibility
      totalEarned,
      progressToNextTier,
      amountToNextTier,
      nextTier: nextTier ? {
        name: nextTier.name,
        cashbackPercent: typeof nextTier.cashbackPercent === 'object' && 'toNumber' in nextTier.cashbackPercent
          ? (nextTier.cashbackPercent as any).toNumber()
          : Number(nextTier.cashbackPercent),
        minSpend: typeof nextTier.minSpend === 'object' && 'toNumber' in nextTier.minSpend
          ? (nextTier.minSpend as any).toNumber()
          : Number(nextTier.minSpend)
      } : null
    };

    const responseTime = Date.now() - startTime;
    log.info(`[${requestId}] Success: ${tier?.name || 'No tier'}, Balance: $${actualBalance.toFixed(2)}, ${responseTime}ms`);

    return json(responseData, {
      headers: {
        ...getCorsHeaders(origin),
        // Extended cache with stale-while-revalidate for better performance
        "Cache-Control": "private, max-age=120, stale-while-revalidate=60",
        "X-Response-Time": `${responseTime}ms`
      }
    });

  } catch (error: any) {
    log.error(`[${requestId}] Unhandled error:`, error?.message || 'Unknown error');

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
