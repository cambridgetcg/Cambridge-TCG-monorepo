/**
 * Rate Limiting Utility for API Endpoints
 *
 * Implements token bucket algorithm with memory storage
 *
 * ⚠️ SECURITY WARNING: In-Memory Rate Limiting Limitation
 * ────────────────────────────────────────────────────────
 * This implementation uses in-memory storage which does NOT work correctly
 * in distributed/serverless environments (Vercel, AWS Lambda, etc.).
 *
 * Each serverless function instance has its own memory, so:
 * - An attacker can make N requests per instance, not N total
 * - With 10 instances, rate limits are effectively 10x higher
 * - Rate limits reset when new instances are spawned
 *
 * TODO: Migrate to Redis/Upstash for production rate limiting
 * See: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
 *
 * Example migration:
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *
 *   const ratelimit = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(10, "10 s"),
 *   });
 */

import { json } from "@remix-run/node";

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyGenerator?: (request: Request) => string;  // Custom key generation
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;  // Don't count failed requests
  message?: string;  // Custom error message
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// In-memory storage (consider Redis for production)
const buckets = new Map<string, TokenBucket>();

// Cleanup old buckets periodically
setInterval(() => {
  const now = Date.now();
  const staleTime = 60 * 60 * 1000; // 1 hour
  
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > staleTime) {
      buckets.delete(key);
    }
  }
}, 60 * 1000); // Run every minute

/**
 * Default key generator using IP + shop
 */
function defaultKeyGenerator(request: Request): string {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop') || 'unknown';
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  return `${shop}:${ip}`;
}

/**
 * Rate limiter middleware
 */
export async function rateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<Response | null> {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests, please try again later'
  } = config;
  
  const key = keyGenerator(request);
  const now = Date.now();
  
  // Get or create bucket
  let bucket = buckets.get(key);
  
  if (!bucket) {
    bucket = {
      tokens: maxRequests,
      lastRefill: now
    };
    buckets.set(key, bucket);
  }
  
  // Refill tokens based on time passed
  const timePassed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(timePassed / windowMs * maxRequests);
  
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
  
  // Check if request can proceed
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return null; // Allow request
  }
  
  // Rate limit exceeded
  const retryAfter = Math.ceil(windowMs / 1000); // Convert to seconds
  
  return json(
    {
      error: message,
      retryAfter
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(new Date(now + windowMs).toISOString())
      }
    }
  );
}

/**
 * Rate limiter for app proxy endpoints
 * More restrictive for security
 */
export async function appProxyRateLimit(request: Request): Promise<Response | null> {
  return rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute per IP/shop
    message: 'Rate limit exceeded. Please wait before making more requests.'
  });
}

/**
 * Rate limiter for webhook endpoints
 * More lenient as these come from Shopify
 */
export async function webhookRateLimit(request: Request): Promise<Response | null> {
  return rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute per shop
    keyGenerator: (req) => {
      const shop = req.headers.get('x-shopify-shop-domain') || 'unknown';
      return `webhook:${shop}`;
    }
  });
}

/**
 * Rate limiter for authentication endpoints
 * Very restrictive to prevent brute force
 */
export async function authRateLimit(request: Request): Promise<Response | null> {
  return rateLimit(request, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts. Please wait 15 minutes.'
  });
}

/**
 * Custom rate limiter for specific customer actions
 */
export async function customerActionRateLimit(
  request: Request,
  customerId: string
): Promise<Response | null> {
  return rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 actions per minute per customer
    keyGenerator: () => `customer:${customerId}`
  });
}

/**
 * IP-based rate limiter for public endpoints
 */
export async function publicRateLimit(request: Request): Promise<Response | null> {
  return rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute per IP
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for') || 
                 req.headers.get('x-real-ip') || 
                 'unknown';
      return `public:${ip}`;
    }
  });
}

/**
 * Helper to extract rate limit info for response headers
 */
export function getRateLimitHeaders(key: string, config: RateLimitConfig): Record<string, string> {
  const bucket = buckets.get(key);
  
  if (!bucket) {
    return {
      'X-RateLimit-Limit': String(config.maxRequests),
      'X-RateLimit-Remaining': String(config.maxRequests)
    };
  }
  
  return {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(Math.max(0, bucket.tokens)),
    'X-RateLimit-Reset': new Date(bucket.lastRefill + config.windowMs).toISOString()
  };
}

/**
 * Reset rate limit for a specific key (useful for testing)
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Get current rate limit status for monitoring
 */
export function getRateLimitStatus(): {
  totalBuckets: number;
  buckets: Array<{ key: string; tokens: number; lastRefill: Date }>;
} {
  const status = {
    totalBuckets: buckets.size,
    buckets: Array.from(buckets.entries()).map(([key, bucket]) => ({
      key,
      tokens: bucket.tokens,
      lastRefill: new Date(bucket.lastRefill)
    }))
  };
  
  return status;
}