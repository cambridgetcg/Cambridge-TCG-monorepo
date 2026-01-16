/**
 * Redis-Backed Rate Limiter for Serverless Environments
 *
 * This rate limiter uses Vercel KV (Redis) for distributed rate limiting,
 * ensuring rate limits are enforced across all serverless instances.
 *
 * SECURITY: This replaces the in-memory rate limiter which is ineffective
 * in serverless environments where each instance has its own memory.
 *
 * Algorithm: Sliding Window Log
 * - Stores timestamps of recent requests in a sorted set
 * - More accurate than fixed windows
 * - Prevents burst attacks at window boundaries
 */

import { kv } from '@vercel/kv';
import { json } from "@remix-run/node";

// Check if Vercel KV is configured
const isKVConfigured = !!(
  process.env.KV_REST_API_URL &&
  process.env.KV_REST_API_TOKEN
);

// In-memory fallback for local development
const memoryBuckets = new Map<string, number[]>();

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  maxRequests: number;
  /** Prefix for cache keys (e.g., 'api', 'auth', 'proxy') */
  keyPrefix: string;
  /** Custom key generator function */
  keyGenerator?: (request: Request) => string;
  /** Custom error message */
  message?: string;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  current: number;
  /** Maximum allowed requests */
  limit: number;
  /** Seconds until the rate limit resets */
  resetInSeconds: number;
  /** Response to return if rate limited (null if allowed) */
  response: Response | null;
}

/**
 * Default key generator using IP + shop
 */
function defaultKeyGenerator(request: Request): string {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop') || 'unknown';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';

  return `${shop}:${ip}`;
}

/**
 * Rate limit a request using sliding window algorithm
 *
 * @returns RateLimitResult with allowed status and optional response
 */
