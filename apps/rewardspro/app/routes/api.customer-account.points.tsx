/**
 * Customer Account Points API
 *
 * Provides points data for the storefront customer account extension.
 * This endpoint is called by the Shopify Customer Account UI Extension.
 *
 * AUTHENTICATION:
 * - Uses Shopify session tokens via authenticate.public.customerAccount()
 * - Shop and customer ID are extracted from the validated JWT token
 * - All queries scoped to authenticated shop (multi-tenancy isolation)
 *
 * Features:
 * - Points balance and lifetime stats
 * - Transaction history with pagination
 * - Expiring points warnings
 * - Tier multiplier information
 * - Available redemption options
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import {
  getPointsBalance,
  getTransactionHistory,
  getExpiringPoints,
} from "~/services/points-ledger.server";
import {
  getPointsConfig,
  getCurrencyBranding,
  isPointsEnabled,
} from "~/services/points-config.server";

// ============================================
// TYPES
// ============================================

interface PointsAPIResponse {
  success: boolean;
  data?: {
    enabled: boolean;
    currency: {
      name: string;
      plural: string;
      icon: string;
    };
    balance: {
      available: number;
      lifetime: number;
      expiringSoon: number;
      expiringWithin30Days: number;
    };
    tier: {
      name: string | null;
      multiplier: number;
      luckBonus: number;
    };
    config: {
      pointsPerDollar: number;
      pointsExpire: boolean;
      expirationDays: number;
    };
    transactions: Array<{
      id: string;
      amount: number;
      balance: number;
      type: string;
      description: string | null;
      createdAt: string;
      expiresAt: string | null;
    }>;
    transactionsPagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
    expiringPoints: {
      totalExpiring: number;
      entries: Array<{
        amount: number;
        expiresAt: string;
        daysUntilExpiry: number;
      }>;
    };
    redemptionOptions: Array<{
      id: string;
      name: string;
      pointsCost: number;
      discountValue: number;
      discountType: "fixed" | "percentage";
      available: boolean;
    }>;
    streakInfo: {
      currentStreak: number;
      longestStreak: number;
      lastActivity: string | null;
      bonusMultiplier: number;
    } | null;
  };
  error?: string;
}

// ============================================
// CORS HEADERS
// ============================================

function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ============================================
// LOADER
// ============================================

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = request.headers.get("origin");

  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // ================================================================
    // AUTHENTICATION: Validate session token from customer account extension
    // ================================================================

    // Check for preview mode (blank dest/sub claims in token)
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const [, payloadBase64] = token.split(".");
        if (payloadBase64) {
          const payload = JSON.parse(atob(payloadBase64));
          if (!payload.dest || !payload.sub) {
            // Preview mode - return empty state
            return json<PointsAPIResponse>(
              {
                success: true,
                data: {
                  enabled: false,
                  currency: { name: "Points", plural: "Points", icon: "⭐" },
                  balance: { available: 0, lifetime: 0, expiringSoon: 0, expiringWithin30Days: 0 },
                  tier: { name: null, multiplier: 1, luckBonus: 0 },
                  config: { pointsPerDollar: 10, pointsExpire: false, expirationDays: 365 },
                  transactions: [],
                  transactionsPagination: { total: 0, limit, offset, hasMore: false },
                  expiringPoints: { totalExpiring: 0, entries: [] },
                  redemptionOptions: [],
                  streakInfo: null,
                },
              },
              { headers: getCorsHeaders(origin) }
            );
          }
        }
      } catch {
        // Continue with normal auth if decode fails
      }
    }

    // Authenticate the request using Shopify's customer account authentication
    let authResult;
    try {
      authResult = await authenticate.public.customerAccount(request);
    } catch (authError: any) {
      console.error("[Points API] Authentication failed:", authError.message);
      return json<PointsAPIResponse>(
        { success: false, error: "Authentication failed" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    const sessionToken = authResult?.sessionToken;
    if (!sessionToken) {
      return json<PointsAPIResponse>(
        { success: false, error: "Invalid session token" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Extract shop and customer from AUTHENTICATED session token
    // This ensures multi-tenancy isolation - shop cannot be manipulated
    const shop = sessionToken.dest;
    const customerGid = sessionToken.sub; // gid://shopify/Customer/123456

    if (!shop || !customerGid) {
      return json<PointsAPIResponse>(
        { success: false, error: "Invalid session claims" },
        { status: 401, headers: getCorsHeaders(origin) }
      );
    }

    // Extract numeric customer ID from GID
    const shopifyCustomerId = customerGid.split("/").pop();
    if (!shopifyCustomerId) {
      return json<PointsAPIResponse>(
        { success: false, error: "Invalid customer ID format" },
        { status: 400, headers: getCorsHeaders(origin) }
      );
    }

    // ================================================================
    // DATA FETCHING (shop is now from authenticated token, not URL)
    // ================================================================

    // Check if points system is enabled
    const enabled = await isPointsEnabled(shop);
    if (!enabled) {
      return json<PointsAPIResponse>(
        {
          success: true,
          data: {
            enabled: false,
            currency: { name: "Points", plural: "Points", icon: "⭐" },
            balance: { available: 0, lifetime: 0, expiringSoon: 0, expiringWithin30Days: 0 },
            tier: { name: null, multiplier: 1, luckBonus: 0 },
            config: { pointsPerDollar: 10, pointsExpire: false, expirationDays: 365 },
            transactions: [],
            transactionsPagination: { total: 0, limit, offset, hasMore: false },
            expiringPoints: { totalExpiring: 0, entries: [] },
            redemptionOptions: [],
            streakInfo: null,
          },
        },
        { headers: getCorsHeaders(origin) }
      );
    }

    // Find customer using authenticated shop (multi-tenancy isolation)
    const customer = await db.customer.findFirst({
      where: {
        shopifyCustomerId,
        shop, // CRITICAL: Always scope to authenticated shop!
      },
      include: {
        currentTier: {
          select: {
            id: true,
            name: true,
            pointsMultiplier: true,
            pointsLuckBonus: true,
          },
        },
      },
    });

    if (!customer) {
      return json<PointsAPIResponse>(
        { success: false, error: "Customer not found" },
        { status: 404, headers: getCorsHeaders(origin) }
      );
    }

    // Fetch all data in parallel
    const [config, currency, balance, historyResult, expiringPoints] = await Promise.all([
      getPointsConfig(shop),
      getCurrencyBranding(shop),
      getPointsBalance(customer.id, shop),
      getTransactionHistory(customer.id, shop, { limit, offset }),
      getExpiringPoints(customer.id, shop, 30),
    ]);

    // Get tier info
    const tierInfo = {
      name: customer.currentTier?.name ?? null,
      multiplier: customer.currentTier?.pointsMultiplier
        ? Number(customer.currentTier.pointsMultiplier)
        : 1,
      luckBonus: customer.currentTier?.pointsLuckBonus
        ? Number(customer.currentTier.pointsLuckBonus)
        : 0,
    };

    // Redemption options removed — points are now spent on raffles/mystery boxes only
    const redemptionOptions: NonNullable<PointsAPIResponse["data"]>["redemptionOptions"] = [];

    // Get streak info if enabled
    let streakInfo = null;
    if (config.streakBonusEnabled) {
      streakInfo = await getCustomerStreakInfo(customer.id, shop, config.streakBonusMultiplier);
    }

    return json<PointsAPIResponse>(
      {
        success: true,
        data: {
          enabled: true,
          currency: {
            name: currency.name,
            plural: currency.plural,
            icon: currency.icon,
          },
          balance,
          tier: tierInfo,
          config: {
            pointsPerDollar: config.pointsPerDollar,
            pointsExpire: config.pointsExpire,
            expirationDays: config.expirationDays,
          },
          transactions: historyResult.transactions.map((t) => ({
            id: t.id,
            amount: t.amount,
            balance: t.balance,
            type: t.type,
            description: t.description,
            createdAt: t.createdAt.toISOString(),
            expiresAt: t.expiresAt?.toISOString() ?? null,
          })),
          transactionsPagination: {
            total: historyResult.total,
            limit,
            offset,
            hasMore: offset + limit < historyResult.total,
          },
          expiringPoints: {
            totalExpiring: expiringPoints.totalExpiring,
            entries: expiringPoints.entries.map((e) => ({
              amount: e.amount,
              expiresAt: e.expiresAt.toISOString(),
              daysUntilExpiry: e.daysUntilExpiry,
            })),
          },
          redemptionOptions,
          streakInfo,
        },
      },
      { headers: getCorsHeaders(origin) }
    );
  } catch (error) {
    console.error("[Points API] Error:", error);
    return json<PointsAPIResponse>(
      { success: false, error: "Internal server error" },
      { status: 500, headers: getCorsHeaders(request.headers.get("origin")) }
    );
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get customer streak information
 */
async function getCustomerStreakInfo(
  customerId: string,
  shop: string,
  streakMultiplier: number
): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastActivity: string | null;
  bonusMultiplier: number;
}> {
  // Get customer's recent activity
  const customer = await db.customer.findFirst({
    where: { id: customerId, shop },
    select: {
      lastOrderDate: true,
      metadata: true,
    },
  });

  // Extract streak data from metadata (will be managed by streak service)
  const metadata = customer?.metadata as Record<string, unknown> | null;
  const streakData = metadata?.pointsStreak as {
    current: number;
    longest: number;
    lastDate: string;
  } | undefined;

  const currentStreak = streakData?.current ?? 0;
  const longestStreak = streakData?.longest ?? 0;
  const lastActivity = streakData?.lastDate ?? customer?.lastOrderDate?.toISOString() ?? null;

  // Calculate bonus multiplier based on streak (capped at 7 days = 70% bonus with 0.1 multiplier)
  const bonusMultiplier = 1 + Math.min(currentStreak, 7) * streakMultiplier;

  return {
    currentStreak,
    longestStreak,
    lastActivity,
    bonusMultiplier,
  };
}
