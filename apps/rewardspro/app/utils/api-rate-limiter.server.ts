/**
 * API Rate Limiter - Leaky Bucket Implementation
 *
 * Provides distributed rate limiting for external API calls using Redis.
 * Implements token bucket algorithm (equivalent to leaky bucket) with:
 * - Per-API configurable limits
 * - Distributed coordination via Redis
 * - Shopify API header monitoring
 * - Graceful degradation with in-memory fallback
 *
 * @see https://en.wikipedia.org/wiki/Token_bucket
 */

import { kv } from "@vercel/kv";

// =============================================================================
// Types
// =============================================================================

export interface RateLimitConfig {
  /** Maximum tokens in bucket (burst capacity) */
  bucketSize: number;
  /** Tokens added per second (sustained rate) */
  refillRate: number;
  /** Minimum time between requests in ms (for smoothing) */
  minInterval?: number;
  /** Key prefix for Redis storage */
  keyPrefix: string;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  lastRequest: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfter?: number; // milliseconds until next available slot
  waitTime?: number; // ms to wait before making request (for queuing)
}

export interface ShopifyRateLimitInfo {
  used: number;
  available: number;
  maxAvailable: number;
  restoreRate: number; // points per second
}

// =============================================================================
// API Rate Limit Configurations
// =============================================================================

/**
 * Shopify Admin API uses a "leaky bucket" with:
 * - 40 points bucket size (Basic), 80 (Shopify Plus)
 * - 2 points restored per second
 * - Most queries cost 1 point, mutations cost more
 *
 * @see https://shopify.dev/docs/api/usage/rate-limits
 */
export const SHOPIFY_RATE_LIMIT: RateLimitConfig = {
  bucketSize: 40, // Conservative for Basic plan
  refillRate: 2, // 2 points per second
  minInterval: 100, // At least 100ms between requests
  keyPrefix: "ratelimit:shopify",
};

/**
 * SendGrid API rate limits:
 * - 600 requests per minute for most endpoints
 * - Mail send: 100 requests per second burst
 *
 * @see https://docs.sendgrid.com/api-reference/how-to-use-the-sendgrid-v3-api/rate-limits
 */
export const SENDGRID_RATE_LIMIT: RateLimitConfig = {
  bucketSize: 100, // Burst capacity
  refillRate: 10, // 600/minute = 10/second
  minInterval: 50, // 50ms between requests
  keyPrefix: "ratelimit:sendgrid",
};

/**
 * Klaviyo API rate limits:
 * - 75 requests per second (burst)
 * - 700 requests per minute (sustained)
 * - Specific endpoints have lower limits
 *
 * @see https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
 */
export const KLAVIYO_RATE_LIMIT: RateLimitConfig = {
  bucketSize: 75, // Burst capacity
  refillRate: 10, // ~600/minute sustained
  minInterval: 50, // 50ms between requests
  keyPrefix: "ratelimit:klaviyo",
};

// =============================================================================
// In-Memory Fallback Store
// =============================================================================

const inMemoryStore = new Map<string, RateLimitState>();
let useInMemoryFallback = false;

// =============================================================================
// Core Rate Limiter Class
// =============================================================================

export class APIRateLimiter {
  private config: RateLimitConfig;
  private shopKey: string;

  constructor(config: RateLimitConfig, shop: string) {
    this.config = config;
    this.shopKey = `${config.keyPrefix}:${shop}`;
  }

  /**
   * Attempt to acquire a token from the bucket
   * Returns whether the request is allowed and wait time if not
   */
  async acquire(cost: number = 1): Promise<RateLimitResult> {
    try {
      return await this.acquireFromRedis(cost);
    } catch (error) {
      console.warn(`[APIRateLimiter] Redis error, using in-memory fallback:`, error);
      useInMemoryFallback = true;
      return this.acquireFromMemory(cost);
    }
  }

  /**
   * Wait and acquire - blocks until token is available
   * Use this for queue-based processing
   */
  async waitAndAcquire(cost: number = 1, maxWait: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const result = await this.acquire(cost);

      if (result.allowed) {
        // If there's a minimum interval, wait for it
        if (result.waitTime && result.waitTime > 0) {
          await this.sleep(result.waitTime);
        }
        return true;
      }

      // Wait for retry time or a small backoff
      const waitTime = Math.min(result.retryAfter || 1000, maxWait - (Date.now() - startTime));
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    return false;
  }

