import { json, type LoaderFunctionArgs } from "@remix-run/node";
// NOTE: db and fetchAndSyncCustomerFromShopify are no longer used since endpoint is deprecated
// Kept imports commented for reference when removing this file entirely
// import db from "../db.server";
// import { fetchAndSyncCustomerFromShopify } from "../services/on-demand-customer-sync.server";

/**
 * DEPRECATED: Storefront API endpoint for loyalty widget
 *
 * ⚠️ This endpoint is deprecated and will be removed in a future version.
 * New implementations should use the app proxy route: /apps/proxy/loyalty
 *
 * Kept for backward compatibility with existing installations that haven't
 * updated to the app proxy version yet. Will be removed after all merchants
 * have migrated to the new version.
 *
 * Migration Date: 2025-10-14
 * Planned Removal: 2-4 weeks after app proxy deployment
 *
 * Authentication: Customer metafield ID + shop domain verification
 * No session tokens (not available on storefront)
 *
 * Security: Shop-scoped queries prevent cross-shop access
 *
 * On-Demand Customer Sync:
 * If a customer isn't found in the database but shopifyCustomerId is provided,
 * this endpoint will automatically fetch the customer from Shopify Admin API
 * and create them in the database. This handles cases where:
 * - The customers/create webhook hasn't arrived yet (race condition)
 * - The webhook was missed or failed
 * - The customer existed before the app was installed
 *
 * Parameters:
 * - customerId: Internal RewardsPro customer UUID (from metafield)
 * - shopifyCustomerId: Shopify customer ID for on-demand sync fallback
 * - shop: Shop domain (required)
 */

interface LoyaltyData {
  balance: number;
  tier: {
    id: string;
    name: string;
    icon: string;
    color: string;
  } | null;
  progress: {
    current: number;
    next: number;
    percentage: number;
  } | null;
  expiringPoints: {
    amount: number;
    date: string;
  } | null;
}

// Handle CORS preflight requests
export async function options({ request }: LoaderFunctionArgs) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  /**
   * SECURITY: This endpoint is DEPRECATED and DISABLED due to critical security vulnerability.
   *
   * This endpoint had NO authentication, allowing anyone to enumerate customer data
   * by guessing customer IDs or Shopify customer IDs.
   *
   * All integrations MUST migrate to the authenticated app proxy route:
   * - App Proxy: /apps/proxy/loyalty (HMAC-authenticated by Shopify)
   * - Customer Account: /api/customer-account/loyalty (JWT-authenticated)
   *
   * See: CUSTOMER_SECURITY_AUDIT.md for full vulnerability details.
   */

  // Log the deprecated access attempt for monitoring
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  console.warn('[SECURITY:DEPRECATED] Blocked access to deprecated storefront loyalty endpoint', {
    shop: shopDomain,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent'),
    origin: request.headers.get('origin'),
  });

  return json(
    {
      error: "This endpoint is deprecated and disabled for security reasons.",
      code: "ENDPOINT_DEPRECATED",
      message: "Please migrate to the authenticated app proxy endpoint: /apps/proxy/loyalty",
      migration: {
        appProxy: "/apps/proxy/loyalty",
        customerAccount: "/api/customer-account/loyalty",
        documentation: "https://help.shopify.com/en/manual/apps/app-types/public-app/app-proxy"
      }
    },
    {
      status: 410, // HTTP 410 Gone - resource is permanently unavailable
      headers: getCorsHeaders(request)
    }
  );
}

// SECURITY: Restricted CORS headers for deprecated endpoint
// Only allows Shopify domains to receive the deprecation notice
function getCorsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin");
  let allowOrigin = "null"; // Deny by default

  if (requestOrigin) {
    try {
      const originUrl = new URL(requestOrigin);
      const originHost = originUrl.hostname;

      // SECURITY: Only allow *.myshopify.com domains
      // This ensures only legitimate Shopify stores receive the response
      if (originHost.endsWith(".myshopify.com")) {
        allowOrigin = requestOrigin;
      }
      // Reject all other origins
      else {
        console.warn('[SECURITY:CORS] Rejected non-Shopify origin:', originHost);
        allowOrigin = "null";
      }
    } catch (error) {
      // Invalid origin URL, deny access
      allowOrigin = "null";
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "3600" // 1 hour (reduced from 24 hours for deprecated endpoint)
  };
}
