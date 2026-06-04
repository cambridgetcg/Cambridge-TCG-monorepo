// app/routes/api.proxy.$.tsx
//
// SIMPLIFIED WIDGET DATA FLOW (2025-12-20)
// =========================================
// This endpoint now uses pre-computed data from CustomerTierState.
// No runtime tier resolution or progress calculation - all data is pre-computed
// and updated by the write path (webhooks, handlers).
//
// Single Query Approach:
// - Customer data (storeCredit, netSpent)
// - CustomerTierState (effectiveTier, progress, tierSource)
// - Tier details (name, cashbackPercent)
// - ShopSettings (theme, currency)
//
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import { getAuroraClient } from "../utils/aurora-data-api";
import prisma from "../db.server";
import type { SqlParameter } from "@aws-sdk/client-rds-data";
// SECURITY: Use Redis-backed rate limiter for effective distributed rate limiting
import { appProxyRateLimit } from "../utils/rate-limiter-redis";
// Points system imports
import { getActiveEvents } from "../services/points-bonus-events.server";
import { getRedemptionTiers } from "../services/points-redemption.server";
import { getEnabledFeatures, getCurrencyBranding } from "../services/points-config.server";
// Engagement action imports
import { purchaseRaffleEntries, claimDailyFreeEntry } from "../services/raffle-entry.server";
import { getRaffleStreakInfo } from "../services/raffle-streak.server";
import { claimChallengeReward } from "../services/challenge-claim.server";
import { joinChallenge } from "../services/challenge-management.server";
import { openMysteryBox } from "../services/mystery-box-open.server";
// Mission gamification imports
import { getMissionsForCustomer, getPlayerStats } from "../services/mission-stats.server";
import { acknowledgeEvents, getUnacknowledgedEvents } from "../services/mission-events.server";
import { GiftCardService } from "../services/gift-card";

// ============================================================================
// Configurable Logging - Reduces production log verbosity
// Set PROXY_LOG_LEVEL=debug for troubleshooting, default is 'error'
// ============================================================================

// Debug logging controlled by PROXY_LOG_LEVEL environment variable
// Set PROXY_LOG_LEVEL=debug for troubleshooting
const FORCE_DEBUG = false;

const LOG_LEVEL = process.env.PROXY_LOG_LEVEL || 'error';
const isDebugLogging = FORCE_DEBUG || LOG_LEVEL === 'debug';
const isInfoLogging = FORCE_DEBUG || LOG_LEVEL === 'info' || isDebugLogging;

