/**
 * Rate-Limited Shopify GraphQL Wrapper
 *
 * Provides rate-limited access to Shopify's Admin GraphQL API.
 * Features:
 * - Leaky bucket rate limiting with Redis coordination
 * - Automatic header monitoring (X-Shopify-Shop-Api-Call-Limit)
 * - Query cost estimation for complex queries
 * - Automatic retry on throttle (429)
 * - Graceful degradation
 *
 * @see https://shopify.dev/docs/api/usage/rate-limits
 */

import {
  createShopifyRateLimiter,
} from "./api-rate-limiter.server";
import type { APIRateLimiter } from "./api-rate-limiter.server";

// =============================================================================
// Types
// =============================================================================

export interface ShopifyAdminAPI {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface RateLimitedGraphQLResult<T = unknown> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export interface RateLimitedQueryOptions {
  /** Estimated cost of this query (default: 1) */
  cost?: number;
  /** Maximum retries on throttle (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for retry backoff (default: 1000) */
  baseRetryDelay?: number;
  /** Skip rate limiting (for emergencies only) */
  bypassRateLimit?: boolean;
  /** Custom variables for the GraphQL query */
  variables?: Record<string, unknown>;
}

// =============================================================================
// Rate Limiter Cache
// =============================================================================

const rateLimiterCache = new Map<string, APIRateLimiter>();

function getShopifyRateLimiter(shop: string): APIRateLimiter {
  let limiter = rateLimiterCache.get(shop);
  if (!limiter) {
    limiter = createShopifyRateLimiter(shop);
    rateLimiterCache.set(shop, limiter);
  }
  return limiter;
}

// =============================================================================
// Query Cost Estimation
// =============================================================================

/**
 * Estimate the cost of a Shopify GraphQL query
 *
 * Shopify uses a cost-based rate limiting system:
 * - Simple queries: 1 point
 * - Queries with connections: varies by first/last argument
 * - Mutations: typically 10 points
 *
 * @see https://shopify.dev/docs/api/usage/rate-limits#calculating-query-cost
 */
export function estimateQueryCost(query: string): number {
  // Mutations are more expensive
  if (query.includes("mutation")) {
    return 10;
  }

  // Count connection fields (first/last arguments indicate pagination)
  const connectionMatches = query.match(/\(first:\s*(\d+)|last:\s*(\d+)/gi) || [];
  if (connectionMatches.length === 0) {
    return 1; // Simple query
  }

  // Calculate cost based on connection sizes
  let cost = 1;
  for (const match of connectionMatches) {
    const sizeMatch = match.match(/(\d+)/);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1], 10);
      // Shopify charges roughly 1 point per 100 items
      cost += Math.ceil(size / 100);
    }
  }

  return Math.min(cost, 40); // Cap at bucket max
}

// =============================================================================
// Main Rate-Limited GraphQL Function
// =============================================================================

/**
 * Execute a rate-limited Shopify GraphQL query
 *
 * @param admin - Shopify Admin API object
 * @param shop - Shop domain for rate limiting
 * @param query - GraphQL query string
 * @param options - Rate limiting and query options
 */
