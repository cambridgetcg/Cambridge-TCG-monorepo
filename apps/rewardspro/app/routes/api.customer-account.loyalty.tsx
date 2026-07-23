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
import prisma from "../db.server";
import { customerActionRateLimit } from "~/utils/rate-limiter-redis";

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
 * Map tier change trigger type to a user-friendly reason
 */
function mapTriggerTypeToReason(triggerType: string): string {
  switch (triggerType) {
    case 'SPENDING_MILESTONE': return 'spending';
    case 'PRODUCT_PURCHASE': return 'purchase';
    case 'SUBSCRIPTION_STARTED': return 'subscription';
    case 'SUBSCRIPTION_CANCELLED': return 'subscription_ended';
    case 'SUBSCRIPTION_EXPIRED': return 'subscription_ended';
    case 'PURCHASE_EXPIRED': return 'purchase_expired';
    case 'MANUAL_ADMIN': return 'special';
    case 'PERIODIC_REVIEW': return 'review';
    case 'ACCOUNT_CREATED': return 'new_account';
    default: return 'other';
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

    // Step 3: Rate limiting per customer - using Redis-backed rate limiter
    const rateLimitResponse = await customerActionRateLimit(request, customerGid);
    if (rateLimitResponse) {
      log.warn(`[${requestId}] Rate limit exceeded for ${customerGid}`);
      // Add CORS headers to the rate limit response
      const headers = new Headers(rateLimitResponse.headers);
      Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => {
        headers.set(key, value);
      });
      return new Response(rateLimitResponse.body, {
        status: rateLimitResponse.status,
        statusText: rateLimitResponse.statusText,
        headers
      });
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
      customer = await prisma.customer.findFirst({
        where: {
          shopifyCustomerId: customerId,
          shop: shop  // CRITICAL: Always scope to shop!
        },
        include: {
          currentTier: true,  // Include tier in same query
          tierState: true,    // DATA API COMPATIBLE: Removed nested include (effectiveTier/nextTier found via allTiers)
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
    const tierState = customer.tierState;
    log.debug(`[${requestId}] Current tier:`, tier?.name || 'None');
    log.debug(`[${requestId}] TierState cached:`, tierState ? 'yes' : 'no');

    // Step 7: Fetch all tiers sorted by minSpend (needed for allTiers display and dual progress)
    const allTiers = await prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' }
    });
    log.debug(`[${requestId}] Found ${allTiers.length} tiers`);

    // =========================================================================
    // OPTIMIZATION: Use pre-computed values from Customer and CustomerTierState
    // instead of scanning all orders and recalculating progress
    // =========================================================================

    // Use cached spending from Customer model (updated on order events)
    const currentSpending = Number(customer.netSpent || 0);
    const spendingStats = {
      totalSpending: currentSpending,
      orderCount: customer.orderCount || 0,
      lastOrderDate: customer.lastOrderDate
    };

    log.debug(`[${requestId}] Cached spending: $${currentSpending.toFixed(2)}, Orders: ${spendingStats.orderCount}`);

    // Use pre-computed progress from CustomerTierState if available and fresh
    // Fallback to calculation if stale (> 1 hour) or missing
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const progressAge = tierState?.progressCalculatedAt
      ? Date.now() - new Date(tierState.progressCalculatedAt).getTime()
      : Infinity;
    const usesCachedProgress = tierState && progressAge < ONE_HOUR_MS;

    let progressToNextTier: number;
    let amountToNextTier: number;
    let nextTier: typeof allTiers[0] | undefined;
    let isMaxTier: boolean;

    if (usesCachedProgress && tierState) {
      // FAST PATH: Use pre-computed values from CustomerTierState
      progressToNextTier = tierState.progressPercent || 0;
      amountToNextTier = Number(tierState.amountToNextTier || 0);
      isMaxTier = tierState.isMaxTier || false;
      nextTier = tierState.nextTierId
        ? allTiers.find(t => t.id === tierState.nextTierId)
        : undefined;

      log.debug(`[${requestId}] Using CACHED progress (age: ${Math.round(progressAge / 1000)}s)`);
    } else {
      // SLOW PATH: Calculate progress (fallback for stale/missing data)
      log.debug(`[${requestId}] Calculating progress (no cache or stale)`);

      const currentTierMinSpend = tier ? (typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
        ? (tier.minSpend as any).toNumber()
        : Number(tier.minSpend)) : 0;

      nextTier = allTiers.find(t => {
        const minSpend = typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
          ? (t.minSpend as any).toNumber()
          : Number(t.minSpend);
        return minSpend > currentTierMinSpend;
      });

      isMaxTier = !nextTier;
      progressToNextTier = 100;
      amountToNextTier = 0;

      if (nextTier) {
        const nextTierMinSpend = typeof nextTier.minSpend === 'object' && 'toNumber' in nextTier.minSpend
          ? (nextTier.minSpend as any).toNumber()
          : Number(nextTier.minSpend);

        amountToNextTier = Math.max(0, nextTierMinSpend - currentSpending);

        const progressInTier = currentSpending - currentTierMinSpend;
        const tierRange = nextTierMinSpend - currentTierMinSpend;
        progressToNextTier = tierRange > 0
          ? Math.min(100, Math.max(0, (progressInTier / tierRange) * 100))
          : 100;
      }
    }

    log.debug(`[${requestId}] Next tier: ${nextTier?.name || 'none'}, Progress: ${progressToNextTier.toFixed(0)}%`);

    // Step 10-13: Batch fetch transactions, shop settings, tier purchase, orders, pending cashback, and tier changes (parallel)
    const [transactions, shopSettings, activeTierPurchase, recentOrders, pendingCashbackOrders, recentTierChangeLog, tierUpgradeProducts] = await Promise.all([
      // Transactions (last 50 for pagination in frontend)
      prisma.storeCreditLedger.findMany({
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
      prisma.shopSettings.findUnique({
        where: { shop }
      }),
      // Active tier purchase (for expiration info)
      prisma.tierPurchase.findFirst({
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
      prisma.order.findMany({
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
      }),
      // Pending cashback: Orders that are paid but cashback not yet credited
      prisma.order.findMany({
        where: {
          customerId: customer.id,
          shop: shop,
          financialStatus: 'PAID',
          cashbackProcessed: false,
          cashbackEligible: true,
          cashbackAmount: { not: null }
        },
        orderBy: { shopifyCreatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          shopifyOrderName: true,
          cashbackAmount: true,
          shopifyCreatedAt: true
        }
      }),
      // Recent tier change (within last 7 days) for celebration/alert banners
      prisma.tierChangeLog.findFirst({
        where: {
          customerId: customer.id,
          shop: shop,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { createdAt: 'desc' },
        select: {
          fromTierName: true,
          toTierName: true,
          changeType: true,
          triggerType: true,
          createdAt: true
        }
      }),
      // Tier products for upgrade options (tiers higher than current)
      prisma.tierProduct.findMany({
        where: {
          shop,
          deletedAt: null,
          isActive: true,
          tier: {
            isActive: true,
            minSpend: { gt: tier?.minSpend || 0 }
          }
        },
        select: {
          id: true,
          productHandle: true,
          duration: true,
          price: true,
          currency: true,
          tier: {
            select: {
              id: true,
              name: true,
              cashbackPercent: true,
              minSpend: true,
              icon: true,
              color: true
            }
          }
        },
        orderBy: {
          tier: { minSpend: 'asc' } as any
        },
        take: 6 // Max 2 tiers x 3 durations = 6 products
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

    // Determine tier source from CustomerTierState (tierState already defined above)
    const tierSource = tierState?.tierSource || 'SPENDING_BASED';

    // isMaxTier is already determined above in the progress calculation

    // Build tier source details based on source type
    let tierSourceDetails: Record<string, any> | undefined;

    if (tierSource === 'TIER_SUBSCRIPTION' && customer.currentSubscription) {
      const sub = customer.currentSubscription;
      const nextBillingDate = sub.nextBillingDate;
      const daysRemaining = nextBillingDate
        ? Math.max(0, Math.ceil((nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;
      tierSourceDetails = {
        type: 'subscription',
        nextBillingDate: nextBillingDate?.toISOString() || null,
        billingInterval: sub.billingInterval || 'MONTHLY',
        status: sub.status,
        daysRemaining,
        expiryType: 'renewal',
        willAutoRenew: sub.status === 'ACTIVE'
      };
    } else if (tierSource === 'TIER_PURCHASE' && activeTierPurchase) {
      const expiresAt = activeTierPurchase.endDate;
      const daysRemaining = expiresAt
        ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;
      tierSourceDetails = {
        type: 'purchase',
        expiresAt: expiresAt?.toISOString() || null,
        isLifetime: !expiresAt,
        daysRemaining,
        expiryType: expiresAt ? 'expiration' : 'none',
        willAutoRenew: false
      };
    } else if (tierSource === 'MANUAL_OVERRIDE' && tierState?.hasManualOverride) {
      const expiresAt = tierState.manualOverrideExpiry;
      const daysRemaining = expiresAt
        ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;
      tierSourceDetails = {
        type: 'manual',
        expiresAt: expiresAt?.toISOString() || null,
        note: tierState.manualOverrideNote || null,
        daysRemaining,
        expiryType: expiresAt ? 'expiration' : 'none',
        willAutoRenew: false
      };
    } else {
      tierSourceDetails = {
        type: 'spending',
        annualSpend: currentSpending,
        evaluationPeriod: (tier as any)?.evaluationPeriod || 'LIFETIME',
        daysRemaining: null,
        expiryType: 'none',
        willAutoRenew: false
      };
    }

    // Generate benefits list based on tier
    const tierCashbackPercent = tier
      ? (typeof tier.cashbackPercent === 'object' && 'toNumber' in tier.cashbackPercent
          ? (tier.cashbackPercent as any).toNumber()
          : Number(tier.cashbackPercent))
      : 0;

    const benefits = generateBenefitsList(tierCashbackPercent, isMaxTier);

    // =========================================================================
    // Calculate spending-based tier progress (for dual progress display)
    // This is calculated for ALL customers, even those with subscription/purchase tiers
    // =========================================================================
    let spendingProgress: {
      spendingBasedTierId: string | null;
      spendingBasedTierName: string | null;
      spendingBasedCashback: number | null;
      currentSpending: number;
      nextSpendingTierName: string | null;
      nextSpendingTierMinSpend: number | null;
      progressToNextSpendingTier: number;
      amountToNextSpendingTier: number;
      wouldDowngradeOnExpiry: boolean;
    } | null = null;

    // Only calculate if customer has non-spending tier source (subscription, purchase, manual)
    if (tierSource !== 'SPENDING_BASED' && tierSource !== 'NONE' && tierSource !== 'DEFAULT_BASE_TIER') {
      // Find the highest tier the customer qualifies for based on spending alone
      const qualifyingTiers = allTiers
        .filter(t => {
          const minSpend = typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
            ? (t.minSpend as any).toNumber()
            : Number(t.minSpend);
          return currentSpending >= minSpend;
        })
        .sort((a, b) => {
          const aMinSpend = typeof a.minSpend === 'object' && 'toNumber' in a.minSpend
            ? (a.minSpend as any).toNumber()
            : Number(a.minSpend);
          const bMinSpend = typeof b.minSpend === 'object' && 'toNumber' in b.minSpend
            ? (b.minSpend as any).toNumber()
            : Number(b.minSpend);
          return bMinSpend - aMinSpend; // Sort descending by minSpend
        });

      const spendingBasedTier = qualifyingTiers.length > 0 ? qualifyingTiers[0] : null;

      // Find the next tier above the spending-based tier
      const spendingBasedMinSpend = spendingBasedTier
        ? (typeof spendingBasedTier.minSpend === 'object' && 'toNumber' in spendingBasedTier.minSpend
            ? (spendingBasedTier.minSpend as any).toNumber()
            : Number(spendingBasedTier.minSpend))
        : 0;

      const nextSpendingTier = allTiers.find(t => {
        const minSpend = typeof t.minSpend === 'object' && 'toNumber' in t.minSpend
          ? (t.minSpend as any).toNumber()
          : Number(t.minSpend);
        return minSpend > spendingBasedMinSpend;
      });

      // Calculate progress to next spending tier
      let progressToNextSpendingTier = 100;
      let amountToNextSpendingTier = 0;
      let nextSpendingTierMinSpend: number | null = null;

      if (nextSpendingTier) {
        nextSpendingTierMinSpend = typeof nextSpendingTier.minSpend === 'object' && 'toNumber' in nextSpendingTier.minSpend
          ? (nextSpendingTier.minSpend as any).toNumber()
          : Number(nextSpendingTier.minSpend);

        amountToNextSpendingTier = Math.max(0, nextSpendingTierMinSpend! - currentSpending);

        const progressInTier = currentSpending - spendingBasedMinSpend;
        const tierRange = nextSpendingTierMinSpend! - spendingBasedMinSpend;
        progressToNextSpendingTier = tierRange > 0
          ? Math.min(100, Math.max(0, (progressInTier / tierRange) * 100))
          : 100;
      }

      // Determine if customer would downgrade when their subscription/purchase expires
      const currentTierCashback = tierCashbackPercent;
      const spendingTierCashback = spendingBasedTier
        ? (typeof spendingBasedTier.cashbackPercent === 'object' && 'toNumber' in spendingBasedTier.cashbackPercent
            ? (spendingBasedTier.cashbackPercent as any).toNumber()
            : Number(spendingBasedTier.cashbackPercent))
        : 0;
      const wouldDowngradeOnExpiry = spendingTierCashback < currentTierCashback;

      spendingProgress = {
        spendingBasedTierId: spendingBasedTier?.id || null,
        spendingBasedTierName: spendingBasedTier?.name || null,
        spendingBasedCashback: spendingTierCashback || null,
        currentSpending,
        nextSpendingTierName: nextSpendingTier?.name || null,
        nextSpendingTierMinSpend,
        progressToNextSpendingTier,
        amountToNextSpendingTier,
        wouldDowngradeOnExpiry
      };

      log.debug(`[${requestId}] Spending progress: ${spendingBasedTier?.name || 'None'}, Would downgrade: ${wouldDowngradeOnExpiry}`);
    }

    // Create order lookup map for enhanced transaction descriptions
    const orderMap = new Map(recentOrders.map(o => [o.id, o]));

    // =========================================================================
    // Process pending cashback for display
    // =========================================================================
    const pendingCashback = pendingCashbackOrders.length > 0 ? {
      amount: pendingCashbackOrders.reduce((sum, o) => {
        const amt = typeof o.cashbackAmount === 'object' && 'toNumber' in o.cashbackAmount
          ? (o.cashbackAmount as any).toNumber()
          : Number(o.cashbackAmount || 0);
        return sum + amt;
      }, 0),
      orderCount: pendingCashbackOrders.length,
      orders: pendingCashbackOrders.map(o => ({
        orderName: o.shopifyOrderName,
        amount: typeof o.cashbackAmount === 'object' && 'toNumber' in o.cashbackAmount
          ? (o.cashbackAmount as any).toNumber()
          : Number(o.cashbackAmount || 0),
        date: o.shopifyCreatedAt.toISOString()
      }))
    } : null;

    log.debug(`[${requestId}] Pending cashback: ${pendingCashback?.amount ?? 0} from ${pendingCashback?.orderCount ?? 0} orders`);

    // =========================================================================
    // Process recent tier change for celebration/alert banners
    // =========================================================================
    const recentTierChange = recentTierChangeLog ? {
      fromTier: recentTierChangeLog.fromTierName,
      toTier: recentTierChangeLog.toTierName,
      changeType: recentTierChangeLog.changeType,
      reason: mapTriggerTypeToReason(recentTierChangeLog.triggerType),
      changedAt: recentTierChangeLog.createdAt.toISOString(),
      daysAgo: Math.floor((Date.now() - recentTierChangeLog.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    } : null;

    if (recentTierChange) {
      log.debug(`[${requestId}] Recent tier change: ${recentTierChange.changeType} to ${recentTierChange.toTier} (${recentTierChange.daysAgo} days ago)`);
    }

    // Format and return response
    const responseData = {
      success: true,
      enrolled: true,

      // NEW: Customer personalization
      customer: {
        firstName: customer.firstName || null,
        lastName: customer.lastName || null,
        memberSince: customer.createdAt.toISOString(),
        tags: customer.tags ? customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
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

      // Stats (enhanced with cashback data for max tier display)
      stats: {
        orderCount: spendingStats.orderCount,
        totalSpent: spendingStats.totalSpending,
        lastOrderDate: spendingStats.lastOrderDate?.toISOString() || null,
        totalCashbackEarned: totalEarned,
        annualSpent: Number(customer.annualSpent || 0)
      },

      // Tier maintenance info (for max tier annual evaluation display)
      maintenance: tier ? {
        evaluationPeriod: tier.evaluationPeriod || 'LIFETIME',
        minSpendToMaintain: typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
          ? (tier.minSpend as any).toNumber()
          : Number(tier.minSpend),
        annualSpent: Number(customer.annualSpent || 0),
        isSecured: Number(customer.annualSpent || 0) >= (typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
          ? (tier.minSpend as any).toNumber()
          : Number(tier.minSpend)),
        maintenancePercent: Math.min(100, Math.round((Number(customer.annualSpent || 0) / (typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
          ? (tier.minSpend as any).toNumber()
          : Number(tier.minSpend) || 1)) * 100)),
        amountToMaintain: Math.max(0, (typeof tier.minSpend === 'object' && 'toNumber' in tier.minSpend
          ? (tier.minSpend as any).toNumber()
          : Number(tier.minSpend)) - Number(customer.annualSpent || 0))
      } : null,

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

      // Dual progress: spending-based tier progress for non-spending tier sources
      spendingProgress,

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
      } : null,

      // =========================================================================
      // NEW: Edge case handling fields
      // =========================================================================

      // Pending cashback from orders not yet credited
      pendingCashback,

      // Recent tier change for celebration/alert banners
      recentTierChange,

      // Flag for new customer welcome state
      isNewCustomer: spendingStats.orderCount === 0 && totalEarned === 0,

      // Metadata for staleness detection
      lastUpdated: new Date().toISOString(),
      dataFreshness: {
        customerUpdatedAt: customer.updatedAt.toISOString(),
        tierStateUpdatedAt: tierState?.updatedAt?.toISOString() || null,
        progressCalculatedAt: tierState?.progressCalculatedAt?.toISOString() || null
      },

      // Tier upgrade options - purchasable tier products for higher tiers
      upgradeOptions: tierUpgradeProducts.length > 0 ? {
        available: true,
        shopDomain: shop,
        products: tierUpgradeProducts.map(tp => ({
          id: tp.id,
          tierName: tp.tier.name,
          tierCashback: typeof tp.tier.cashbackPercent === 'object' && 'toNumber' in tp.tier.cashbackPercent
            ? (tp.tier.cashbackPercent as any).toNumber()
            : Number(tp.tier.cashbackPercent),
          tierIcon: tp.tier.icon || '⭐',
          tierColor: tp.tier.color || '#FFD700',
          productHandle: tp.productHandle,
          productUrl: `https://${shop}/products/${tp.productHandle}`,
          duration: tp.duration || 'MONTHLY',
          price: typeof tp.price === 'object' && 'toNumber' in tp.price
            ? (tp.price as any).toNumber()
            : Number(tp.price),
          currency: tp.currency || 'USD'
        })),
        message: isMaxTier
          ? null
          : `Upgrade to ${tierUpgradeProducts[0]?.tier.name || 'the next tier'} for more cashback!`
      } : {
        available: false,
        products: [],
        message: isMaxTier ? "You're at the highest tier!" : null
      }
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
