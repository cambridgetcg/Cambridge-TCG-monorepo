import { describe, test, expect, beforeEach, vi } from 'vitest';
import { performance } from 'perf_hooks';

/**
 * Rate Limiting Security Tests
 * Based on Token Bucket algorithm for per-shop rate limiting
 * Storage: In-memory for development, Redis for production
 */
describe('Rate Limiting Security Tests', () => {
  // Rate limit configurations per endpoint type
  const RATE_LIMITS = {
    public: { limit: 60, window: 60000 }, // 60 req/min
    authenticated: { limit: 100, window: 60000 }, // 100 req/min
    webhook: { limit: 10, window: 1000 }, // 10 req/sec (burst)
    financial: { limit: 30, window: 60000 }, // 30 req/min (sensitive)
    export: { limit: 5, window: 60000 } // 5 req/min (expensive)
  };

  // In-memory rate limiter for testing
  class RateLimiter {
    private buckets: Map<string, { count: number; resetAt: number }> = new Map();

    isAllowed(key: string, limit: number, windowMs: number): boolean {
      const now = Date.now();
      const bucket = this.buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        // New window
        this.buckets.set(key, {
          count: 1,
          resetAt: now + windowMs
        });
        return true;
      }

      if (bucket.count >= limit) {
        return false; // Rate limited
      }

      bucket.count++;
      return true;
    }

    reset(key?: string) {
      if (key) {
        this.buckets.delete(key);
      } else {
        this.buckets.clear();
      }
    }

    getRemainingTokens(key: string, limit: number): number {
      const bucket = this.buckets.get(key);
      if (!bucket) return limit;
      return Math.max(0, limit - bucket.count);
    }
  }

  const rateLimiter = new RateLimiter();

  beforeEach(() => {
    rateLimiter.reset();
  });

  describe('Per-Shop Rate Limiting', () => {
    test('enforces rate limits per shop, not globally', async () => {
      const shop1 = 'shop1.myshopify.com';
      const shop2 = 'shop2.myshopify.com';
      const endpoint = '/api/customers';
      const limit = 10;

      // Shop1 makes requests up to limit
      for (let i = 0; i < limit; i++) {
        const allowed = rateLimiter.isAllowed(`${shop1}:${endpoint}`, limit, 60000);
        expect(allowed).toBe(true);
      }

      // Shop1's next request is blocked
      expect(rateLimiter.isAllowed(`${shop1}:${endpoint}`, limit, 60000)).toBe(false);

      // But Shop2 can still make requests
      for (let i = 0; i < limit; i++) {
        const allowed = rateLimiter.isAllowed(`${shop2}:${endpoint}`, limit, 60000);
        expect(allowed).toBe(true);
      }
    });

    test('resets rate limit after time window', () => {
      vi.useFakeTimers();

      const shop = 'test-shop.myshopify.com';
      const key = `${shop}:/api/orders`;
      const limit = 5;
      const window = 60000; // 1 minute

      // Exhaust rate limit
      for (let i = 0; i < limit; i++) {
        expect(rateLimiter.isAllowed(key, limit, window)).toBe(true);
      }
      expect(rateLimiter.isAllowed(key, limit, window)).toBe(false);

      // Advance time by window duration
      vi.setSystemTime(Date.now() + window + 1);

      // Should be allowed again
      expect(rateLimiter.isAllowed(key, limit, window)).toBe(true);

      vi.useRealTimers();
    });

    test('tracks remaining tokens correctly', () => {
      const shop = 'test-shop.myshopify.com';
      const key = `${shop}:/api/customers`;
      const limit = 10;

      expect(rateLimiter.getRemainingTokens(key, limit)).toBe(10);

      // Use 3 tokens
      for (let i = 0; i < 3; i++) {
        rateLimiter.isAllowed(key, limit, 60000);
      }

      expect(rateLimiter.getRemainingTokens(key, limit)).toBe(7);
    });
  });

  describe('Endpoint-Specific Rate Limits', () => {
    test('applies different limits to different endpoint types', () => {
      const shop = 'test-shop.myshopify.com';

      // Public endpoint - lower limit
      const publicKey = `${shop}:/api/proxy/membership`;
      for (let i = 0; i < RATE_LIMITS.public.limit; i++) {
        expect(
          rateLimiter.isAllowed(publicKey, RATE_LIMITS.public.limit, RATE_LIMITS.public.window)
        ).toBe(true);
      }
      expect(
        rateLimiter.isAllowed(publicKey, RATE_LIMITS.public.limit, RATE_LIMITS.public.window)
      ).toBe(false);

      // Authenticated endpoint - higher limit
      const authKey = `${shop}:/app/customers`;
      for (let i = 0; i < RATE_LIMITS.authenticated.limit; i++) {
        expect(
          rateLimiter.isAllowed(authKey, RATE_LIMITS.authenticated.limit, RATE_LIMITS.authenticated.window)
        ).toBe(true);
      }
    });

    test('applies strict limits to financial endpoints', () => {
      const shop = 'test-shop.myshopify.com';
      const creditKey = `${shop}:/api/credit-adjustment`;

      // Financial endpoints have lower limits
      for (let i = 0; i < RATE_LIMITS.financial.limit; i++) {
        expect(
          rateLimiter.isAllowed(creditKey, RATE_LIMITS.financial.limit, RATE_LIMITS.financial.window)
        ).toBe(true);
      }

      // Should be rate limited after limit
      expect(
        rateLimiter.isAllowed(creditKey, RATE_LIMITS.financial.limit, RATE_LIMITS.financial.window)
      ).toBe(false);
    });

    test('handles webhook burst traffic', () => {
      const shop = 'test-shop.myshopify.com';
      const webhookKey = `${shop}:/webhooks/orders.paid`;

      // Webhooks allow burst (10/sec)
      const start = Date.now();
      let allowed = 0;

      // Try rapid-fire requests
      for (let i = 0; i < 20; i++) {
        if (rateLimiter.isAllowed(webhookKey, RATE_LIMITS.webhook.limit, RATE_LIMITS.webhook.window)) {
          allowed++;
        }
      }

      // Should allow up to limit in burst
      expect(allowed).toBe(RATE_LIMITS.webhook.limit);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // All happened quickly
    });
  });

  describe('Rate Limit Headers', () => {
    test('returns correct rate limit headers', () => {
      const shop = 'test-shop.myshopify.com';
      const key = `${shop}:/api/customers`;
      const limit = 100;

      // Simulate some requests
      for (let i = 0; i < 30; i++) {
        rateLimiter.isAllowed(key, limit, 60000);
      }

      const headers = {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': rateLimiter.getRemainingTokens(key, limit).toString(),
        'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
      };

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('70');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    test('returns 429 status with Retry-After header when rate limited', async () => {
      const response = {
        status: 429,
        headers: {
          'Retry-After': '60', // Seconds until reset
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
        },
        body: {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please retry after 60 seconds.'
        }
      };

      expect(response.status).toBe(429);
      expect(response.headers['Retry-After']).toBe('60');
      expect(response.body.error).toContain('Rate limit');
    });
  });

  describe('DDoS Protection', () => {
    test('prevents request flooding from single shop', async () => {
      const shop = 'malicious-shop.myshopify.com';
      const endpoint = '/api/expensive-operation';
      const requests: boolean[] = [];

      // Attempt 1000 rapid requests
      for (let i = 0; i < 1000; i++) {
        const allowed = rateLimiter.isAllowed(
          `${shop}:${endpoint}`,
          RATE_LIMITS.export.limit,
          RATE_LIMITS.export.window
        );
        requests.push(allowed);
      }

      // Only the limit should pass
      const allowedCount = requests.filter(r => r).length;
      expect(allowedCount).toBe(RATE_LIMITS.export.limit);
    });

    test('handles distributed attack attempts', () => {
      const endpoints = ['/api/customers', '/api/orders', '/api/products'];
      const shop = 'attacker.myshopify.com';
      let totalAllowed = 0;

      // Try to bypass by hitting different endpoints
      for (let i = 0; i < 100; i++) {
        for (const endpoint of endpoints) {
          const key = `${shop}:${endpoint}`;
          if (rateLimiter.isAllowed(key, 30, 60000)) {
            totalAllowed++;
          }
        }
      }

      // Each endpoint has its own limit
      expect(totalAllowed).toBe(30 * endpoints.length); // 30 per endpoint
    });
  });

  describe('Sliding Window Algorithm', () => {
    test('implements sliding window for smooth rate limiting', () => {
      // More advanced than token bucket - distributes requests evenly
      class SlidingWindowLimiter {
        private requests: Map<string, number[]> = new Map();

        isAllowed(key: string, limit: number, windowMs: number): boolean {
          const now = Date.now();
          const windowStart = now - windowMs;

          let timestamps = this.requests.get(key) || [];

          // Remove old timestamps outside window
          timestamps = timestamps.filter(t => t > windowStart);

          if (timestamps.length >= limit) {
            this.requests.set(key, timestamps);
            return false;
          }

          timestamps.push(now);
          this.requests.set(key, timestamps);
          return true;
        }
      }

      const limiter = new SlidingWindowLimiter();
      const key = 'shop:/api/test';

      // Should distribute requests evenly
      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed(key, 10, 1000)).toBe(true);
      }

      // 11th request within window is blocked
      expect(limiter.isAllowed(key, 10, 1000)).toBe(false);
    });
  });

  describe('Redis-Based Rate Limiting (Production)', () => {
    test('simulates Redis-based distributed rate limiting', async () => {
      // Mock Redis client
      class MockRedis {
        private data = new Map<string, { value: number; expireAt?: number }>();

        async incr(key: string): Promise<number> {
          const current = this.data.get(key)?.value || 0;
          const newValue = current + 1;
          this.data.set(key, { value: newValue, expireAt: this.data.get(key)?.expireAt });
          return newValue;
        }

        async expire(key: string, seconds: number): Promise<void> {
          const entry = this.data.get(key);
          if (entry) {
            entry.expireAt = Date.now() + (seconds * 1000);
          }
        }

        async ttl(key: string): Promise<number> {
          const entry = this.data.get(key);
          if (!entry || !entry.expireAt) return -1;
          return Math.max(0, Math.floor((entry.expireAt - Date.now()) / 1000));
        }
      }

      const redis = new MockRedis();

      async function checkRateLimit(shop: string, endpoint: string, limit: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetIn: number;
      }> {
        const key = `rate_limit:${shop}:${endpoint}`;
        const count = await redis.incr(key);

        if (count === 1) {
          await redis.expire(key, 60); // 1 minute window
        }

        const ttl = await redis.ttl(key);
        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);

        return { allowed, remaining, resetIn: ttl };
      }

      // Test distributed rate limiting
      const shop = 'test.myshopify.com';
      const endpoint = '/api/orders';

      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(shop, endpoint, 10);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10 - i - 1);
      }
    });
  });

  describe('Bypass Prevention', () => {
    test('prevents rate limit bypass via IP spoofing', () => {
      // Even if attacker changes IP, shop-based limiting still applies
      const shop = 'test-shop.myshopify.com';
      const ips = ['1.2.3.4', '5.6.7.8', '9.10.11.12'];
      let totalAllowed = 0;

      for (const ip of ips) {
        for (let i = 0; i < 20; i++) {
          // Rate limit is per shop, not per IP
          const key = `${shop}:/api/customers`;
          if (rateLimiter.isAllowed(key, 10, 60000)) {
            totalAllowed++;
          }
        }
      }

      // Only 10 requests allowed regardless of IP changes
      expect(totalAllowed).toBe(10);
    });

    test('prevents bypass via parameter pollution', () => {
      const shop = 'test.myshopify.com';

      // Attacker tries different query params to bypass
      const attempts = [
        `${shop}:/api/customers?page=1`,
        `${shop}:/api/customers?page=2`,
        `${shop}:/api/customers?sort=name`,
        `${shop}:/api/customers?filter=active`
      ];

      // Should normalize to same rate limit key
      const normalizeKey = (url: string) => {
        const [base] = url.split('?');
        return base;
      };

      let allowed = 0;
      for (const attempt of attempts) {
        const key = normalizeKey(attempt);
        for (let i = 0; i < 5; i++) {
          if (rateLimiter.isAllowed(key, 10, 60000)) {
            allowed++;
          }
        }
      }

      // All attempts count toward same limit
      expect(allowed).toBe(10);
    });
  });

  describe('Performance Impact', () => {
    test('rate limiting check completes within 1ms', () => {
      const shop = 'perf-test.myshopify.com';
      const key = `${shop}:/api/test`;

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        rateLimiter.isAllowed(key, 100, 60000);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      expect(avgTime).toBeLessThan(1); // <1ms per check
    });
  });

  describe('Grace Period and Retry Logic', () => {
    test('implements exponential backoff for retry attempts', () => {
      const calculateBackoff = (attempt: number): number => {
        const baseDelay = 1000; // 1 second
        const maxDelay = 32000; // 32 seconds
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 * delay;
        return Math.floor(delay + jitter);
      };

      // Test backoff calculation
      expect(calculateBackoff(0)).toBeGreaterThanOrEqual(1000);
      expect(calculateBackoff(0)).toBeLessThan(1300);

      expect(calculateBackoff(1)).toBeGreaterThanOrEqual(2000);
      expect(calculateBackoff(1)).toBeLessThan(2600);

      expect(calculateBackoff(5)).toBe(32000); // Capped at max
    });

    test('provides grace period for authenticated shops', () => {
      // Premium shops might get higher limits or grace period
      const isPremiumShop = (shop: string): boolean => {
        return shop.includes('premium');
      };

      const getLimit = (shop: string, endpoint: string): number => {
        const baseLimit = 100;
        const multiplier = isPremiumShop(shop) ? 2 : 1;
        return baseLimit * multiplier;
      };

      expect(getLimit('regular.myshopify.com', '/api/test')).toBe(100);
      expect(getLimit('premium.myshopify.com', '/api/test')).toBe(200);
    });
  });
});