export async function rateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const {
    windowMs,
    maxRequests,
    keyPrefix,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests, please try again later'
  } = config;

  const identifier = keyGenerator(request);
  const key = `ratelimit:${keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    let currentCount: number;
    let oldestTimestamp: number | undefined;

    if (isKVConfigured) {
      // Use Redis sorted set for distributed rate limiting
      // This is atomic and works across all serverless instances

      // Remove expired entries and count current entries in one pipeline
      const pipeline = kv.pipeline();

      // Remove entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count entries in the current window
      pipeline.zcard(key);

      // Get the oldest entry to calculate reset time
      pipeline.zrange(key, 0, 0, { withScores: true });

      // Add current request timestamp
      pipeline.zadd(key, { score: now, member: `${now}:${Math.random().toString(36).slice(2)}` });

      // Set expiry on the key (window + buffer)
      pipeline.expire(key, Math.ceil(windowMs / 1000) + 60);

      const results = await pipeline.exec();

      // Results: [removed count, current count, oldest entries, add result, expire result]
      currentCount = (results[1] as number) + 1; // +1 for the request we just added
      const oldestEntries = results[2] as Array<{ score: number; member: string }>;
      oldestTimestamp = oldestEntries?.[0]?.score;

    } else {
      // In-memory fallback for local development
      let timestamps = memoryBuckets.get(key) || [];

      // Remove expired entries
      timestamps = timestamps.filter(t => t > windowStart);

      // Add current timestamp
      timestamps.push(now);
      memoryBuckets.set(key, timestamps);

      currentCount = timestamps.length;
      oldestTimestamp = timestamps[0];
    }

    // Calculate reset time
    const resetTime = oldestTimestamp
      ? Math.ceil((oldestTimestamp + windowMs - now) / 1000)
      : Math.ceil(windowMs / 1000);

    // Check if rate limit exceeded
    if (currentCount > maxRequests) {
      console.warn(`[RateLimit] Exceeded for ${key}: ${currentCount}/${maxRequests}`);

      return {
        allowed: false,
        current: currentCount,
        limit: maxRequests,
        resetInSeconds: Math.max(1, resetTime),
        response: json(
          {
            error: message,
            retryAfter: Math.max(1, resetTime),
            code: 'RATE_LIMIT_EXCEEDED'
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.max(1, resetTime)),
              'X-RateLimit-Limit': String(maxRequests),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(now + resetTime * 1000).toISOString()
            }
          }
        )
      };
    }

    // Request allowed
    return {
      allowed: true,
      current: currentCount,
      limit: maxRequests,
      resetInSeconds: Math.max(1, resetTime),
      response: null
    };

  } catch (error) {
    // On error, allow the request but log the issue
    console.error(`[RateLimit] Error checking rate limit for ${key}:`, error);
    return {
      allowed: true,
      current: 0,
      limit: maxRequests,
      resetInSeconds: Math.ceil(windowMs / 1000),
      response: null
    };
  }
}

/**
 * Simple rate limit check that returns Response | null
 * For backwards compatibility with existing code
 */
export async function rateLimitCheck(
  request: Request,
  config: RateLimitConfig
): Promise<Response | null> {
  const result = await rateLimit(request, config);
  return result.response;
}

// ============================================
// PRE-CONFIGURED RATE LIMITERS
// ============================================

/**
 * Rate limiter for app proxy endpoints
 * 30 requests per minute per IP/shop
 */
export async function appProxyRateLimit(request: Request): Promise<Response | null> {
  return rateLimitCheck(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'proxy',
    message: 'Rate limit exceeded. Please wait before making more requests.'
  });
}

/**
 * Rate limiter for webhook endpoints
 * 100 requests per minute per shop (more lenient as these come from Shopify)
 */
export async function webhookRateLimit(request: Request): Promise<Response | null> {
  return rateLimitCheck(request, {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'webhook',
    keyGenerator: (req) => {
      const shop = req.headers.get('x-shopify-shop-domain') || 'unknown';
      return shop;
    }
  });
}

/**
 * Rate limiter for authentication endpoints
 * 5 attempts per 15 minutes (very restrictive to prevent brute force)
 */
export async function authRateLimit(request: Request): Promise<Response | null> {
  return rateLimitCheck(request, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'auth',
    message: 'Too many authentication attempts. Please wait 15 minutes.'
  });
}

/**
 * Rate limiter for customer actions
 * 10 actions per minute per customer
 */
export async function customerActionRateLimit(
  request: Request,
  customerId: string
): Promise<Response | null> {
  return rateLimitCheck(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'customer',
    keyGenerator: () => customerId
  });
}

/**
 * Rate limiter for public endpoints
 * 60 requests per minute per IP
 */
export async function publicRateLimit(request: Request): Promise<Response | null> {
  return rateLimitCheck(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'public',
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                 req.headers.get('x-real-ip') ||
                 'unknown';
      return ip;
    }
  });
}

/**
 * Rate limiter for admin API endpoints
 * 100 requests per minute per shop (for legitimate admin operations)
 */
export async function adminApiRateLimit(request: Request): Promise<Response | null> {
  return rateLimitCheck(request, {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'admin',
    keyGenerator: (req) => {
      const url = new URL(req.url);
      const shop = url.searchParams.get('shop') ||
                   req.headers.get('x-shopify-shop-domain') ||
                   'unknown';
      return shop;
    }
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get rate limit headers for a response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.limit - result.current)),
    'X-RateLimit-Reset': new Date(Date.now() + result.resetInSeconds * 1000).toISOString()
  };
}

/**
 * Check which backend is being used
 */
export function getRateLimitBackend(): 'redis' | 'memory' {
  return isKVConfigured ? 'redis' : 'memory';
}

/**
 * Reset rate limit for a specific key (useful for testing)
 */
export async function resetRateLimit(keyPrefix: string, identifier: string): Promise<void> {
  const key = `ratelimit:${keyPrefix}:${identifier}`;

  if (isKVConfigured) {
    await kv.del(key);
  } else {
    memoryBuckets.delete(key);
  }

  console.log(`[RateLimit] Reset: ${key}`);
}

/**
 * Clean up old memory entries (for local dev)
 */
function cleanupMemoryBuckets() {
  if (isKVConfigured) return; // Only needed for memory fallback

  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [key, timestamps] of memoryBuckets.entries()) {
    const validTimestamps = timestamps.filter(t => t > now - maxAge);
    if (validTimestamps.length === 0) {
      memoryBuckets.delete(key);
    } else if (validTimestamps.length !== timestamps.length) {
      memoryBuckets.set(key, validTimestamps);
    }
  }
}

// Run cleanup every minute for memory fallback
if (!isKVConfigured) {
  setInterval(cleanupMemoryBuckets, 60 * 1000);
}
