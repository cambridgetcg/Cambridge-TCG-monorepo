/**
 * Test Billing Mode Detection
 *
 * Test endpoint to verify billing test mode configuration
 *
 * Usage:
 *   GET /api/test-billing-mode
 *
 * Returns:
 *   - Current test mode status
 *   - Detection source
 *   - Environment info
 *   - Cache stats
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import {
  getTestMode,
  getTestModeCacheStats,
  isTestMode
} from "~/utils/billing-test-mode.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Authenticate and get shop context
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    console.log(`[TestBillingMode] Testing billing mode for shop: ${shop}`);

    // Get detailed test mode result
    const testModeResult = await getTestMode(shop, admin);

    // Get simple boolean result
    const isTest = await isTestMode(shop, admin);

    // Get cache statistics
    const cacheStats = getTestModeCacheStats();

    // Gather environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      FORCE_TEST_MODE: process.env.FORCE_TEST_MODE,
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
    };

    // Determine if this is likely a dev store based on domain
    const isDevelopmentStoreDomain = shop.includes('.myshopify.io') ||
                                     shop.includes('-dev.myshopify.com') ||
                                     shop.includes('quick-start-');

    const response = {
      success: true,
      shop,
      testMode: {
        isTest,
        source: testModeResult.source,
        details: testModeResult,
      },
      environment: envInfo,
      cache: cacheStats,
      shopAnalysis: {
        domain: shop,
        likelyDevelopmentStore: isDevelopmentStoreDomain,
      },
      timestamp: new Date().toISOString(),
      summary: {
        status: isTest ? "✅ TEST MODE ACTIVE" : "⚠️ PRODUCTION MODE ACTIVE",
        meaning: isTest
          ? "No real charges will occur. Safe for testing."
          : "Real charges will occur. Use carefully!",
        recommendation: isTest
          ? "Ready for testing billing flows safely."
          : isDevelopmentStoreDomain
            ? "⚠️ WARNING: This looks like a dev store but production mode is active! Check your configuration."
            : "This is a production store. Test mode is disabled as expected.",
      }
    };

    console.log(`[TestBillingMode] Result:`, JSON.stringify(response, null, 2));

    return json(response, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error("[TestBillingMode] Error:", error);

    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}