export async function rateLimitedGraphQL<T = unknown>(
  admin: ShopifyAdminAPI,
  shop: string,
  query: string,
  options: RateLimitedQueryOptions = {}
): Promise<RateLimitedGraphQLResult<T>> {
  const {
    cost = estimateQueryCost(query),
    maxRetries = 3,
    baseRetryDelay = 1000,
    bypassRateLimit = false,
    variables,
  } = options;

  const rateLimiter = getShopifyRateLimiter(shop);

  // Acquire rate limit token (unless bypassed)
  if (!bypassRateLimit) {
    const acquired = await rateLimiter.waitAndAcquire(cost, 30000);
    if (!acquired) {
      console.error(`[ShopifyRateLimited] Rate limit timeout for ${shop}`);
      throw new Error("Shopify API rate limit exceeded - please try again later");
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await admin.graphql(query, variables ? { variables } : undefined);

      // Parse rate limit header and sync our bucket
      const rateLimitHeader = response.headers.get("X-Shopify-Shop-Api-Call-Limit");
      if (rateLimitHeader) {
        await rateLimiter.updateFromShopifyHeader(rateLimitHeader);
      }

      // Check for throttle response
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseRetryDelay * Math.pow(2, attempt);

        console.warn(
          `[ShopifyRateLimited] Throttled for ${shop}, attempt ${attempt + 1}/${maxRetries + 1}, waiting ${waitTime}ms`
        );

        if (attempt < maxRetries) {
          await sleep(waitTime);
          continue;
        }

        throw new Error(`Shopify API throttled after ${maxRetries + 1} attempts`);
      }

      const result = (await response.json()) as RateLimitedGraphQLResult<T>;

      // Check for THROTTLED error in response body
      if (result.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
        console.warn(`[ShopifyRateLimited] THROTTLED error in response for ${shop}`);

        if (attempt < maxRetries) {
          const waitTime = baseRetryDelay * Math.pow(2, attempt);
          await sleep(waitTime);
          continue;
        }

        throw new Error("Shopify API throttled - query cost too high");
      }

      // Update bucket based on actual cost from response
      if (result.extensions?.cost) {
        const actualCost = result.extensions.cost.actualQueryCost;
        const costDiff = cost - actualCost;
        if (costDiff > 0) {
          // We overestimated, release the difference
          await rateLimiter.release(costDiff);
        }

        // Log cost info for monitoring
        const { throttleStatus } = result.extensions.cost;
        if (throttleStatus.currentlyAvailable < 10) {
          console.warn(
            `[ShopifyRateLimited] Low bucket for ${shop}: ${throttleStatus.currentlyAvailable}/${throttleStatus.maximumAvailable}`
          );
        }
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // Network errors - release token and retry
      if (lastError.message.includes("network") || lastError.message.includes("ECONNRESET")) {
        await rateLimiter.release(cost);

        if (attempt < maxRetries) {
          const waitTime = baseRetryDelay * Math.pow(2, attempt);
          console.warn(`[ShopifyRateLimited] Network error for ${shop}, retrying in ${waitTime}ms`);
          await sleep(waitTime);
          continue;
        }
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Shopify GraphQL request failed");
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Execute a simple query (cost: 1)
 */
export async function simpleQuery<T>(
  admin: ShopifyAdminAPI,
  shop: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<RateLimitedGraphQLResult<T>> {
  return rateLimitedGraphQL<T>(admin, shop, query, { cost: 1, variables });
}

/**
 * Execute a mutation (cost: 10)
 */
export async function mutation<T>(
  admin: ShopifyAdminAPI,
  shop: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<RateLimitedGraphQLResult<T>> {
  return rateLimitedGraphQL<T>(admin, shop, query, { cost: 10, variables });
}

/**
 * Execute a bulk query with pagination (auto-estimated cost)
 */
export async function paginatedQuery<T>(
  admin: ShopifyAdminAPI,
  shop: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<RateLimitedGraphQLResult<T>> {
  const cost = estimateQueryCost(query);
  return rateLimitedGraphQL<T>(admin, shop, query, { cost, variables });
}

// =============================================================================
// Batch Processing with Rate Limiting
// =============================================================================

/**
 * Process multiple GraphQL queries with rate limiting
 *
 * @param admin - Shopify Admin API
 * @param shop - Shop domain
 * @param queries - Array of queries with their options
 * @returns Array of results in the same order
 */
export async function batchQueries<T = unknown>(
  admin: ShopifyAdminAPI,
  shop: string,
  queries: Array<{
    query: string;
    variables?: Record<string, unknown>;
    cost?: number;
  }>
): Promise<Array<RateLimitedGraphQLResult<T> | { error: Error }>> {
  const results: Array<RateLimitedGraphQLResult<T> | { error: Error }> = [];

  for (const { query, variables, cost } of queries) {
    try {
      const result = await rateLimitedGraphQL<T>(admin, shop, query, {
        cost: cost ?? estimateQueryCost(query),
        variables,
      });
      results.push(result);
    } catch (error) {
      results.push({ error: error as Error });
    }
  }

  return results;
}

// =============================================================================
// Monitoring & Debugging
// =============================================================================

/**
 * Get current rate limit status for a shop
 */
export async function getShopifyRateLimitStatus(shop: string): Promise<{
  shop: string;
  currentTokens: number;
  maxTokens: number;
  utilizationPercent: number;
}> {
  const rateLimiter = getShopifyRateLimiter(shop);
  const state = await rateLimiter.getState();

  return {
    shop,
    currentTokens: Math.round(state.tokens * 100) / 100,
    maxTokens: 40,
    utilizationPercent: Math.round(((40 - state.tokens) / 40) * 100),
  };
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
