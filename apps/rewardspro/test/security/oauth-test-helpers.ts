import crypto from 'crypto';
import { vi } from 'vitest';

/**
 * OAuth Test Helper Utilities
 * Based on Shopify OAuth requirements and RFC 6749
 */

// Shopify shop domain validation regex per official docs
export const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;

/**
 * Generate a cryptographically secure state nonce
 * RFC 6749 Section 10.12 - CSRF Protection
 */
export function generateSecureState(): string {
  // Use 32 bytes (256 bits) for high entropy
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate OAuth HMAC for callback validation
 * OAuth uses hex digest (not base64 like webhooks)
 */
export function generateOAuthHMAC(
  params: URLSearchParams,
  secret: string
): string {
  // Remove hmac from params and sort lexicographically
  const sortedParams = Array.from(params.entries())
    .filter(([key]) => key !== 'hmac')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&');

  return crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');
}

/**
 * Validate OAuth callback parameters with timing-safe comparison
 * Prevents timing attacks per Node.js security best practices
 */
export function validateOAuthCallback(
  params: URLSearchParams,
  secret: string
): boolean {
  const hmac = params.get('hmac');
  if (!hmac) return false;

  const computed = generateOAuthHMAC(params, secret);

  try {
    // Critical: Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmac)
    );
  } catch (e) {
    // Buffer lengths don't match
    return false;
  }
}

/**
 * Validate shop domain format
 * Prevents XSS (CVE-2020-8176) and injection attacks
 */
export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_REGEX.test(shop);
}

/**
 * Check if OAuth timestamp is within acceptable range
 * Prevents replay attacks
 */
export function isTimestampValid(
  timestamp: string | number,
  maxAgeSeconds: number = 300 // 5 minutes default
): boolean {
  const requestTime = typeof timestamp === 'string'
    ? parseInt(timestamp, 10)
    : timestamp;

  if (isNaN(requestTime)) return false;

  const now = Math.floor(Date.now() / 1000);
  return now - requestTime <= maxAgeSeconds;
}

/**
 * Verify granted scopes include all required scopes
 * Prevents scope downgrade attacks
 */
