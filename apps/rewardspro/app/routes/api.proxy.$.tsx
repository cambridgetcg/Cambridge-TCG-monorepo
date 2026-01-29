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
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAuroraClient } from "../utils/aurora-data-api";
import db from "../db.server";
import type { SqlParameter } from "@aws-sdk/client-rds-data";
// SECURITY: Use Redis-backed rate limiter for effective distributed rate limiting
import { appProxyRateLimit } from "../utils/rate-limiter-redis";
// Points system imports
import { getActiveEvents } from "../services/points-bonus-events.server";
import { getRedemptionTiers } from "../services/points-redemption.server";
import { getEnabledFeatures } from "../services/points-config.server";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
          ss."widgetSecondaryTextColor",
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
          secondaryTextColor: row.widgetSecondaryTextColor || null, // null = auto-derive from mode
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
          widgetSecondaryTextColor: row.widgetSecondaryTextColor,
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
  // RAFFLES endpoint - List active raffles for storefront teasers
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

    try {
      // Check if raffles feature is enabled
      const features = await getEnabledFeatures(shop);
      if (!features.raffles) {
        return json({
          success: true,
          enabled: false,
          raffles: [],
          message: "Raffles are not enabled for this store",
        }, { headers });
      }

      // Get active and public raffles
      const raffles = await db.raffle.findMany({
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
          _count: {
            select: { entries: true },
          },
        },
        orderBy: { endsAt: "asc" },
        take: 10,
      });

      // Get customer entry counts if authenticated
      let customerEntries: Record<string, number> = {};
      if (customerId) {
        const customer = await db.customer.findFirst({
          where: { shop, shopifyCustomerId: customerId },
          select: { id: true },
        });

        if (customer) {
          const entries = await db.raffleEntry.groupBy({
            by: ["raffleId"],
            where: {
              customerId: customer.id,
              raffleId: { in: raffles.map(r => r.id) },
            },
            _sum: { quantity: true },
          });
          customerEntries = Object.fromEntries(
            entries.map(e => [e.raffleId, e._sum.quantity || 0])
          );
        }
      }

      const formattedRaffles = raffles.map(raffle => ({
        id: raffle.id,
        name: raffle.name,
        description: raffle.description,
        imageUrl: raffle.imageUrl,
        endDate: raffle.endsAt?.toISOString(),
        entryCost: raffle.entryCost || 0,
        totalEntries: raffle._count.entries,
        status: "ACTIVE",
        customerEntries: customerEntries[raffle.id] || 0,
        maxEntriesPerCustomer: raffle.maxEntriesPerCustomer,
      }));

      return json({
        success: true,
        enabled: true,
        raffles: formattedRaffles,
        isAuthenticated: !!customerId,
      }, { headers });

    } catch (error: any) {
      log.error("Raffles endpoint error:", error.message);
      return json({
        success: false,
        error: "Failed to load raffles",
        raffles: [],
      }, { status: 500, headers });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MYSTERY-BOXES endpoint - List active mystery boxes for storefront teasers
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "mystery-boxes") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    try {
      // Check if mystery boxes feature is enabled
      const features = await getEnabledFeatures(shop);
      if (!features.mysteryBoxes) {
        return json({
          success: true,
          enabled: false,
          boxes: [],
          message: "Mystery boxes are not enabled for this store",
        }, { headers });
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

        return {
          id: box.id,
          name: box.name,
          description: box.description,
          imageUrl: box.imageUrl,
          pointsCost: box.openCost || 0,
          maxOpensPerCustomer: box.maxOpensPerCustomer,
          totalOpens: box._count.opens,
          isActive: true,
          rarityPreview,
        };
      });

      return json({
        success: true,
        enabled: true,
        boxes: formattedBoxes,
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
  // CHALLENGES endpoint - List active challenges for storefront teasers
  // Note: Challenges feature is in development, returns placeholder data
  // ═══════════════════════════════════════════════════════════════════════
  if (proxyPath === "challenges") {
    const shop = session?.shop;

    if (!shop) {
      return json({
        success: false,
        error: "Authentication required"
      }, { status: 401, headers });
    }

    const customerId = url.searchParams.get("logged_in_customer_id");

    try {
      // Check if challenges are enabled via PointsConfig
      const pointsConfig = await db.pointsConfig.findUnique({
        where: { shop },
        select: {
          challengesEnabled: true,
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

      // Challenges model doesn't exist yet - return empty for now
      // When Challenge model is added, query will go here
      return json({
        success: true,
        enabled: true,
        challenges: [],
        isAuthenticated: !!customerId,
        message: "Challenges coming soon",
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
    availablePaths: ["test", "membership", "feature-flags", "raffles", "mystery-boxes", "challenges", "customer-summary"]
  }, { status: 404, headers });
}

// Handle OPTIONS requests for CORS preflight
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    // SECURITY: Validate origin for preflight requests too
    const origin = request.headers.get('origin') || '';
    const isValidShopifyOrigin = /^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(origin) ||
                                  /^https:\/\/admin\.shopify\.com$/.test(origin);

    const allowedOrigin = isValidShopifyOrigin ? origin : 'https://admin.shopify.com';

    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
      },
    });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}