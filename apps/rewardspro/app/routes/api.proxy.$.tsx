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
import type { SqlParameter } from "@aws-sdk/client-rds-data";
import { appProxyRateLimit } from "../utils/rate-limiter";

// ============================================================================
// Configurable Logging - Reduces production log verbosity
// Set PROXY_LOG_LEVEL=debug for troubleshooting, default is 'error'
// ============================================================================

const LOG_LEVEL = process.env.PROXY_LOG_LEVEL || 'error';
const isDebugLogging = LOG_LEVEL === 'debug';
const isInfoLogging = LOG_LEVEL === 'info' || isDebugLogging;

const log = {
  debug: (...args: unknown[]) => isDebugLogging && console.log('[Proxy]', ...args),
  info: (...args: unknown[]) => isInfoLogging && console.log('[Proxy]', ...args),
  warn: (...args: unknown[]) => console.warn('[Proxy]', ...args),
  error: (...args: unknown[]) => console.error('[Proxy]', ...args),
};

// NOTE: calculateTierProgress function removed (2025-12-20)
// Progress is now pre-computed in CustomerTierState and updated by write path

export async function loader({ request, params }: LoaderFunctionArgs) {
  const proxyPath = params["*"] || "";
  const url = new URL(request.url);

  log.debug('Request received:', { path: proxyPath });

  // SECURITY: Rate limiting to prevent abuse
  const rateLimitResponse = await appProxyRateLimit(request);
  if (rateLimitResponse) {
    log.warn('Rate limit exceeded for request');
    return rateLimitResponse;
  }

  // SECURITY: Authenticate the app proxy request with HMAC validation
  // This ensures the request is coming from Shopify and not a direct attack
  let session;
  try {
    const authResult = await authenticate.public.appProxy(request);
    session = authResult.session;
    log.debug('Proxy authentication successful');
  } catch (authError: any) {
    log.error('Proxy authentication failed:', authError.message);
    return json({
      success: false,
      error: "Authentication failed",
      message: "Unable to authenticate proxy request"
    }, { status: 401 });
  }

  // CORS headers for all responses with caching
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    // Cache for 60 seconds, serve stale content while revalidating for up to 30 more seconds
    "Cache-Control": "private, max-age=60, stale-while-revalidate=30"
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
      // Use direct Data API for customer lookup with pre-computed data
      const dataApi = getAuroraClient();

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

          -- Shop settings for theme
          ss."storeCurrency",
          ss."widgetThemeMode",
          ss."widgetPrimaryColor",
          ss."widgetBackgroundColor",
          ss."widgetTextColor",
          ss."widgetAccentColor",
          ss."widgetBorderRadius",
          ss."widgetFontFamily"

        FROM "Customer" c
        LEFT JOIN "CustomerTierState" cts ON cts."customerId" = c.id
        LEFT JOIN "Tier" t ON t.id = cts."effectiveTierId"
        LEFT JOIN "ShopSettings" ss ON ss.shop = c.shop
        WHERE c.shop = :shopDomain
          AND c."shopifyCustomerId" = :shopifyCustomerId
        LIMIT 1
      `;

      const parameters: SqlParameter[] = [
        { name: 'shopDomain', value: { stringValue: shop } },
        { name: 'shopifyCustomerId', value: { stringValue: customerId } }
      ];

      const startTime = Date.now();
      const result = await dataApi.executeStatement(sql, parameters);
      const executionTime = Date.now() - startTime;

      log.debug('Single query completed:', { executionTime: `${executionTime}ms`, found: !!(result.records?.length) });

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

      const row = result.records[0];

      log.debug('Customer found:', {
        id: row.id,
        tier: row.tier_name || 'none',
        tierSource: row.tierSource || 'none',
        progress: row.progressPercent || 0
      });

      // Build response directly from query result - no additional calculations!
      const responseData = {
        success: true,
        customer: {
          id: row.id,
          shopifyId: row.shopifyCustomerId,
          email: row.email,
          memberSince: row.createdAt,
          totalSpent: Number(row.totalSpent || 0),
          totalRefunded: Number(row.totalRefunded || 0),
          netSpent: Number(row.netSpent || 0),
          orderCount: Number(row.orderCount || 0)
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
          borderRadius: row.widgetBorderRadius || 12,
          fontFamily: row.widgetFontFamily || 'inherit',
        },
        settings: {
          currency: row.storeCurrency || 'USD',
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

      log.info('Success response:', {
        tier: responseData.membership.tier?.name || 'none',
        tierSource: responseData.membership.tierSource,
        balance: responseData.balance.storeCredit,
        progress: responseData.tierProgress.progressPercent
      });

      return json(responseData, { headers });

    } catch (error: any) {
      // Log error internally but don't expose details to client
      log.error('Membership endpoint error:', error.message);

      // Return sanitized error response (no stack traces or internal details)
      return json({
        success: false,
        error: "service_error",
        message: "Unable to load rewards data. Please try again later.",
        requiresLogin: false
      }, { status: 500, headers });
    }
  }

  // 404 for unknown paths
  log.debug('Unknown path requested:', proxyPath);
  return json({
    success: false,
    error: "not_found",
    message: `Endpoint '${proxyPath}' not found`,
    availablePaths: ["test", "membership"]
  }, { status: 404, headers });
}

// Handle OPTIONS requests for CORS
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  
  return json({ error: "Method not allowed" }, { status: 405 });
}