export function validateScopes(
  grantedScopes: string,
  requiredScopes: string[]
): { valid: boolean; missing: string[] } {
  const granted = grantedScopes.split(',').map(s => s.trim());
  const missing = requiredScopes.filter(req => !granted.includes(req));

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Create a mock OAuth callback request for testing
 */
export function createMockOAuthCallback(
  overrides: Partial<{
    shop: string;
    code: string;
    state: string;
    timestamp: string;
    hmac: string;
    secret: string;
  }> = {}
): { request: Request; params: URLSearchParams } {
  const defaults = {
    shop: 'test-shop.myshopify.com',
    code: 'mock-auth-code-123',
    state: generateSecureState(),
    timestamp: Math.floor(Date.now() / 1000).toString(),
    secret: 'test_secret'
  };

  const config = { ...defaults, ...overrides };

  const params = new URLSearchParams({
    shop: config.shop,
    code: config.code,
    state: config.state,
    timestamp: config.timestamp
  });

  // Generate valid HMAC unless explicitly provided
  if (config.hmac !== undefined) {
    params.set('hmac', config.hmac);
  } else {
    const hmac = generateOAuthHMAC(params, config.secret);
    params.set('hmac', hmac);
  }

  const request = new Request(
    `https://app.example.com/auth/callback?${params}`
  );

  return { request, params };
}

/**
 * Mock session storage for testing state validation
 */
export class MockSessionStorage {
  private storage = new Map<string, string>();

  async store(shop: string, state: string): Promise<void> {
    this.storage.set(shop, state);
  }

  async retrieve(shop: string): Promise<string | null> {
    return this.storage.get(shop) || null;
  }

  async clear(shop: string): Promise<void> {
    this.storage.delete(shop);
  }

  reset(): void {
    this.storage.clear();
  }
}

/**
 * Mock token exchange for testing
 */
export function mockTokenExchange(
  scopes: string = 'read_customers,write_customers,read_orders'
) {
  return vi.fn().mockResolvedValue({
    access_token: 'shpat_' + crypto.randomBytes(16).toString('hex'),
    scope: scopes,
    expires_in: null, // Offline token
    associated_user_scope: '',
    associated_user: null
  });
}

/**
 * Test data generators for various attack scenarios
 */
export const AttackVectors = {
  // XSS attempts in shop domain
  xssShopDomains: [
    '<script>alert(1)</script>.myshopify.com',
    'javascript:alert(1)',
    '"><script>alert(1)</script>',
    'shop.myshopify.com<script>alert(1)</script>'
  ],

  // SQL injection in shop parameter
  sqlInjectionShops: [
    "shop'; DROP TABLE customers; --.myshopify.com",
    "shop' OR '1'='1.myshopify.com",
    "shop/**/OR/**/1=1.myshopify.com"
  ],

  // Path traversal attempts
  pathTraversalShops: [
    '../../etc/passwd',
    '..\\..\\windows\\system32\\config\\sam',
    'file:///etc/passwd'
  ],

  // Domain spoofing
  spoofedDomains: [
    'shop.myshopify.com.evil.com',
    'evil.com#shop.myshopify.com',
    'shop.myshopify.com@evil.com',
    'shop.myshopify.com%0d%0aLocation:%20evil.com'
  ],

  // Invalid format
  invalidFormats: [
    '-shop.myshopify.com', // Can't start with hyphen
    'shop-.myshopify.com', // Can't end with hyphen
    'shop..myshopify.com', // Double dots
    'shop@myshopify.com',  // Special chars
    'shop myshopify.com',  // Spaces
    'myshopify.com'       // Missing shop name
  ]
};

/**
 * Performance testing utility for timing attacks
 */
export async function measureTimingConsistency(
  validationFn: (input: string) => boolean | Promise<boolean>,
  correctInput: string,
  wrongInputs: string[],
  iterations: number = 1000
): Promise<{ isConstantTime: boolean; variance: number }> {
  const timings: { input: string; avgTime: number }[] = [];

  // Test correct input
  const correctTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await validationFn(correctInput);
    correctTimes.push(performance.now() - start);
  }

  timings.push({
    input: 'correct',
    avgTime: correctTimes.reduce((a, b) => a + b) / correctTimes.length
  });

  // Test wrong inputs
  for (const wrongInput of wrongInputs) {
    const wrongTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await validationFn(wrongInput);
      wrongTimes.push(performance.now() - start);
    }

    timings.push({
      input: wrongInput.substring(0, 10),
      avgTime: wrongTimes.reduce((a, b) => a + b) / wrongTimes.length
    });
  }

  // Calculate variance
  const times = timings.map(t => t.avgTime);
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  const variance = maxTime - minTime;

  // Constant time if variance is less than 0.1ms
  return {
    isConstantTime: variance < 0.1,
    variance
  };
}

/**
 * Helper to test error message sanitization
 * Ensures no sensitive information leaks
 */
export function assertNoSensitiveDataInError(errorMessage: string): void {
  const sensitivePatterns = [
    /hmac/i,
    /state/i,
    /nonce/i,
    /token/i,
    /secret/i,
    /api[_-]?key/i,
    /password/i,
    /SQL/i,
    /database/i,
    /table/i,
    /column/i
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(errorMessage)) {
      throw new Error(
        `Error message contains sensitive information matching: ${pattern}`
      );
    }
  }
}

/**
 * Generate various OAuth callback scenarios for testing
 */
export function generateOAuthTestScenarios() {
  const validState = generateSecureState();
  const validShop = 'test-shop.myshopify.com';
  const validCode = 'valid-auth-code';
  const validTimestamp = Math.floor(Date.now() / 1000).toString();

  return {
    // Valid scenario
    valid: {
      shop: validShop,
      code: validCode,
      state: validState,
      timestamp: validTimestamp
    },

    // Attack scenarios
    csrfAttack: {
      shop: validShop,
      code: validCode,
      state: 'attacker-state', // Wrong state
      timestamp: validTimestamp
    },

    replayAttack: {
      shop: validShop,
      code: validCode,
      state: validState,
      timestamp: (parseInt(validTimestamp) - 400).toString() // 6+ minutes old
    },

    hmacTampering: {
      shop: validShop,
      code: 'tampered-code', // Changed after HMAC generation
      state: validState,
      timestamp: validTimestamp
    },

    shopSpoofing: {
      shop: 'evil.com',
      code: validCode,
      state: validState,
      timestamp: validTimestamp
    },

    missingParams: {
      shop: validShop,
      // Missing code
      state: validState,
      timestamp: validTimestamp
    }
  };
}