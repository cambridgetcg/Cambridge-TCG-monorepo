/**
 * Centralized Test Mode Detection for Billing
 *
 * This utility provides a single source of truth for determining whether
 * Shopify billing should run in test mode or production mode.
 *
 * Detection Strategy (in order of priority):
 * 1. Environment Variable Override (FORCE_TEST_MODE)
 * 2. Development Environment (NODE_ENV === 'development')
 * 3. Shopify GraphQL API (shop.plan.partnerDevelopment)
 * 4. Domain Pattern Matching (fallback)
 *
 * @module billing-test-mode
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// ============================================
// TYPES
// ============================================

export interface TestModeResult {
  isTest: boolean;
  source: 'env_override' | 'node_env' | 'graphql_api' | 'domain_pattern' | 'cache';
  shop: string;
}

interface CacheEntry {
  isTest: boolean;
  timestamp: number;
}

// ============================================
// CACHE CONFIGURATION
// ============================================

// In-memory cache to avoid repeated GraphQL queries
const testModeCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Determine if billing should run in test mode
 *
 * This is the primary function for test mode detection. It checks multiple sources
 * in priority order and returns detailed information about why test mode was chosen.
 *
 * @param shop - Shop domain (e.g., "example.myshopify.com")
 * @param admin - Optional Admin API context for GraphQL query
 * @returns Test mode result with detection source
 *
 * @example
 * ```typescript
 * // With admin context (recommended)
 * const result = await getTestMode("dev-store.myshopify.com", admin);
 * console.log(result.isTest); // true
 * console.log(result.source); // 'graphql_api'
 *
 * // Without admin context (uses fallback)
 * const result = await getTestMode("dev-store.myshopify.com");
 * console.log(result.isTest); // true
 * console.log(result.source); // 'domain_pattern'
 * ```
 */