const log = {
  debug: (...args: unknown[]) => isDebugLogging && console.log('[Proxy:DEBUG]', new Date().toISOString(), ...args),
  info: (...args: unknown[]) => isInfoLogging && console.log('[Proxy:INFO]', new Date().toISOString(), ...args),
  warn: (...args: unknown[]) => console.warn('[Proxy:WARN]', new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error('[Proxy:ERROR]', new Date().toISOString(), ...args),
};

// NOTE: calculateTierProgress function removed (2025-12-20)
// Progress is now pre-computed in CustomerTierState and updated by write path

/**
 * Standardized proxy error response.
 * Always includes both `error` and `message` fields so frontend JS
 * can read either field without a mismatch bug.
 */
function proxyError(
  msg: string,
  opts?: { status?: number; headers?: Record<string, string> }
) {
  return json(
    { success: false as const, error: msg, message: msg },
    { status: opts?.status, headers: opts?.headers }
  );
}

/**
 * SECURITY: Resolve the authenticated customer ID from the SIGNED URL query params.
 * Shopify App Proxy HMAC covers URL + query string but NOT the body, so trusting
 * `logged_in_customer_id` from a POST body allowed horizontal authorization bypass
 * (a logged-in customer could swap the ID to impersonate another). Always read from
 * the signed query string; body is ignored for identity.
 */
export function getProxyCustomerId(request: Request): string | null {
  const v = new URL(request.url).searchParams.get("logged_in_customer_id");
  if (!v || v === "" || v === "null" || v === "undefined") return null;
  return v;
}

/**
 * Idempotency guard for mutating proxy POSTs.
 * Clients send a unique `Idempotency-Key` header (UUID per user action). The first
 * request for a given key proceeds; duplicates within the TTL window are rejected
 * with a clear message. Prevents double-spend on rapid clicks / retries / replays.
 * Falls back to an in-memory map when Vercel KV is not configured (local dev).
 */
const idempotencyMemory = new Map<string, number>();
const IDEMPOTENCY_TTL_SECONDS = 120;
async function claimIdempotencyKey(
  scope: string,
  shop: string,
  customerId: string,
  request: Request
): Promise<{ ok: true } | { ok: false; reason: "missing" | "duplicate" }> {
  const key = request.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 128) return { ok: false, reason: "missing" };
  const storeKey = `idem:${scope}:${shop}:${customerId}:${key}`;

  try {
    const { kv } = await import("@vercel/kv");
    const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (kvConfigured) {
      const claimed = await kv.set(storeKey, "1", { nx: true, ex: IDEMPOTENCY_TTL_SECONDS });
      return claimed === "OK" ? { ok: true } : { ok: false, reason: "duplicate" };
    }
  } catch (err) {
    log.warn("Idempotency KV unavailable, using memory fallback:", (err as Error).message);
  }

  const now = Date.now();
  for (const [k, expiry] of idempotencyMemory) {
    if (expiry < now) idempotencyMemory.delete(k);
  }
  if (idempotencyMemory.has(storeKey)) return { ok: false, reason: "duplicate" };
  idempotencyMemory.set(storeKey, now + IDEMPOTENCY_TTL_SECONDS * 1000);
  return { ok: true };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const proxyPath = params["*"] || "";
  const url = new URL(request.url);

  log.info('=== NEW REQUEST ===', {
    path: proxyPath,
    method: request.method,
    url: url.pathname,
    searchParams: Object.fromEntries(url.searchParams),
    headers: {
      host: request.headers.get('host'),
      'user-agent': request.headers.get('user-agent')?.substring(0, 50),
      'x-forwarded-for': request.headers.get('x-forwarded-for')
    }
  });

  // SECURITY: Rate limiting to prevent abuse
  const rateLimitResponse = await appProxyRateLimit(request);
  if (rateLimitResponse) {
    log.warn('Rate limit exceeded for request');
    return rateLimitResponse;
  }

  // SECURITY: Authenticate the app proxy request with HMAC validation
  // This ensures the request is coming from Shopify and not a direct attack
  log.debug('=== AUTH: Starting HMAC authentication ===');

  let session;
  try {
    const authResult = await authenticate.public.appProxy(request);
    session = authResult.session;
    log.debug('=== AUTH SUCCESS ===', {
      shop: session?.shop,
      hasSession: !!session
    });
  } catch (authError: any) {
    log.error('=== AUTH FAILED ===', {
      message: authError.message,
      code: authError.code,
      name: authError.name,
      stack: authError.stack?.split('\n').slice(0, 5).join('\n')
    });
    return json({
      success: false,
      error: "Authentication failed",
      message: "Unable to authenticate proxy request"
    }, { status: 401 });
  }

  // SECURITY: Validate and restrict CORS to legitimate Shopify origins
  // App Proxy requests come from shop storefronts, so we validate the origin
  const origin = request.headers.get('origin') || '';
  const isValidShopifyOrigin = /^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(origin) ||
                                /^https:\/\/admin\.shopify\.com$/.test(origin) ||
                                origin === ''; // Same-origin requests have no Origin header

  // Use specific origin instead of wildcard, or reject if invalid
  const allowedOrigin = isValidShopifyOrigin && origin ? origin :
                        session?.shop ? `https://${session.shop}` :
                        'https://admin.shopify.com';

  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
    // Cache for 30 seconds, serve stale content while revalidating for up to 15 more seconds
    // Reduced from 60+30=90s to 30+15=45s to improve post-purchase experience
    "Cache-Control": "private, max-age=30, stale-while-revalidate=15",
    // Additional security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  // Test endpoint
  if (proxyPath === "test") {
    return json({
      success: true,
      message: "API endpoint is working",
      timestamp: new Date().toISOString()
    }, { headers });
  }
  
  // Membership endpoint
  if (proxyPath === "membership") {
    // Extract customer ID from various possible parameters
    const customerId = url.searchParams.get("logged_in_customer_id") ||
                      url.searchParams.get("customer_id") ||
                      url.searchParams.get("customerId") ||
                      url.searchParams.get("cid");

    // SECURITY: Use authenticated shop from session ONLY
    // We completely ignore the shop parameter in URL to prevent spoofing
    const shop = session?.shop;

    // If no authenticated session, reject the request
    if (!shop || !session) {
      log.warn('No authenticated session - rejecting request');
      return json({
        success: false,
        error: "Authentication required",
        message: "This request must come through Shopify app proxy",
        requiresLogin: false
      }, { status: 401, headers });
    }

    log.debug('Membership request:', { shop, customerId: customerId || 'guest' });

    // Handle non-logged-in users
    if (!customerId || customerId === "" || customerId === "null" || customerId === "undefined") {
      log.debug('Guest user request');
      return json({
        success: false,
        requiresLogin: true,
        message: "Please log in to view your rewards",
        query: {
          shopDomain: shop || 'unknown',
          shopifyCustomerId: 'guest',
          endpoint: '/apps/rewardspro/api/customer',
          foundInDatabase: false,
          method: 'No Query - Guest User',
          executionTime: 'N/A'
        },
        customer: null,
        balance: {
          storeCredit: 0,
          totalEarned: 0,
          lastSynced: null
        },
        membership: {
          tier: {
            id: "guest",
            name: "Guest",
            cashbackPercent: 1
          }
        }
      }, {
        status: 200,
        headers
      });
    }

    try {
      log.debug('=== STEP 1: Initializing Data API client ===');

      // Use direct Data API for customer lookup with pre-computed data
      let dataApi;
      try {
        dataApi = getAuroraClient();
        log.debug('=== STEP 1 SUCCESS: Data API client created ===');
      } catch (clientError: any) {
        log.error('=== STEP 1 FAILED: Data API client creation failed ===', {
          error: clientError.message,
          stack: clientError.stack
        });
        throw clientError;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // SINGLE QUERY - All widget data in one join
      // No runtime tier resolution or progress calculation needed!
      // Data is pre-computed by write path (webhooks, handlers)
      // ═══════════════════════════════════════════════════════════════════════
      const sql = `
        SELECT
          -- Customer core data
          c.id,
          c.shop,
          c."shopifyCustomerId",
          c.email,
          c."firstName",
          c."lastName",
          c."storeCredit",
          c."totalCashbackEarned",
          c."totalSpent",
          c."netSpent",
          c."totalRefunded",
          c."orderCount",
          c."createdAt",
          c."updatedAt",
          c.metadata as "customerMetadata",

          -- Points balance (from Customer table)
          c."pointsBalance",
          c."lifetimePoints",

          -- Pre-computed tier state (source of truth for widget)
          cts."effectiveTierId",
          cts."tierSource",
          cts."progressPercent",
          cts."nextTierMinSpend",
          cts."amountToNextTier",
          cts."isMaxTier",
          cts."nextTierName",

          -- Effective tier details
          t.id as "tier_id",
          t.name as "tier_name",
          t."minSpend" as "tier_minSpend",
          t."cashbackPercent" as "tier_cashbackPercent",
          t."pointsMultiplier" as "tier_pointsMultiplier",

          -- Shop settings for theme
          ss."storeCurrency",
          ss."widgetThemeMode",
          ss."widgetPrimaryColor",
          ss."widgetBackgroundColor",
          ss."widgetTextColor",
          ss."widgetAccentColor",
          -- NOTE: widgetSecondaryTextColor not yet migrated to production
          ss."widgetBorderRadius",
          ss."widgetFontFamily",
          ss."updatedAt" as "settingsUpdatedAt",

          -- Points configuration
          pc."isEnabled" as "points_enabled",
          pc."currencyName" as "points_currencyName",
          pc."currencyNamePlural" as "points_currencyPlural",
          pc."currencyIcon" as "points_currencyIcon",
          pc."pointsPerDollar" as "points_perDollar",
          pc."pointsExpire" as "points_expire",
          pc."expirationDays" as "points_expirationDays",
          pc."streakBonusEnabled" as "points_streakEnabled",
          pc."streakBonusMultiplier" as "points_streakMultiplier"

        FROM "Customer" c
        LEFT JOIN "CustomerTierState" cts ON cts."customerId" = c.id
        LEFT JOIN "Tier" t ON t.id = cts."effectiveTierId"
        LEFT JOIN "ShopSettings" ss ON ss.shop = c.shop
        LEFT JOIN "PointsConfig" pc ON pc.shop = c.shop
        WHERE c.shop = :shopDomain
          AND c."shopifyCustomerId" = :shopifyCustomerId
        LIMIT 1
      `;

      const parameters: SqlParameter[] = [
        { name: 'shopDomain', value: { stringValue: shop } },
        { name: 'shopifyCustomerId', value: { stringValue: customerId } }
      ];

      log.debug('=== STEP 2: Executing SQL query ===', {
        shop,
        customerId,
        paramCount: parameters.length
      });

      const startTime = Date.now();
      let result;
      try {
        result = await dataApi.executeStatement(sql, parameters);
        const executionTime = Date.now() - startTime;
        log.debug('=== STEP 2 SUCCESS: Query completed ===', {
          executionTime: `${executionTime}ms`,
          recordCount: result.records?.length || 0,
          found: !!(result.records?.length)
        });
      } catch (queryError: any) {
        const executionTime = Date.now() - startTime;
        log.error('=== STEP 2 FAILED: SQL query error ===', {
          executionTime: `${executionTime}ms`,
          error: queryError.message,
          code: queryError.code,
          name: queryError.name,
          stack: queryError.stack?.split('\n').slice(0, 5).join('\n')
        });
        throw queryError;
      }

      const executionTime = Date.now() - startTime;

      // ═══════════════════════════════════════════════════════════════════════
      // SIMPLIFIED RESPONSE - No runtime calculations!
      // All data comes directly from the single query above
      // ═══════════════════════════════════════════════════════════════════════

      // Return "not found" response if customer doesn't exist
      if (!result.records || result.records.length === 0) {
        log.info('Customer not found:', { shop, customerId });

        return json({
          success: false,
          status: 'customer_not_found',
          message: 'Customer not found in database. Data will be available after merchant runs customer sync.',
          query: {
            shopDomain: shop,
            shopifyCustomerId: customerId,
            endpoint: '/apps/rewardspro/api/customer',
            foundInDatabase: false,
            method: 'Single Query (Pre-computed)',
            executionTime: executionTime + 'ms'
          },
          customer: null,
          balance: null,
          membership: null
        }, { headers });
      }

      log.debug('=== STEP 3: Processing result row ===');

      const row = result.records[0];

      log.debug('=== STEP 3 SUCCESS: Row extracted ===', {
        rowKeys: Object.keys(row || {}),
        id: row?.id,
        tier: row?.tier_name || 'none',
        tierSource: row?.tierSource || 'none',
        progress: row?.progressPercent || 0,
        hasStoreCredit: 'storeCredit' in (row || {}),
        hasNetSpent: 'netSpent' in (row || {})
      });

      // ═══════════════════════════════════════════════════════════════════════
      // POINTS DATA - Fetch bonus events and redemption tiers if points enabled
      // ═══════════════════════════════════════════════════════════════════════
      const pointsEnabled = row.points_enabled === true;
      let pointsData = null;

      if (pointsEnabled) {
        log.debug('=== STEP 3.5: Fetching points data ===');

        try {
          // Fetch bonus events and redemption tiers in parallel
          const [bonusResult, redemptionTiers] = await Promise.all([
            getActiveEvents(shop, {
              tierId: row.tier_id || undefined,
              orderAmount: 0, // Will be calculated at checkout
            }),
            getRedemptionTiers(shop),
          ]);

          // Extract streak info from customer metadata
          const customerMetadata = row.customerMetadata as Record<string, any> | null;
          const streakInfo = customerMetadata?.streak as {
            currentStreak?: number;
            longestStreak?: number;
            lastActivityDate?: string;
          } | null;

          // Calculate streak bonus multiplier
          const streakBonusEnabled = row.points_streakEnabled === true;
          const streakMultiplierRate = Number(row.points_streakMultiplier || 0.1);
          const currentStreak = streakInfo?.currentStreak || 0;
          const streakBonusMultiplier = streakBonusEnabled && currentStreak > 0
            ? 1 + Math.min(currentStreak * streakMultiplierRate, 0.5) // Cap at 50% bonus
            : 1;

          // Calculate which redemption tiers are available based on balance
          const pointsBalance = Number(row.pointsBalance || 0);
          const redemptionOptions = redemptionTiers
            .filter((tier) => tier.isActive)
            .map((tier) => ({
              id: tier.id,
              name: tier.name,
              pointsCost: tier.pointsCost,
              discountValue: tier.value,
              discountType: tier.type.toLowerCase().replace('_discount', ''),
              available: pointsBalance >= tier.pointsCost,
            }));

          pointsData = {
            enabled: true,
            balance: {
              available: pointsBalance,
              lifetime: Number(row.lifetimePoints || 0),
              expiringSoon: 0, // Will be calculated by separate lightweight query if needed
            },
            currency: {
              name: row.points_currencyName || 'Points',
              plural: row.points_currencyPlural || 'Points',
              icon: row.points_currencyIcon || '⭐',
            },
            config: {
              pointsPerDollar: Number(row.points_perDollar || 10),
              tierMultiplier: Number(row.tier_pointsMultiplier || 1),
              pointsExpire: row.points_expire === true,
              expirationDays: row.points_expirationDays || 365,
            },
            activeBonus: {
              hasBonus: bonusResult.hasActiveEvent,
              multiplier: bonusResult.combinedMultiplier,
              eventNames: bonusResult.eventNames,
              endsAt: bonusResult.events[0]?.endsAt?.toISOString() || null,
            },
            streak: streakBonusEnabled ? {
              current: currentStreak,
              longest: streakInfo?.longestStreak || 0,
              bonusMultiplier: streakBonusMultiplier,
              lastActivity: streakInfo?.lastActivityDate || null,
            } : null,
            redemptionOptions,
          };

          log.debug('=== STEP 3.5 SUCCESS: Points data loaded ===', {
            balance: pointsData.balance.available,
            hasBonus: pointsData.activeBonus.hasBonus,
            redemptionCount: redemptionOptions.length,
            streakEnabled: streakBonusEnabled,
          });
        } catch (pointsError: any) {
          log.warn('=== STEP 3.5 WARNING: Points data fetch failed ===', {
            error: pointsError.message,
          });
          // Points data is optional - continue without it
          pointsData = { enabled: false, error: 'Failed to load points data' };
        }
      }

      log.debug('=== STEP 4: Building response object ===');

      // ═══════════════════════════════════════════════════════════════════════
      // UPGRADE OPTIONS - Fetch tier products for higher tiers
      // ═══════════════════════════════════════════════════════════════════════
      let upgradeOptions: Array<{
        tierName: string;
        tierCashback: number;
        productHandle: string;
        duration: string;
        price: number;
        currency: string;
      }> = [];

      try {
        const currentTierMinSpend = row.tier_minSpend ? Number(row.tier_minSpend) : 0;

        // DATA API COMPATIBLE: Two-step query (nested relation filtering not supported)
        // Step 1: Find tiers higher than current tier
        const higherTiers = await prisma.tier.findMany({
          where: {
            shop,
            isActive: true,
            minSpend: { gt: currentTierMinSpend },
          },
          select: {
            id: true,
            name: true,
            cashbackPercent: true,
            minSpend: true,
          },
          orderBy: { minSpend: 'asc' },
          take: 3,
        });

        // Step 2: Find tier products for those tiers
        const higherTierIds = higherTiers.map(t => t.id);
        const tierProducts = higherTierIds.length > 0 ? await prisma.tierProduct.findMany({
          where: {
            shop,
            deletedAt: null,
            isActive: true,
            tierId: { in: higherTierIds },
          },
          select: {
            productHandle: true,
            duration: true,
            price: true,
            currency: true,
            tierId: true,
          },
        }) : [];

        // Step 3: Join tier data in memory
        const tierMap = new Map(higherTiers.map(t => [t.id, t]));
        upgradeOptions = tierProducts
          .map(tp => {
            const tier = tierMap.get(tp.tierId);
            if (!tier) return null;
            return {
              tierName: tier.name,
              tierCashback: tier.cashbackPercent,
              productHandle: tp.productHandle,
              duration: tp.duration || 'MONTHLY',
              price: Number(tp.price),
              currency: tp.currency,
              minSpend: tier.minSpend, // For sorting
            };
          })
          .filter((opt): opt is NonNullable<typeof opt> => opt !== null)
          .sort((a, b) => Number(a.minSpend) - Number(b.minSpend))
          .slice(0, 3)
          .map(({ minSpend, ...rest }) => rest); // Remove minSpend from final output

        log.debug('=== UPGRADE OPTIONS ===', {
          currentTierMinSpend,
          upgradeCount: upgradeOptions.length,
        });
      } catch (upgradeError: any) {
        log.warn('=== UPGRADE OPTIONS: Failed to fetch ===', {
          error: upgradeError.message,
        });
        // Continue without upgrade options - not critical
      }

      // Build response directly from query result - no additional calculations!
      const responseData = {
        success: true,
        customer: {
          id: row.id,
          shopifyId: row.shopifyCustomerId,
          email: row.email,
          firstName: row.firstName || null,
          lastName: row.lastName || null,
          memberSince: row.createdAt,
          totalSpent: Number(row.totalSpent || 0),
          totalRefunded: Number(row.totalRefunded || 0),
          netSpent: Number(row.netSpent || 0),
          orderCount: Number(row.orderCount || 0),
          // Indicates new customer who hasn't made purchases yet (for welcome flow)
          isNewCustomer: Number(row.orderCount || 0) === 0 && Number(row.totalCashbackEarned || 0) === 0
        },
        balance: {
          storeCredit: Number(row.storeCredit || 0),
          totalEarned: Number(row.totalCashbackEarned || 0),
          lastSynced: row.updatedAt || null
        },
        membership: {
          // Tier data from pre-computed CustomerTierState
          tier: row.tier_id ? {
            id: row.tier_id,
            name: row.tier_name,
            cashbackPercent: Number(row.tier_cashbackPercent || 0)
          } : null,
          // Source of the tier (pre-computed)
          tierSource: row.tierSource || 'NONE',
          // Flag to indicate if shop has tiers configured
          configured: !!row.tier_id
        },
        tierProgress: {
          // All progress data is pre-computed in CustomerTierState
          currentSpending: Number(row.netSpent || 0),
          totalSpent: Number(row.totalSpent || 0),
          totalRefunded: Number(row.totalRefunded || 0),
          netSpent: Number(row.netSpent || 0),
          nextTierTarget: row.nextTierMinSpend ? Number(row.nextTierMinSpend) : null,
          nextTierName: row.nextTierName || null,
          nextTierCashback: null, // Not pre-computed, widget doesn't use this
          amountRemaining: Number(row.amountToNextTier || 0),
          progressPercent: Number(row.progressPercent || 0),
          isMaxTier: row.isMaxTier || false,
          allTiers: [] // Not needed for widget display, removed for performance
        },
        theme: {
          mode: row.widgetThemeMode || 'LIGHT',
          primaryColor: row.widgetPrimaryColor || '#FFD700',
          backgroundColor: row.widgetBackgroundColor || '#1a1a2e',
          textColor: row.widgetTextColor || '#FFFFFF',
          accentColor: row.widgetAccentColor || '#008060',
          secondaryTextColor: null, // Not yet migrated to production
          borderRadius: row.widgetBorderRadius || 12,
          fontFamily: row.widgetFontFamily || 'inherit',
          // Settings version for cache invalidation - changes when merchant updates settings
          version: row.settingsUpdatedAt ? new Date(row.settingsUpdatedAt).getTime() : 0,
        },
        settings: {
          currency: row.storeCurrency || 'USD',
        },
        // Points Engagement System data
        points: pointsData,
        // Upgrade options - tier products for higher tiers
        upgradeOptions: upgradeOptions.length > 0 ? {
          available: true,
          products: upgradeOptions,
          message: row.isMaxTier
            ? null
            : `Upgrade to ${upgradeOptions[0]?.tierName || 'the next tier'} for ${upgradeOptions[0]?.tierCashback || 0}% cashback!`,
        } : {
          available: false,
          products: [],
          message: row.isMaxTier ? "You're at the highest tier!" : null,
        },
        query: {
          shopDomain: shop,
          shopifyCustomerId: customerId,
          endpoint: '/apps/rewardspro/api/customer',
          foundInDatabase: true,
          method: 'Single Query (Pre-computed)',
          executionTime: executionTime + 'ms'
        }
      };

      log.debug('=== STEP 4 SUCCESS: Response object built ===', {
        tier: responseData.membership.tier?.name || 'none',
        tierSource: responseData.membership.tierSource,
        balance: responseData.balance.storeCredit,
        progress: responseData.tierProgress.progressPercent
      });

      // Debug theme data specifically
      log.debug('=== THEME DEBUG ===', {
        rawFromDB: {
          widgetThemeMode: row.widgetThemeMode,
          widgetPrimaryColor: row.widgetPrimaryColor,
          widgetBackgroundColor: row.widgetBackgroundColor,
          widgetTextColor: row.widgetTextColor,
          widgetAccentColor: row.widgetAccentColor,
          widgetBorderRadius: row.widgetBorderRadius,
          widgetFontFamily: row.widgetFontFamily,
          settingsUpdatedAt: row.settingsUpdatedAt
        },
        themeInResponse: responseData.theme
      });

      log.info('=== REQUEST COMPLETE: Returning success response ===');

      return json(responseData, { headers });

    } catch (error: any) {
      // Log comprehensive error details for debugging
      log.error('=== REQUEST FAILED: Unhandled error ===', {
        message: error.message,
        name: error.name,
        code: error.code,
        // Include first 10 lines of stack for debugging
        stack: error.stack?.split('\n').slice(0, 10).join('\n'),
        // AWS-specific error info (if applicable)
        $metadata: error.$metadata,
        // Request context
        shop,
        customerId
      });

      // Return sanitized error response (no stack traces or internal details)
      return json({
        success: false,
        error: "service_error",
        message: "Unable to load rewards data. Please try again later.",
        requiresLogin: false
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE-FLAGS endpoint - Unified feature state for storefront
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "feature-flags") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      const features = await getEnabledFeatures(shop);

      // Count active items for each feature (for highlighting in UI)
      const [activeRaffles, activeMysteryBoxes] = await Promise.all([
        features.raffles
          ? prisma.raffle.count({
              where: {
                shop,
                status: "ACTIVE",
                isPublic: true,
                endsAt: { gt: new Date() },
              },
            })
          : 0,
        features.mysteryBoxes
          ? prisma.mysteryBox.count({
              where: {
                shop,
                status: "ACTIVE",
                isPublic: true,
                endsAt: { gt: new Date() },
              },
            })
          : 0,
      ]);

      return json({
        success: true,
        features: {
          pointsSystem: features.pointsSystem,
          raffles: features.raffles,
          mysteryBoxes: features.mysteryBoxes,
          challenges: features.challenges,
          spinWheel: features.spinWheel,
          scratchCards: features.scratchCards,
        },
        counts: {
          activeRaffles,
          activeMysteryBoxes,
          activeChallenges: 0, // Not yet implemented
        },
      }, { headers });

    } catch (error: any) {
      log.error("Feature flags endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load feature flags",
        features: {
          pointsSystem: false,
          raffles: false,
          mysteryBoxes: false,
          challenges: false,
          spinWheel: false,
          scratchCards: false,
        },
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RAFFLES GET endpoint - List active raffles for storefront teasers
  // NOTE: POST handler for purchases/free-entries is in the action() function below
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "raffles") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const customerId = url.searchParams.get("logged_in_customer_id");

    log.info('=== RAFFLES ENDPOINT ===', { shop, customerId: customerId || 'guest' });

    let currentStep = 'init';
    try {
      // Step 1: Check if raffles feature is enabled
      currentStep = 'getEnabledFeatures';
      log.debug('=== RAFFLES STEP 1: Checking feature flags ===');
      let features;
      try {
        features = await getEnabledFeatures(shop);
      } catch (featureErr: any) {
        log.error('=== RAFFLES STEP 1 FAILED: getEnabledFeatures error ===', {
          error: featureErr.message,
          code: featureErr.code,
          stack: featureErr.stack?.split('\n').slice(0, 5).join('\n'),
        });
        throw featureErr;
      }

      if (!features.raffles) {
        log.info('Raffles feature disabled for shop', { shop });
        return json({
          success: true,
          enabled: false,
          raffles: [],
          message: "Raffles are not enabled for this store",
        }, { headers });
      }
      log.debug('=== RAFFLES STEP 1 SUCCESS: Feature enabled ===');

      // Step 2: Get active and public raffles
      // NOTE: Data API adapter ignores `select` and nested relations (prizes).
      // We query raffles first, then fetch prize names separately.
      currentStep = 'raffle.findMany';
      log.debug('=== RAFFLES STEP 2: Querying active raffles ===');
      let raffles;
      try {
        raffles = await prisma.raffle.findMany({
          where: {
            shop,
            status: "ACTIVE",
            isPublic: true,
            endsAt: { gt: new Date() },
          },
          orderBy: { endsAt: "asc" },
          take: 10,
        });
        log.debug('=== RAFFLES STEP 2 SUCCESS ===', { count: raffles.length });
      } catch (queryErr: any) {
        log.error('=== RAFFLES STEP 2 FAILED: Raffle query error ===', {
          error: queryErr.message,
          code: queryErr.code,
          name: queryErr.name,
          stack: queryErr.stack?.split('\n').slice(0, 5).join('\n'),
        });
        throw queryErr;
      }

      // Step 2b: Fetch all prizes for each raffle (separate query for Data API compat)
      currentStep = 'rafflePrize.lookup';
      const rafflePrizesMap: Record<string, Array<{
        name: string;
        description: string | null;
        imageUrl: string | null;
        prizeType: string;
        prizeValue: any;
        quantity: number;
        quantityWon: number;
        displayOrder: number;
      }>> = {};
      if (raffles.length > 0) {
        try {
          const raffleIds = raffles.map((r: any) => r.id);
          const prizes = await prisma.rafflePrize.findMany({
            where: { raffleId: { in: raffleIds } },
            orderBy: { displayOrder: "asc" },
          });
          for (const prize of prizes) {
            if (!rafflePrizesMap[prize.raffleId]) {
              rafflePrizesMap[prize.raffleId] = [];
            }
            rafflePrizesMap[prize.raffleId].push({
              name: prize.name,
              description: prize.description,
              imageUrl: prize.imageUrl,
              prizeType: prize.prizeType,
              prizeValue: prize.prizeValue,
              quantity: prize.quantity,
              quantityWon: prize.quantityWon,
              displayOrder: prize.displayOrder,
            });
          }
        } catch (prizeErr: any) {
          log.warn('=== RAFFLES STEP 2b: Prize lookup failed (non-fatal) ===', {
            error: prizeErr.message,
          });
          // Non-fatal — proceed without prize data
        }
      }

      // Step 3: Resolve customer, get entry counts and points balance
      currentStep = 'customer.resolve';
      let customerEntries: Record<string, number> = {};
      let pointsBalance = 0;
      let internalCustomerId: string | null = null;
      if (customerId) {
        log.debug('=== RAFFLES STEP 3: Resolving customer ===', { customerId });
        try {
          const customer = await prisma.customer.findFirst({
            where: { shop, shopifyCustomerId: customerId },
            select: { id: true, pointsBalance: true },
          });

          if (customer) {
            internalCustomerId = customer.id;
            pointsBalance = Number(customer.pointsBalance || 0);
            log.debug('=== RAFFLES STEP 3a: Customer found ===', {
              internalId: customer.id,
              pointsBalance,
            });

            if (raffles.length > 0) {
              try {
                const entries = await prisma.raffleEntry.groupBy({
                  by: ["raffleId"],
                  where: {
                    customerId: customer.id,
                    raffleId: { in: raffles.map(r => r.id) },
                  },
                  _sum: { entriesCount: true },
                });
                customerEntries = Object.fromEntries(
                  entries.map(e => [e.raffleId, e._sum.entriesCount || 0])
                );
                log.debug('=== RAFFLES STEP 3b: Entry counts loaded ===', {
                  entryCounts: customerEntries,
                });
              } catch (entryErr: any) {
                log.warn('=== RAFFLES STEP 3b: Entry count query failed (non-fatal) ===', {
                  error: entryErr.message,
                  code: entryErr.code,
                });
                // Non-fatal — proceed with empty entry counts
              }
            }
          } else {
            log.info('=== RAFFLES STEP 3: Customer not found in DB ===', { customerId });
          }
        } catch (custErr: any) {
          log.error('=== RAFFLES STEP 3 FAILED: Customer lookup error ===', {
            error: custErr.message,
            code: custErr.code,
            stack: custErr.stack?.split('\n').slice(0, 5).join('\n'),
          });
          // Non-fatal — proceed with no customer data rather than 500
        }
      }

      // Step 4: Check free entry availability (reuse customer from Step 3)
      currentStep = 'streakInfo';
      let canClaimFreeEntry = false;
      if (internalCustomerId) {
        try {
          const streakInfo = await getRaffleStreakInfo(shop, internalCustomerId);
          canClaimFreeEntry = streakInfo.canClaimFreeEntry;
        } catch (streakErr: any) {
          log.warn('=== RAFFLES STEP 4: Streak check failed (non-fatal) ===', streakErr.message);
          // Non-fatal — default to false
        }
      }

      // Step 5: Format response
      currentStep = 'formatResponse';
      const formattedRaffles = raffles.map(raffle => ({
        id: raffle.id,
        name: raffle.name,
        description: raffle.description,
        imageUrl: raffle.imageUrl,
        endsAt: raffle.endsAt instanceof Date ? raffle.endsAt.toISOString() : raffle.endsAt || null,
        costPerEntry: raffle.entryCost || 0,
        totalEntries: raffle.totalEntries,
        prizes: rafflePrizesMap[raffle.id] || [],
        status: "ACTIVE",
        customerEntries: customerEntries[raffle.id] || 0,
        maxEntriesPerCustomer: raffle.maxEntriesPerCustomer,
        freeEntryAvailable: raffle.dailyFreeEntries > 0 && canClaimFreeEntry,
      }));

      log.info('=== RAFFLES ENDPOINT SUCCESS ===', {
        shop,
        raffleCount: formattedRaffles.length,
        customerId: customerId || 'guest',
        pointsBalance,
      });

      return json({
        success: true,
        enabled: true,
        raffles: formattedRaffles,
        pointsBalance,
        isAuthenticated: !!customerId,
      }, { headers });

    } catch (error: any) {
      log.error("=== RAFFLES ENDPOINT FAILED ===", {
        step: currentStep,
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 10).join('\n'),
        $metadata: error.$metadata,
        shop,
        customerId,
      });
      return json({
        success: false,
        error: "Failed to load raffles",
        message: error.message,
        failedStep: currentStep,
        errorCode: error.code || null,
        raffles: [],
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MYSTERY-BOXES endpoint - List active mystery boxes for storefront teasers
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "mystery-boxes" && request.method === "GET") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const shopifyCustomerId = url.searchParams.get("logged_in_customer_id");

    try {
      // Check if mystery boxes feature is enabled and fetch currency branding in parallel
      const [features, currencyBranding] = await Promise.all([
        getEnabledFeatures(shop),
        getCurrencyBranding(shop),
      ]);
      if (!features.mysteryBoxes) {
        return json({
          success: true,
          enabled: false,
          boxes: [],
          message: "Mystery boxes are not enabled for this store",
        }, { headers });
      }

      // Resolve internal customer ID if authenticated
      let internalCustomerId: string | null = null;
      let customerPointsBalance = 0;
      if (shopifyCustomerId) {
        const customer = await prisma.customer.findFirst({
          where: { shop, shopifyCustomerId },
          select: { id: true, pointsBalance: true },
        });
        internalCustomerId = customer?.id || null;
        customerPointsBalance = Number(customer?.pointsBalance || 0);
      }

      // Get active and public mystery boxes
      // NOTE: Data API adapter ignores nested `select` relations (rewards, _count).
      // We query boxes first, then fetch rewards separately.
      const boxes = await prisma.mysteryBox.findMany({
        where: {
          shop,
          status: "ACTIVE",
          isPublic: true,
          endsAt: { gt: new Date() },
        },
        orderBy: { endsAt: "asc" },
        take: 10,
      });

      // Fetch rewards for rarity preview (separate query for Data API compat)
      let rewardsByBox: Record<string, Array<{ rarity: string; probability: number }>> = {};
      if (boxes.length > 0) {
        try {
          const boxIds = boxes.map((b: any) => b.id);
          const rewards = await prisma.mysteryBoxReward.findMany({
            where: { boxId: { in: boxIds } },
            orderBy: { probability: "desc" },
          });
          for (const reward of rewards) {
            if (!rewardsByBox[reward.boxId]) rewardsByBox[reward.boxId] = [];
            rewardsByBox[reward.boxId].push({
              rarity: reward.rarity || "COMMON",
              probability: Number(reward.probability || 0),
            });
          }
        } catch (rewardErr: any) {
          log.warn('Mystery boxes: reward lookup failed (non-fatal)', { error: rewardErr.message });
        }
      }

      // Get customer's opens for each box if authenticated
      let customerOpensMap: Record<string, number> = {};
      if (internalCustomerId && boxes.length > 0) {
        const boxIds = boxes.map(b => b.id);
        const customerOpens = await prisma.mysteryBoxOpen.findMany({
          where: {
            customerId: internalCustomerId,
            boxId: { in: boxIds },
          },
          select: { boxId: true },
        });
        // Count opens per box
        for (const open of customerOpens) {
          customerOpensMap[open.boxId] = (customerOpensMap[open.boxId] || 0) + 1;
        }
      }

      // Build rarity preview from rewards
      const formattedBoxes = boxes.map((box: any) => {
        // Group rewards by rarity and sum probabilities
        const rarityMap: Record<string, number> = {};
        const boxRewards = rewardsByBox[box.id] || [];
        boxRewards.forEach((reward: { rarity: string; probability: number }) => {
          rarityMap[reward.rarity] = (rarityMap[reward.rarity] || 0) + reward.probability;
        });

        const rarityPreview = Object.entries(rarityMap)
          .map(([rarity, chance]) => ({
            rarity,
            chance: Math.round(chance * 100) / 100, // Round to 2 decimal places
          }))
          .sort((a, b) => {
            const order = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"];
            return order.indexOf(a.rarity) - order.indexOf(b.rarity);
          });

        // Calculate canOpen status for authenticated users
        const customerOpens = customerOpensMap[box.id] || 0;
        const maxCustomerReached = customerOpens >= box.maxOpensPerCustomer;
        const maxTotalReached = box.maxOpensTotal !== null && box.totalOpens >= box.maxOpensTotal;
        const insufficientPoints = customerPointsBalance < (box.openCost || 0);

        let canOpen = true;
        let reason: string | undefined;
        if (!internalCustomerId) {
          canOpen = true; // Will prompt login
        } else if (maxCustomerReached) {
          canOpen = false;
          reason = "Max opens reached";
        } else if (maxTotalReached) {
          canOpen = false;
          reason = "Sold out";
        } else if (insufficientPoints) {
          canOpen = false;
          reason = "Insufficient points";
        }

        return {
          id: box.id,
          name: box.name,
          description: box.description,
          imageUrl: box.imageUrl,
          pointsCost: box.openCost || 0,
          maxOpensPerCustomer: box.maxOpensPerCustomer,
          totalOpens: box.totalOpens || 0,
          customerOpens: internalCustomerId ? customerOpens : undefined,
          canOpen: internalCustomerId ? canOpen : undefined,
          reason: internalCustomerId ? reason : undefined,
          isActive: true,
          rarityPreview,
        };
      });

      return json({
        success: true,
        enabled: true,
        isAuthenticated: !!shopifyCustomerId,
        boxes: formattedBoxes,
        pointsBalance: shopifyCustomerId ? customerPointsBalance : undefined,
        config: { currencyName: currencyBranding.name, currencyIcon: currencyBranding.icon },
      }, { headers });

    } catch (error: any) {
      log.error("Mystery boxes endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load mystery boxes",
        boxes: [],
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHALLENGES endpoint - List active challenges with customer progress
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "challenges") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const shopifyCustomerId = url.searchParams.get("logged_in_customer_id");

    try {
      // Check if challenges are enabled via PointsConfig
      const pointsConfig = await prisma.pointsConfig.findUnique({
        where: { shop },
        select: {
          challengesEnabled: true,
          currencyName: true,
          currencyIcon: true,
        },
      });

      if (!pointsConfig?.challengesEnabled) {
        return json({
          success: true,
          enabled: false,
          challenges: [],
          message: "Challenges are not enabled for this store",
        }, { headers });
      }

      // Resolve internal customer ID from Shopify customer ID
      let internalCustomerId: string | null = null;
      if (shopifyCustomerId) {
        const customer = await prisma.customer.findFirst({
          where: { shop, shopifyCustomerId },
          select: { id: true },
        });
        internalCustomerId = customer?.id || null;
      }

      // Get active public challenges
      const now = new Date();
      const challenges = await prisma.challenge.findMany({
        where: {
          shop,
          status: "ACTIVE",
          isPublic: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        include: {
          reward: {
            select: {
              rewardType: true,
              rewardValue: true,
              description: true,
            },
          },
        },
        orderBy: { endsAt: "asc" },
        take: 10,
      });

      // Get customer participation if authenticated
      let participantMap: Record<string, {
        currentProgress: number;
        progressPercent: number;
        status: string;
        completedAt: Date | null;
        claimedAt: Date | null;
      }> = {};

      if (internalCustomerId && challenges.length > 0) {
        const participants = await prisma.challengeParticipant.findMany({
          where: {
            customerId: internalCustomerId,
            challengeId: { in: challenges.map(c => c.id) },
          },
          select: {
            challengeId: true,
            currentProgress: true,
            progressPercent: true,
            status: true,
            completedAt: true,
            claimedAt: true,
          },
        });

        participantMap = Object.fromEntries(
          participants.map(p => [p.challengeId, {
            currentProgress: p.currentProgress,
            progressPercent: p.progressPercent,
            status: p.status,
            completedAt: p.completedAt,
            claimedAt: p.claimedAt,
          }])
        );
      }

      // Format challenges for response
      const formattedChallenges = challenges.map(challenge => {
        const participant = participantMap[challenge.id];
        const reward = challenge.reward;

        return {
          id: challenge.id,
          name: challenge.name,
          description: challenge.description,
          imageUrl: challenge.imageUrl,
          objectiveType: challenge.objectiveType,
          targetValue: challenge.targetValue,
          endsAt: challenge.endsAt?.toISOString(),
          totalParticipants: challenge.totalParticipants,
          // Customer progress (if logged in and participating)
          userProgress: participant ? {
            current: participant.currentProgress,
            target: challenge.targetValue,
            percent: participant.progressPercent,
            status: participant.status,
          } : null,
          // Reward info
          reward: reward ? {
            type: reward.rewardType,
            value: reward.rewardValue,
            description: reward.description,
          } : null,
        };
      });

      return json({
        success: true,
        enabled: true,
        isAuthenticated: !!shopifyCustomerId,
        challenges: formattedChallenges,
        pointsCurrency: {
          name: pointsConfig.currencyName || "Points",
          icon: pointsConfig.currencyIcon || "⭐",
        },
      }, { headers });

    } catch (error: any) {
      log.error("Challenges endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load challenges",
        challenges: [],
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MISSIONS endpoint - Gamified challenges with XP, streaks, and combos
  // Returns player stats, missions grouped by cadence, and pending events
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "missions") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const shopifyCustomerId = url.searchParams.get("logged_in_customer_id");

    try {
      // Check if missions/challenges are enabled via PointsConfig
      const pointsConfig = await prisma.pointsConfig.findUnique({
        where: { shop },
        select: {
          challengesEnabled: true,
          missionsEnabled: true,
          currencyName: true,
          currencyIcon: true,
        },
      });

      // Use missionsEnabled if available, otherwise fall back to challengesEnabled
      const missionsEnabled = pointsConfig?.missionsEnabled ?? pointsConfig?.challengesEnabled ?? false;

      if (!missionsEnabled) {
        return json({
          success: true,
          enabled: false,
          player: null,
          missions: { daily: [], weekly: [], monthly: [], special: [] },
          pendingEvents: [],
          message: "Missions are not enabled for this store",
        }, { headers });
      }

      // Resolve internal customer ID from Shopify customer ID
      let internalCustomerId: string | null = null;
      if (shopifyCustomerId) {
        const customer = await prisma.customer.findFirst({
          where: { shop, shopifyCustomerId },
          select: { id: true },
        });
        internalCustomerId = customer?.id || null;
      }

      // If not authenticated, return basic structure with empty missions
      if (!internalCustomerId) {
        return json({
          success: true,
          enabled: true,
          isAuthenticated: false,
          player: null,
          missions: { daily: [], weekly: [], monthly: [], special: [] },
          pendingEvents: [],
          pointsCurrency: {
            name: pointsConfig?.currencyName || "Points",
            icon: pointsConfig?.currencyIcon || "⭐",
          },
        }, { headers });
      }

      // Get full missions data with player stats using the mission stats service
      const missionsData = await getMissionsForCustomer(shop, internalCustomerId);

      return json({
        success: true,
        enabled: true,
        isAuthenticated: true,
        player: missionsData.player,
        missions: missionsData.missions,
        pendingEvents: missionsData.pendingEvents,
        pointsCurrency: {
          name: pointsConfig?.currencyName || "Points",
          icon: pointsConfig?.currencyIcon || "⭐",
        },
      }, { headers });

    } catch (error: any) {
      log.error("Missions endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load missions",
        player: null,
        missions: { daily: [], weekly: [], monthly: [], special: [] },
        pendingEvents: [],
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MISSIONS/EVENTS endpoint - Get pending animation events (GET)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "missions/events") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const shopifyCustomerId = url.searchParams.get("logged_in_customer_id");

    if (!shopifyCustomerId) {
      return json({
        success: false,
        error: "Please sign in to view events"
      }, { status: 401, headers });
    }

    try {
      // Resolve internal customer ID
      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId },
        select: { id: true },
      });

      if (!customer) {
        return json({
          success: true,
          events: [],
        }, { headers });
      }

      const events = await getUnacknowledgedEvents(shop, customer.id);

      return json({
        success: true,
        events,
      }, { headers });

    } catch (error: any) {
      log.error("Missions events endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load events",
        events: [],
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MISSIONS/PLAYER endpoint - Get just player stats (lightweight)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "missions/player") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const shopifyCustomerId = url.searchParams.get("logged_in_customer_id");

    if (!shopifyCustomerId) {
      return json({
        success: false,
        error: "Please sign in to view player stats"
      }, { status: 401, headers });
    }

    try {
      // Resolve internal customer ID
      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId },
        select: { id: true },
      });

      if (!customer) {
        return json({
          success: true,
          player: null,
        }, { headers });
      }

      const player = await getPlayerStats(shop, customer.id);

      return json({
        success: true,
        player,
      }, { headers });

    } catch (error: any) {
      log.error("Missions player endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load player stats",
        player: null,
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOMER-SUMMARY endpoint - Compact data for rewards hub CTA
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "customer-summary") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const customerId = url.searchParams.get("logged_in_customer_id");

    try {
      // Get feature enablement state
      const features = await getEnabledFeatures(shop);

      // Count active activities for highlights (only if features are enabled)
      const [activeRaffles, activeMysteryBoxes] = await Promise.all([
        features.raffles
          ? prisma.raffle.count({
              where: {
                shop,
                status: "ACTIVE",
                isPublic: true,
                endsAt: { gt: new Date() },
              },
            })
          : 0,
        features.mysteryBoxes
          ? prisma.mysteryBox.count({
              where: {
                shop,
                status: "ACTIVE",
                isPublic: true,
                endsAt: { gt: new Date() },
              },
            })
          : 0,
      ]);

      // Get customer data if authenticated
      let customerData = null;
      if (customerId) {
        const customer = await prisma.customer.findFirst({
          where: { shop, shopifyCustomerId: customerId },
          select: {
            pointsBalance: true,
            storeCredit: true,
            currentTier: {
              select: {
                name: true,
              },
            },
          },
        });

        if (customer) {
          customerData = {
            pointsBalance: Number(customer.pointsBalance || 0),
            storeCredit: Number(customer.storeCredit || 0),
            tierName: customer.currentTier?.name || "Member",
          };
        }
      }

      return json({
        success: true,
        features: {
          pointsSystem: features.pointsSystem,
          raffles: features.raffles,
          mysteryBoxes: features.mysteryBoxes,
          challenges: features.challenges,
        },
        customer: customerData,
        activeRaffles,
        activeChallenges: 0, // Challenges not yet implemented
        mysteryBoxesAvailable: activeMysteryBoxes,
        isAuthenticated: !!customerId,
      }, { headers });

    } catch (error: any) {
      log.error("Customer summary endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load summary",
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GIFT-CARDS endpoint — bundles and issued cards for storefront widget
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "gift-cards" && request.method === "GET") {
    const shop = session?.shop;
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop) {
      return json({ success: false, error: "Authentication required" }, { status: 401, headers });
    }
    if (!customerId) {
      return json({ success: false, error: "Customer ID required" }, { status: 400, headers });
    }

    try {
      const [config, bundles, issuedCards] = await Promise.all([
        prisma.giftCardConfig.findUnique({ where: { shop } }),
        prisma.giftCardBundle.findMany({
          where: { shop, isActive: true },
          orderBy: { giftCardValue: "asc" },
        }),
        prisma.issuedGiftCard.findMany({
          where: { shop, customerId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

      // Feature disabled
      if (!config?.enabled) {
        return json({ success: true, enabled: false, bundles: [], issuedGiftCards: [] }, { headers });
      }

      const transformedBundles = bundles.map((b) => ({
        id: b.id,
        name: b.name,
        bundleType: b.bundleType,
        giftCardValue: Number(b.giftCardValue),
        cashbackCost: Number(b.cashbackCost),
        description: b.description ?? null,
      }));

      const transformedCards = issuedCards.map((c) => ({
        id: c.id,
        code: c.maskedCode ?? null,
        giftCardValue: Number(c.giftCardValue),
        remainingBalance: Number(c.remainingBalance ?? c.giftCardValue),
        currency: c.currency,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        status: c.status,
      }));

      // Store credit balance from membership data
      const memberRecord = await prisma.customer.findFirst({ where: { shop, shopifyCustomerId: customerId } });
      const storeCredit = memberRecord ? Number(memberRecord.storeCredit ?? 0) : 0;

      return json({
        success: true,
        enabled: true,
        bundles: transformedBundles,
        issuedGiftCards: transformedCards,
        storeCredit,
        currency: config.currency ?? "USD",
      }, { headers });
    } catch (error) {
      log.error("Failed to load gift card data:", error);
      return json({ success: false, error: "Failed to load gift card data" }, { status: 500, headers });
    }
  }

  // 404 for unknown paths
  log.debug('Unknown path requested:', proxyPath);
  return json({
    success: false,
    error: "not_found",
    message: `Endpoint '${proxyPath}' not found`,
    availablePaths: ["test", "membership", "feature-flags", "raffles", "mystery-boxes", "challenges", "missions", "missions/events", "missions/events/ack", "missions/player", "customer-summary", "gift-cards", "gift-cards/convert"]
  }, { status: 404, headers });
}

// Handle POST and OPTIONS requests
export async function action({ request, params }: ActionFunctionArgs) {
  const proxyPath = params["*"] || "";

  // CORS preflight
  if (request.method === "OPTIONS") {
    const origin = request.headers.get('origin') || '';
    const isValidShopifyOrigin = /^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(origin) ||
                                  /^https:\/\/admin\.shopify\.com$/.test(origin);

    const allowedOrigin = isValidShopifyOrigin ? origin : 'https://admin.shopify.com';

    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Authenticate the app proxy request
  let session;
  try {
    const authResult = await authenticate.public.appProxy(request);
    session = authResult.session;
  } catch (authError: any) {
    log.error('[Action] AUTH FAILED', { message: authError.message });
    return proxyError("Authentication failed", { status: 401 });
  }

  const origin = request.headers.get('origin') || '';
  const isValidShopifyOrigin = /^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(origin) ||
                                /^https:\/\/admin\.shopify\.com$/.test(origin) ||
                                origin === '';
  const allowedOrigin = isValidShopifyOrigin && origin ? origin :
                        session?.shop ? `https://${session.shop}` :
                        'https://admin.shopify.com';

  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RAFFLES POST - Purchase entries or claim free entry
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "raffles") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in to enter raffles", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { intent, raffleId, quantity = 1 } = body;

      if (!raffleId) {
        return proxyError("Raffle ID is required", { status: 400, headers });
      }

      const idem = await claimIdempotencyKey("raffle-entry", shop, loggedInCustomerId, request);
      if (!idem.ok && idem.reason === "duplicate") {
        return proxyError("Duplicate request — entry already being processed", { status: 409, headers });
      }

      // Resolve internal customer ID from Shopify customer ID (from signed URL, not body)
      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId: loggedInCustomerId },
        select: { id: true, pointsBalance: true },
      });

      if (!customer) {
        return proxyError("Customer not found. Please contact support.", { status: 404, headers });
      }

      // Free entry claim
      if (intent === "free-entry") {
        const result = await claimDailyFreeEntry(shop, customer.id, raffleId);

        if (!result.success) {
          log.warn("Free entry rejected:", result.error, { shop, customerId: customer.id, raffleId });
          return proxyError(result.error || "Failed to claim free entry", { headers });
        }

        return json({
          success: true,
          newEntryCount: result.totalEntriesCount || result.entriesCount,
          totalEntries: result.totalEntriesCount || result.entriesCount,
          message: "Free entry claimed!",
        }, { headers });
      }

      // Purchase entries (intent === "purchase" or default)
      const result = await purchaseRaffleEntries({
        shop,
        customerId: customer.id,
        raffleId,
        quantity: Math.max(1, Math.min(10, parseInt(quantity) || 1)),
      });

      if (!result.success) {
        log.warn("Raffle purchase rejected:", result.error, { shop, customerId: customer.id, raffleId, quantity });
        return proxyError(result.error || "Purchase failed", { headers });
      }

      return json({
        success: true,
        newBalance: result.newBalance,
        newEntryCount: result.totalEntriesCount || result.entriesCount,
        totalEntries: result.totalEntriesCount || result.entriesCount,
        pointsSpent: result.pointsSpent,
        bonuses: result.bonuses ? Object.keys(result.bonuses) : [],
        message: `Successfully purchased ${result.entriesCount || quantity} entries!`,
      }, { headers });

    } catch (error: any) {
      log.error("Raffle entry error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to enter raffle. Please try again.", { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MISSIONS/EVENTS/ACK POST - Acknowledge events after display
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "missions/events/ack") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { eventIds } = body;

      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return proxyError("Event IDs are required", { status: 400, headers });
      }

      const count = await acknowledgeEvents(eventIds);

      return json({ success: true, acknowledgedCount: count }, { headers });

    } catch (error: any) {
      log.error("Missions events ack error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to acknowledge events", { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RAFFLES/ENTER POST - Enter a raffle from storefront
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "raffles/enter") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in to enter raffles", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { raffleId, quantity = 1 } = body;

      if (!raffleId) {
        return proxyError("Raffle ID is required", { status: 400, headers });
      }

      const idem = await claimIdempotencyKey("raffle-enter", shop, loggedInCustomerId, request);
      if (!idem.ok && idem.reason === "duplicate") {
        return proxyError("Duplicate request — entry already being processed", { status: 409, headers });
      }

      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId: loggedInCustomerId },
        select: { id: true, pointsBalance: true },
      });

      if (!customer) {
        return proxyError("Customer not found. Please contact support.", { status: 404, headers });
      }

      const result = await purchaseRaffleEntries({
        shop,
        customerId: customer.id,
        raffleId,
        quantity: Math.max(1, Math.min(10, parseInt(quantity) || 1)),
      });

      if (!result.success) {
        return proxyError(result.error || "Operation failed", { headers });
      }

      return json({
        success: true,
        entriesAdded: quantity,
        totalEntries: result.totalEntriesCount || result.entriesCount,
        pointsSpent: result.pointsSpent,
        newPointsBalance: result.newBalance,
      }, { headers });

    } catch (error: any) {
      log.error("Raffle entry error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to enter raffle. Please try again.", { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHALLENGES/CLAIM POST - Claim a completed challenge reward
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "challenges/claim") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in to claim rewards", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { challengeId } = body;

      if (!challengeId) {
        return proxyError("Challenge ID is required", { status: 400, headers });
      }

      const idem = await claimIdempotencyKey("challenge-claim", shop, loggedInCustomerId, request);
      if (!idem.ok && idem.reason === "duplicate") {
        return proxyError("Duplicate request — reward already being claimed", { status: 409, headers });
      }

      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId: loggedInCustomerId },
        select: { id: true },
      });

      if (!customer) {
        return proxyError("Customer not found. Please contact support.", { status: 404, headers });
      }

      let proxyAdmin: any;
      try {
        const unauthResult = await unauthenticated.admin(shop);
        proxyAdmin = unauthResult.admin;
      } catch (e) {
        console.error(`[ProxyChallenges] Failed to get admin API (non-fatal):`, e);
      }

      const result = await claimChallengeReward(shop, customer.id, challengeId, proxyAdmin);

      if (!result.success) {
        return proxyError(result.error || "Operation failed", { headers });
      }

      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id },
        select: { pointsBalance: true },
      });

      return json({
        success: true,
        reward: {
          type: result.rewardType,
          value: result.rewardValue,
          description: result.message || 'Reward claimed!',
        },
        newPointsBalance: updatedCustomer?.pointsBalance || 0,
      }, { headers });

    } catch (error: any) {
      log.error("Challenge claim error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to claim reward. Please try again.", { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHALLENGES/JOIN POST - Explicitly join a challenge
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "challenges/join") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in to join challenges", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { challengeId } = body;

      if (!challengeId) {
        return proxyError("Challenge ID is required", { status: 400, headers });
      }

      // Resolve internal customer ID from Shopify customer ID.
      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId: loggedInCustomerId },
        select: { id: true },
      });
      if (!customer) {
        return proxyError("Customer not found", { status: 404, headers });
      }

      // All eligibility + idempotent-join + counter-increment logic lives
      // in `joinChallenge`. This handler is just the HTTP boundary.
      const result = await joinChallenge(shop, customer.id, challengeId);

      if (!result.success) {
        // Map the service's error codes to HTTP statuses.
        const status =
          result.error === "challenge_not_found" ? 404 :
          result.error === "tier_not_allowed" ? 403 :
          result.error === "customer_not_found" ? 404 :
          400;
        return proxyError(result.message ?? "Unable to join challenge", { status, headers });
      }

      return json(
        {
          success: true,
          alreadyJoined: !!result.alreadyJoined,
          participant: result.participant,
          challenge: result.challenge,
        },
        { headers }
      );
    } catch (error: any) {
      log.error("Challenge join error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to join challenge. Please try again.", { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MYSTERY-BOXES/OPEN POST - Open a mystery box
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "mystery-boxes/open") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in to open mystery boxes", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { boxId } = body;

      if (!boxId) {
        return proxyError("Box ID is required", { status: 400, headers });
      }

      const idem = await claimIdempotencyKey("mystery-box-open", shop, loggedInCustomerId, request);
      if (!idem.ok && idem.reason === "duplicate") {
        return proxyError("Duplicate request — box already being opened", { status: 409, headers });
      }

      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId: loggedInCustomerId },
        select: { id: true, pointsBalance: true },
      });

      if (!customer) {
        return proxyError("Customer not found", { status: 404, headers });
      }

      const result = await openMysteryBox({
        shop,
        customerId: customer.id,
        boxId,
      });

      if (!result.success) {
        return proxyError(result.error || "Failed to open mystery box", { headers });
      }

      return json({
        success: true,
        openId: result.openId,
        reward: {
          name: result.rewardName,
          description: result.rewardDescription,
          type: result.rewardType,
          rarity: result.rarity,
          value: result.rewardValue,
        },
        pointsSpent: result.pointsSpent,
        newPointsBalance: result.newBalance,
      }, { headers });

    } catch (error: any) {
      log.error("Mystery box open error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to open mystery box. Please try again.", { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GIFT-CARDS/CONVERT POST - Convert store credit cashback to a gift card
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "gift-cards/convert") {
    const shop = session?.shop;

    if (!shop) {
      return proxyError("Authentication required", { status: 401, headers });
    }

    const loggedInCustomerId = getProxyCustomerId(request);
    if (!loggedInCustomerId) {
      return proxyError("Please sign in to redeem gift cards", { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { bundleId } = body;

      if (!bundleId) {
        return proxyError("Bundle ID is required", { status: 400, headers });
      }

      const idem = await claimIdempotencyKey("gift-card-convert", shop, loggedInCustomerId, request);
      if (!idem.ok && idem.reason === "duplicate") {
        return proxyError("Duplicate request — redemption already being processed", { status: 409, headers });
      }

      // Look up bundle and config in parallel
      const [bundle, config] = await Promise.all([
        prisma.giftCardBundle.findFirst({ where: { id: bundleId, shop, isActive: true } }),
        prisma.giftCardConfig.findUnique({ where: { shop } }),
      ]);

      if (!bundle) {
        return proxyError("Bundle not found or no longer available", { status: 404, headers });
      }
      if (!config?.enabled) {
        return proxyError("Gift cards are not enabled for this store", { status: 403, headers });
      }

      // Look up internal customer (ID from signed URL, never body)
      const customer = await prisma.customer.findFirst({
        where: { shop, shopifyCustomerId: loggedInCustomerId },
        select: { id: true, storeCredit: true },
      });

      if (!customer) {
        return proxyError("Customer not found. Please contact support.", { status: 404, headers });
      }

      const cashbackCost = Number(bundle.cashbackCost);
      if (Number(customer.storeCredit) < cashbackCost) {
        return proxyError(
          `Insufficient store credit. You need ${cashbackCost} but have ${Number(customer.storeCredit).toFixed(2)}.`,
          { status: 400, headers }
        );
      }

      // Get admin API for Shopify gift card creation
      let proxyAdmin: any;
      try {
        const unauthResult = await unauthenticated.admin(shop);
        proxyAdmin = unauthResult.admin;
      } catch (e) {
        log.error("[ProxyGiftCards] Failed to get admin API:", e);
        return proxyError("Failed to connect to store. Please try again.", { status: 503, headers });
      }

      const result = await GiftCardService.convertCashbackToGiftCard(proxyAdmin, {
        shop,
        customerId: customer.id,
        amount: cashbackCost,
        currency: config.currency ?? "USD",
      });

      if (!result.success) {
        log.warn("Gift card convert rejected:", result.error, { shop, customerId: customer.id, bundleId });
        return proxyError(result.error || "Conversion failed", { headers });
      }

      // Fetch updated store credit balance
      const updated = await prisma.customer.findFirst({
        where: { id: customer.id },
        select: { storeCredit: true },
      });

      return json({
        success: true,
        giftCardId: result.giftCardId,
        issuedGiftCardId: result.issuedGiftCardId,
        lastFourDigits: result.lastFourDigits,
        amountConverted: cashbackCost,
        newStoreCredit: Number(updated?.storeCredit ?? 0),
        message: "Gift card issued! Check your email for the code.",
      }, { headers });

    } catch (error: any) {
      log.error("Gift card convert error:", error.message, error.stack?.split('\n').slice(0, 5).join('\n'));
      return proxyError("Failed to convert store credit. Please try again.", { status: 500, headers });
    }
  }

  return json({ error: "Method not allowed" }, { status: 405, headers });
}