  /**
   * Update rate limit state based on API response headers
   * Specifically for Shopify's X-Shopify-Shop-Api-Call-Limit header
   */
  async updateFromShopifyHeader(header: string | null): Promise<void> {
    if (!header) return;

    try {
      // Header format: "32/40" (used/available)
      const [used, max] = header.split("/").map(Number);
      if (isNaN(used) || isNaN(max)) return;

      const available = max - used;

      // Update our bucket to match Shopify's actual state
      await this.setBucketState({
        tokens: available,
        lastRefill: Date.now(),
        lastRequest: Date.now(),
      });

      console.log(`[APIRateLimiter] Shopify bucket synced: ${available}/${max} available`);
    } catch (error) {
      console.warn(`[APIRateLimiter] Failed to parse Shopify rate limit header:`, error);
    }
  }

  /**
   * Release tokens back to bucket (for failed requests that didn't consume API quota)
   */
  async release(cost: number = 1): Promise<void> {
    try {
      const state = await this.getBucketState();
      state.tokens = Math.min(state.tokens + cost, this.config.bucketSize);
      await this.setBucketState(state);
    } catch (error) {
      console.warn(`[APIRateLimiter] Failed to release tokens:`, error);
    }
  }

  /**
   * Get current bucket state (for monitoring/debugging)
   */
  async getState(): Promise<RateLimitState> {
    return this.getBucketState();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async acquireFromRedis(cost: number): Promise<RateLimitResult> {
    const now = Date.now();
    const state = await this.getBucketState();

    // Refill tokens based on time elapsed
    const elapsed = (now - state.lastRefill) / 1000; // seconds
    const refilled = elapsed * this.config.refillRate;
    state.tokens = Math.min(state.tokens + refilled, this.config.bucketSize);
    state.lastRefill = now;

    // Check minimum interval
    const timeSinceLastRequest = now - state.lastRequest;
    const minInterval = this.config.minInterval || 0;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      return {
        allowed: true,
        remainingTokens: state.tokens - cost,
        waitTime,
      };
    }

    // Check if enough tokens
    if (state.tokens >= cost) {
      state.tokens -= cost;
      state.lastRequest = now;
      await this.setBucketState(state);

      return {
        allowed: true,
        remainingTokens: state.tokens,
        waitTime: 0,
      };
    }

    // Not enough tokens - calculate when they'll be available
    const tokensNeeded = cost - state.tokens;
    const retryAfter = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);