export async function getTestMode(
  shop: string,
  admin?: AdminApiContext
): Promise<TestModeResult> {
  // Priority 1: Check for manual override via environment variable
  if (process.env.FORCE_TEST_MODE === 'true') {
    console.log(`[TestMode] 🔧 Using test mode (env override) for ${shop}`);
    return { isTest: true, source: 'env_override', shop };
  }

  if (process.env.FORCE_TEST_MODE === 'false') {
    console.log(`[TestMode] 🔧 Using production mode (env override) for ${shop}`);
    return { isTest: false, source: 'env_override', shop };
  }

  // Priority 2: Check NODE_ENV
  if (process.env.NODE_ENV === 'development') {
    console.log(`[TestMode] 💻 Using test mode (NODE_ENV=development) for ${shop}`);
    return { isTest: true, source: 'node_env', shop };
  }

  // Priority 3: Check cache
  const cached = testModeCache.get(shop);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[TestMode] 📦 Using cached test mode for ${shop}: ${cached.isTest}`);
    return { isTest: cached.isTest, source: 'cache', shop };
  }

  // Priority 4: Try GraphQL API (if admin context provided)
  if (admin) {
    try {
      const isDevStore = await checkDevStoreViaGraphQL(shop, admin);

      // Cache the result
      testModeCache.set(shop, { isTest: isDevStore, timestamp: Date.now() });

      console.log(`[TestMode] 🔍 Using test mode (GraphQL API) for ${shop}: ${isDevStore}`);
      return { isTest: isDevStore, source: 'graphql_api', shop };
    } catch (error) {
      console.warn(`[TestMode] ⚠️ GraphQL check failed for ${shop}, falling back to domain patterns:`, error);
    }
  }

  // Priority 5: Fallback to domain pattern matching
  const isDevStore = checkDevStoreByDomain(shop);

  // Cache the result
  testModeCache.set(shop, { isTest: isDevStore, timestamp: Date.now() });

  console.log(`[TestMode] 🌐 Using test mode (domain pattern) for ${shop}: ${isDevStore}`);
  return { isTest: isDevStore, source: 'domain_pattern', shop };
}

/**
 * Simplified version that returns just boolean
 *
 * Use this when you only need to know if test mode should be enabled,
 * without caring about the detection source.
 *
 * @param shop - Shop domain
 * @param admin - Optional Admin API context
 * @returns True if test mode should be enabled
 *
 * @example
 * ```typescript
 * const testMode = await isTestMode("dev-store.myshopify.com", admin);
 * if (testMode) {
 *   console.log("Using test billing");
 * }
 * ```
 */
export async function isTestMode(shop: string, admin?: AdminApiContext): Promise<boolean> {
  const result = await getTestMode(shop, admin);
  return result.isTest;
}

// ============================================
// DETECTION METHODS
// ============================================

/**
 * Check if shop is a development store via Shopify GraphQL API
 *
 * This is the most accurate method as it queries Shopify directly.
 * Development stores have `shop.plan.partnerDevelopment = true`.
 *
 * @param shop - Shop domain
 * @param admin - Admin API context
 * @returns True if shop is a development store
 * @throws If GraphQL query fails
 *
 * @internal
 */
async function checkDevStoreViaGraphQL(
  shop: string,
  admin: AdminApiContext
): Promise<boolean> {
  const query = `#graphql
    query GetShopPlan {
      shop {
        plan {
          partnerDevelopment
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const result = await response.json();

  const isDevStore = result.data?.shop?.plan?.partnerDevelopment || false;

  if (isDevStore) {
    console.log(`[TestMode] ✅ GraphQL confirmed ${shop} is a development store`);
  } else {
    console.log(`[TestMode] ✅ GraphQL confirmed ${shop} is a production store`);
  }

  return isDevStore;
}

/**
 * Check if shop is a development store by domain patterns (fallback)
 *
 * This is used when GraphQL API is not available or fails.
 * It checks for common development store domain patterns.
 *
 * Patterns detected:
 * - .myshopify.io (development stores)
 * - -dev.myshopify.com
 * - -dev. (anywhere in domain)
 * - development-
 * - -staging.
 * - staging-
 *
 * @param shop - Shop domain
 * @returns True if domain matches development patterns
 *
 * @example
 * ```typescript
 * checkDevStoreByDomain("quick-start-123.myshopify.io"); // true
 * checkDevStoreByDomain("mystore.myshopify.com"); // false
 * checkDevStoreByDomain("staging-store.myshopify.com"); // true
 * ```
 */
export function checkDevStoreByDomain(shop: string): boolean {
  const devPatterns = [
    '.myshopify.io',        // Development stores use .myshopify.io
    '-dev.myshopify.com',   // Dev subdomain
    '-dev.',                // Dev in domain name
    'development-',         // Development prefix
    '-staging.',            // Staging subdomain
    'staging-'              // Staging prefix
  ];

  const matches = devPatterns.some(pattern => shop.includes(pattern));

  if (matches) {
    console.log(`[TestMode] 🔍 Domain pattern matched for ${shop} - treating as dev store`);
  }

  return matches;
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Clear test mode cache
 *
 * Use this to force re-detection of test mode, useful for:
 * - Testing
 * - After shop changes
 * - Manual cache invalidation
 *
 * @param shop - Optional specific shop to clear, or clear all if not provided
 *
 * @example
 * ```typescript
 * // Clear specific shop
 * clearTestModeCache("example.myshopify.com");
 *
 * // Clear all
 * clearTestModeCache();
 * ```
 */
export function clearTestModeCache(shop?: string): void {
  if (shop) {
    const hadCache = testModeCache.has(shop);
    testModeCache.delete(shop);
    if (hadCache) {
      console.log(`[TestMode] 🗑️ Cleared cache for ${shop}`);
    }
  } else {
    const size = testModeCache.size;
    testModeCache.clear();
    console.log(`[TestMode] 🗑️ Cleared entire cache (${size} entries)`);
  }
}

/**
 * Get cache statistics (for debugging)
 *
 * Returns information about the current cache state, useful for:
 * - Monitoring cache effectiveness
 * - Debugging cache issues
 * - Performance analysis
 *
 * @returns Cache statistics object
 *
 * @example
 * ```typescript
 * const stats = getTestModeCacheStats();
 * console.log(`Cache has ${stats.size} entries`);
 * console.log(`Oldest entry: ${stats.entries[0].age}ms old`);
 * ```
 */
export function getTestModeCacheStats() {
  return {
    size: testModeCache.size,
    ttl: CACHE_TTL,
    entries: Array.from(testModeCache.entries()).map(([shop, data]) => ({
      shop,
      isTest: data.isTest,
      age: Date.now() - data.timestamp,
      expired: Date.now() - data.timestamp > CACHE_TTL
    }))
  };
}
