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
import db from "../db.server";
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
import { openMysteryBox } from "../services/mystery-box-open.server";
// Mission gamification imports
import { getMissionsForCustomer, getPlayerStats } from "../services/mission-stats.server";
import { acknowledgeEvents, getUnacknowledgedEvents } from "../services/mission-events.server";

// ============================================================================
// Configurable Logging - Reduces production log verbosity
// Set PROXY_LOG_LEVEL=debug for troubleshooting, default is 'error'
// ============================================================================

// Debug logging controlled by PROXY_LOG_LEVEL environment variable
// Set PROXY_LOG_LEVEL=debug for troubleshooting
const FORCE_DEBUG = true; // TEMP: Enable full debug logging to diagnose raffles 500

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
        const higherTiers = await db.tier.findMany({
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
        const tierProducts = higherTierIds.length > 0 ? await db.tierProduct.findMany({
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
          primaryColor: row.widgetPrimaryColor || '#5C6AC4',
          backgroundColor: row.widgetBackgroundColor || '#FFFFFF',
          textColor: row.widgetTextColor || '#212B36',
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
          ? db.raffle.count({
              where: {
                shop,
                status: "ACTIVE",
                isPublic: true,
                endsAt: { gt: new Date() },
              },
            })
          : 0,
        features.mysteryBoxes
          ? db.mysteryBox.count({
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

    try {
      // Step 1: Check if raffles feature is enabled
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
      log.debug('=== RAFFLES STEP 2: Querying active raffles ===');
      let raffles;
      try {
        raffles = await db.raffle.findMany({
          where: {
            shop,
            status: "ACTIVE",
            isPublic: true,
            endsAt: { gt: new Date() },
          },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            startsAt: true,
            endsAt: true,
            entryCost: true,
            maxEntriesPerCustomer: true,
            totalEntries: true,
            dailyFreeEntries: true,
            prizes: {
              select: { name: true },
              orderBy: { displayOrder: "asc" },
              take: 1,
            },
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

      // Step 3: Resolve customer, get entry counts and points balance
      let customerEntries: Record<string, number> = {};
      let pointsBalance = 0;
      let internalCustomerId: string | null = null;
      if (customerId) {
        log.debug('=== RAFFLES STEP 3: Resolving customer ===', { customerId });
        try {
          const customer = await db.customer.findFirst({
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
                const entries = await db.raffleEntry.groupBy({
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
      const formattedRaffles = raffles.map(raffle => ({
        id: raffle.id,
        name: raffle.name,
        description: raffle.description,
        imageUrl: raffle.imageUrl,
        endsAt: raffle.endsAt?.toISOString(),
        costPerEntry: raffle.entryCost || 0,
        totalEntries: raffle.totalEntries,
        prize: raffle.prizes[0]?.name || null,
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
        const customer = await db.customer.findFirst({
          where: { shop, shopifyCustomerId },
          select: { id: true, pointsBalance: true },
        });
        internalCustomerId = customer?.id || null;
        customerPointsBalance = Number(customer?.pointsBalance || 0);
      }

      // Get active and public mystery boxes
      const boxes = await db.mysteryBox.findMany({
        where: {
          shop,
          status: "ACTIVE",
          isPublic: true,
          endsAt: { gt: new Date() },
        },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          startsAt: true,
          endsAt: true,
          openCost: true,
          maxOpensPerCustomer: true,
          maxOpensTotal: true,
          totalOpens: true,
          rewards: {
            select: {
              rarity: true,
              probability: true,
            },
            orderBy: { probability: "desc" },
          },
          _count: {
            select: { opens: true },
          },
        },
        orderBy: { endsAt: "asc" },
        take: 10,
      });

      // Get customer's opens for each box if authenticated
      let customerOpensMap: Record<string, number> = {};
      if (internalCustomerId && boxes.length > 0) {
        const boxIds = boxes.map(b => b.id);
        const customerOpens = await db.mysteryBoxOpen.findMany({
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
      const formattedBoxes = boxes.map(box => {
        // Group rewards by rarity and sum probabilities
        const rarityMap: Record<string, number> = {};
        box.rewards.forEach(reward => {
          const rarity = reward.rarity || "COMMON";
          rarityMap[rarity] = (rarityMap[rarity] || 0) + Number(reward.probability || 0);
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
          totalOpens: box._count.opens,
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
      const pointsConfig = await db.pointsConfig.findUnique({
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
        const customer = await db.customer.findFirst({
          where: { shop, shopifyCustomerId },
          select: { id: true },
        });
        internalCustomerId = customer?.id || null;
      }

      // Get active public challenges
      const now = new Date();
      const challenges = await db.challenge.findMany({
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
        const participants = await db.challengeParticipant.findMany({
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
      const pointsConfig = await db.pointsConfig.findUnique({
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
        const customer = await db.customer.findFirst({
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
      const customer = await db.customer.findFirst({
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
  // MISSIONS/EVENTS/ACK endpoint - Acknowledge events after display (POST)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "missions/events/ack" && request.method === "POST") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { eventIds, logged_in_customer_id } = body;

      if (!logged_in_customer_id) {
        return json({
          success: false,
          error: "Please sign in"
        }, { status: 401, headers });
      }

      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return json({
          success: false,
          error: "Event IDs are required"
        }, { status: 400, headers });
      }

      const count = await acknowledgeEvents(eventIds);

      return json({
        success: true,
        acknowledgedCount: count,
      }, { headers });

    } catch (error: any) {
      log.error("Missions events ack error:", error.message);
      return json({
        success: false,
        error: "Failed to acknowledge events",
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
      const customer = await db.customer.findFirst({
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
  // RAFFLES/ENTER endpoint - Enter a raffle from storefront (POST)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "raffles/enter" && request.method === "POST") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { raffleId, quantity = 1, logged_in_customer_id } = body;

      if (!raffleId) {
        return json({
          success: false,
          error: "Raffle ID is required",
        }, { status: 400, headers });
      }

      if (!logged_in_customer_id) {
        return json({
          success: false,
          error: "Please sign in to enter raffles",
        }, { status: 401, headers });
      }

      // Resolve internal customer ID
      const customer = await db.customer.findFirst({
        where: { shop, shopifyCustomerId: logged_in_customer_id },
        select: { id: true, pointsBalance: true },
      });

      if (!customer) {
        return json({
          success: false,
          error: "Customer not found. Please contact support.",
        }, { status: 404, headers });
      }

      // Use the existing raffle entry service
      const result = await purchaseRaffleEntries({
        shop,
        customerId: customer.id,
        raffleId,
        quantity: Math.max(1, Math.min(10, parseInt(quantity) || 1)),
      });

      if (!result.success) {
        return json({
          success: false,
          error: result.error,
        }, { headers });
      }

      return json({
        success: true,
        entriesAdded: quantity,
        totalEntries: result.totalEntriesCount || result.entriesCount,
        pointsSpent: result.pointsSpent,
        newPointsBalance: result.newBalance,
      }, { headers });

    } catch (error: any) {
      log.error("Raffle entry error:", error.message);
      return json({
        success: false,
        error: "Failed to enter raffle. Please try again.",
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHALLENGES/CLAIM endpoint - Claim a completed challenge reward (POST)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "challenges/claim" && request.method === "POST") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { challengeId, logged_in_customer_id } = body;

      if (!challengeId) {
        return json({
          success: false,
          error: "Challenge ID is required",
        }, { status: 400, headers });
      }

      if (!logged_in_customer_id) {
        return json({
          success: false,
          error: "Please sign in to claim rewards",
        }, { status: 401, headers });
      }

      // Resolve internal customer ID
      const customer = await db.customer.findFirst({
        where: { shop, shopifyCustomerId: logged_in_customer_id },
        select: { id: true },
      });

      if (!customer) {
        return json({
          success: false,
          error: "Customer not found. Please contact support.",
        }, { status: 404, headers });
      }

      // Get admin API for Shopify discount creation
      let proxyAdmin: any;
      try {
        const unauthResult = await unauthenticated.admin(shop);
        proxyAdmin = unauthResult.admin;
      } catch (e) {
        console.error(`[ProxyChallenges] Failed to get admin API (non-fatal):`, e);
      }

      // Use the existing challenge claim service
      const result = await claimChallengeReward(shop, customer.id, challengeId, proxyAdmin);

      if (!result.success) {
        return json({
          success: false,
          error: result.error,
        }, { headers });
      }

      // Get updated points balance
      const updatedCustomer = await db.customer.findUnique({
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
      log.error("Challenge claim error:", error.message);
      return json({
        success: false,
        error: "Failed to claim reward. Please try again.",
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHALLENGES/JOIN endpoint - Explicitly join a challenge (POST)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "challenges/join" && request.method === "POST") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { challengeId, logged_in_customer_id } = body;

      if (!challengeId) {
        return json({ success: false, error: "Challenge ID is required" }, { headers });
      }

      // Resolve internal customer ID
      if (!logged_in_customer_id) {
        return json({ success: false, error: "Please sign in to join challenges" }, { status: 401, headers });
      }

      const customer = await db.customer.findFirst({
        where: { shop, shopifyCustomerId: logged_in_customer_id },
        select: { id: true, currentTierId: true },
      });

      if (!customer) {
        return json({ success: false, error: "Customer not found" }, { headers });
      }

      // Verify challenge exists and is active
      const now = new Date();
      const challenge = await db.challenge.findFirst({
        where: {
          id: challengeId,
          shop,
          status: "ACTIVE",
          isPublic: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        include: { reward: true },
      });

      if (!challenge) {
        return json({ success: false, error: "Challenge not found or not available" }, { headers });
      }

      // Check tier eligibility
      if (challenge.tierRestrictions) {
        const restrictions = challenge.tierRestrictions as { allowedTierIds?: string[] };
        if (restrictions.allowedTierIds?.length &&
            (!customer.currentTierId || !restrictions.allowedTierIds.includes(customer.currentTierId))) {
          return json({ success: false, error: "This challenge is not available for your tier" }, { headers });
        }
      }

      // Check if already participating
      const existing = await db.challengeParticipant.findUnique({
        where: {
          challengeId_customerId: { challengeId, customerId: customer.id },
        },
      });

      if (existing) {
        return json({
          success: true,
          alreadyJoined: true,
          participant: {
            id: existing.id,
            status: existing.status,
            currentProgress: existing.currentProgress,
            progressPercent: existing.progressPercent,
          },
        }, { headers });
      }

      // Create participant record
      const participant = await db.challengeParticipant.create({
        data: {
          challengeId,
          customerId: customer.id,
          shop,
          currentProgress: 0,
          progressPercent: 0,
          status: "IN_PROGRESS",
        },
      });

      // Update challenge statistics
      await db.challenge.update({
        where: { id: challengeId },
        data: { totalParticipants: { increment: 1 } },
      });

      log.info(`Customer ${customer.id} joined challenge ${challengeId}`);

      return json({
        success: true,
        alreadyJoined: false,
        participant: {
          id: participant.id,
          status: participant.status,
          currentProgress: participant.currentProgress,
          progressPercent: participant.progressPercent,
        },
        challenge: {
          id: challenge.id,
          name: challenge.name,
          targetValue: challenge.targetValue,
          objectiveType: challenge.objectiveType,
          reward: challenge.reward ? {
            type: challenge.reward.rewardType,
            description: challenge.reward.description,
          } : null,
        },
      }, { headers });

    } catch (error: any) {
      log.error("Challenge join error:", error.message);
      return json({
        success: false,
        error: "Failed to join challenge. Please try again.",
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MYSTERY-BOXES/OPEN endpoint - Open a mystery box (POST)
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "mystery-boxes/open" && request.method === "POST") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { boxId, logged_in_customer_id } = body;

      if (!boxId) {
        return json({ success: false, error: "Box ID is required" }, { headers });
      }

      // Resolve internal customer ID
      if (!logged_in_customer_id) {
        return json({ success: false, error: "Please sign in to open mystery boxes" }, { status: 401, headers });
      }

      const customer = await db.customer.findFirst({
        where: { shop, shopifyCustomerId: logged_in_customer_id },
        select: { id: true, pointsBalance: true },
      });

      if (!customer) {
        return json({ success: false, error: "Customer not found" }, { headers });
      }

      // Open the mystery box
      const result = await openMysteryBox({
        shop,
        customerId: customer.id,
        boxId,
      });

      if (!result.success) {
        return json({
          success: false,
          error: result.error || "Failed to open mystery box",
        }, { headers });
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
      log.error("Mystery box open error:", error.message);
      return json({
        success: false,
        error: "Failed to open mystery box. Please try again.",
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
          ? db.raffle.count({
              where: {
                shop,
                status: "ACTIVE",
                isPublic: true,
                endsAt: { gt: new Date() },
              },
            })
          : 0,
        features.mysteryBoxes
          ? db.mysteryBox.count({
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
        const customer = await db.customer.findFirst({
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

  // 404 for unknown paths
  log.debug('Unknown path requested:', proxyPath);
  return json({
    success: false,
    error: "not_found",
    message: `Endpoint '${proxyPath}' not found`,
    availablePaths: ["test", "membership", "feature-flags", "raffles", "mystery-boxes", "challenges", "missions", "missions/events", "missions/events/ack", "missions/player", "customer-summary"]
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
    return json({ success: false, error: "Authentication failed" }, { status: 401 });
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
      return json({ success: false, error: "Authentication required" }, { status: 401, headers });
    }

    try {
      const body = await request.json();
      const { intent, raffleId, quantity = 1, logged_in_customer_id } = body;

      if (!logged_in_customer_id) {
        return json({ success: false, error: "Please sign in to enter raffles" }, { status: 401, headers });
      }

      if (!raffleId) {
        return json({ success: false, error: "Raffle ID is required" }, { status: 400, headers });
      }

      // Resolve internal customer ID from Shopify customer ID
      const customer = await db.customer.findFirst({
        where: { shop, shopifyCustomerId: logged_in_customer_id },
        select: { id: true, pointsBalance: true },
      });

      if (!customer) {
        return json({ success: false, error: "Customer not found. Please contact support." }, { status: 404, headers });
      }

      // Free entry claim
      if (intent === "free-entry") {
        const result = await claimDailyFreeEntry(shop, customer.id, raffleId);

        if (!result.success) {
          return json({ success: false, error: result.error }, { headers });
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
        return json({ success: false, error: result.error }, { headers });
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
      return json({ success: false, error: "Failed to enter raffle. Please try again." }, { status: 500, headers });
    }
  }

  return json({ error: "Method not allowed" }, { status: 405, headers });
}