    return {
      allowed: false,
      remainingTokens: state.tokens,
      retryAfter,
    };
  }

  private acquireFromMemory(cost: number): RateLimitResult {
    const now = Date.now();
    let state = inMemoryStore.get(this.shopKey);

    if (!state) {
      state = {
        tokens: this.config.bucketSize,
        lastRefill: now,
        lastRequest: 0,
      };
    }

    // Refill tokens
    const elapsed = (now - state.lastRefill) / 1000;
    const refilled = elapsed * this.config.refillRate;
    state.tokens = Math.min(state.tokens + refilled, this.config.bucketSize);
    state.lastRefill = now;

    // Check minimum interval
    const timeSinceLastRequest = now - state.lastRequest;
    const minInterval = this.config.minInterval || 0;

    if (timeSinceLastRequest < minInterval) {
      return {
        allowed: true,
        remainingTokens: state.tokens - cost,
        waitTime: minInterval - timeSinceLastRequest,
      };
    }

    if (state.tokens >= cost) {
      state.tokens -= cost;
      state.lastRequest = now;
      inMemoryStore.set(this.shopKey, state);

      return {
        allowed: true,
        remainingTokens: state.tokens,
        waitTime: 0,
      };
    }

    const tokensNeeded = cost - state.tokens;
    const retryAfter = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);

    return {
      allowed: false,
      remainingTokens: state.tokens,
      retryAfter,
    };
  }

  private async getBucketState(): Promise<RateLimitState> {
    if (useInMemoryFallback) {
      return (
        inMemoryStore.get(this.shopKey) || {
          tokens: this.config.bucketSize,
          lastRefill: Date.now(),
          lastRequest: 0,
        }
      );
    }

    try {
      const data = await kv.get<RateLimitState>(this.shopKey);
      return (
        data || {
          tokens: this.config.bucketSize,
          lastRefill: Date.now(),
          lastRequest: 0,
        }
      );
    } catch {
      return {
        tokens: this.config.bucketSize,
        lastRefill: Date.now(),
        lastRequest: 0,
      };
    }
  }

  private async setBucketState(state: RateLimitState): Promise<void> {
    if (useInMemoryFallback) {
      inMemoryStore.set(this.shopKey, state);
      return;
    }

    try {
      // TTL of 1 hour - bucket state expires if shop is inactive
      await kv.set(this.shopKey, state, { ex: 3600 });
    } catch {
      inMemoryStore.set(this.shopKey, state);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Shopify API rate limiter for a specific shop
 */
export function createShopifyRateLimiter(shop: string): APIRateLimiter {
  return new APIRateLimiter(SHOPIFY_RATE_LIMIT, shop);
}

/**
 * Create a SendGrid API rate limiter
 */
export function createSendGridRateLimiter(shop: string = "global"): APIRateLimiter {
  return new APIRateLimiter(SENDGRID_RATE_LIMIT, shop);
}

/**
 * Create a Klaviyo API rate limiter for a specific shop
 */
export function createKlaviyoRateLimiter(shop: string): APIRateLimiter {
  return new APIRateLimiter(KLAVIYO_RATE_LIMIT, shop);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse Shopify's rate limit header
 * Format: "32/40" (used/available)
 */
export function parseShopifyRateLimitHeader(header: string | null): ShopifyRateLimitInfo | null {
  if (!header) return null;

  try {
    const [used, maxAvailable] = header.split("/").map(Number);
    if (isNaN(used) || isNaN(maxAvailable)) return null;

    return {
      used,
      available: maxAvailable - used,
      maxAvailable,
      restoreRate: 2, // Shopify standard restore rate
    };
  } catch {
    return null;
  }
}

/**
 * Decorator function to wrap API calls with rate limiting
 */
export async function withRateLimit<T>(
  rateLimiter: APIRateLimiter,
  apiCall: () => Promise<T>,
  options: {
    cost?: number;
    maxWait?: number;
    onRateLimited?: () => void;
  } = {}
): Promise<T> {
  const { cost = 1, maxWait = 30000, onRateLimited } = options;

  const acquired = await rateLimiter.waitAndAcquire(cost, maxWait);

  if (!acquired) {
    onRateLimited?.();
    throw new Error("Rate limit exceeded - max wait time reached");
  }

  try {
    return await apiCall();
  } catch (error) {
    // If the request failed before reaching the API, release the token
    if (error instanceof Error && error.message.includes("network")) {
      await rateLimiter.release(cost);
    }
    throw error;
  }
}

/**
 * Batch processor with rate limiting
 * Processes items in batches respecting rate limits
 */
export async function processWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  rateLimiter: APIRateLimiter,
  options: {
    costPerItem?: number;
    maxConcurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<{ results: R[]; errors: Array<{ item: T; error: Error }> }> {
  const { costPerItem = 1, maxConcurrency = 1, onProgress } = options;

  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];

  // Process items with limited concurrency
  const queue = [...items];
  let completed = 0;
  const inFlight: Promise<void>[] = [];

  const processItem = async (item: T): Promise<void> => {
    try {
      const acquired = await rateLimiter.waitAndAcquire(costPerItem, 60000);
      if (!acquired) {
        errors.push({ item, error: new Error("Rate limit timeout") });
        return;
      }

      const result = await processor(item);
      results.push(result);
    } catch (error) {
      errors.push({ item, error: error as Error });
    } finally {
      completed++;
      onProgress?.(completed, items.length);
    }
  };

  while (queue.length > 0 || inFlight.length > 0) {
    // Fill up to max concurrency
    while (queue.length > 0 && inFlight.length < maxConcurrency) {
      const item = queue.shift()!;
      const promise = processItem(item).then(() => {
        const idx = inFlight.indexOf(promise);
        if (idx > -1) inFlight.splice(idx, 1);
      });
      inFlight.push(promise);
    }

    // Wait for at least one to complete
    if (inFlight.length > 0) {
      await Promise.race(inFlight);
    }
  }

  return { results, errors };
}

// =============================================================================
// Metrics & Monitoring
// =============================================================================

export interface RateLimitMetrics {
  shop: string;
  api: string;
  currentTokens: number;
  bucketSize: number;
  utilizationPercent: number;
  lastRequest: Date | null;
}

/**
 * Get metrics for a specific rate limiter
 */
export async function getRateLimitMetrics(
  rateLimiter: APIRateLimiter,
  api: string,
  shop: string
): Promise<RateLimitMetrics> {
  const state = await rateLimiter.getState();
  const config =
    api === "shopify"
      ? SHOPIFY_RATE_LIMIT
      : api === "sendgrid"
        ? SENDGRID_RATE_LIMIT
        : KLAVIYO_RATE_LIMIT;

  return {
    shop,
    api,
    currentTokens: Math.round(state.tokens * 100) / 100,
    bucketSize: config.bucketSize,
    utilizationPercent: Math.round(((config.bucketSize - state.tokens) / config.bucketSize) * 100),
    lastRequest: state.lastRequest ? new Date(state.lastRequest) : null,
  };
}
