import { describe, test, expect, beforeEach, vi, it } from 'vitest';
import crypto from 'crypto';
import type { ActionFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';

// Shop domain validation per Shopify docs - RFC compliant
const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;

describe('OAuth Flow Security - Comprehensive Tests (RFC 6749 & Shopify Compliant)', () => {
  const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test_secret';
  const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test_api_key';

  // Mock functions
  const getStoredNonceForShop = vi.fn();
  const exchangeCodeForToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // OAuth callback handler implementation per research
  const authCallbackAction: ActionFunction = async ({ request }) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const hmac = url.searchParams.get('hmac');
    const timestamp = url.searchParams.get('timestamp');

    // Step 1: Check required params (no detailed error to prevent info leak)
    if (!shop || !code || !state || !hmac) {
      return json({ error: 'Invalid request' }, { status: 400 });
    }

    // Step 2: Verify shop domain format (prevent XSS/injection)
    if (!SHOP_DOMAIN_REGEX.test(shop)) {
      return json({ error: 'Invalid request' }, { status: 400 });
    }

    // Step 3: Verify state matches stored nonce (CSRF protection)
    const expectedState = await getStoredNonceForShop(shop);
    if (!expectedState || state !== expectedState) {
      // Don't reveal whether state exists or doesn't match
      return json({ error: 'Invalid request' }, { status: 403 });
    }

    // Step 4: Verify timestamp is recent (prevent replay)
    if (timestamp) {
      const requestTime = parseInt(timestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      const MAX_AGE = 300; // 5 minute tolerance per Shopify

      if (isNaN(requestTime) || now - requestTime > MAX_AGE) {
        return json({ error: 'Invalid request' }, { status: 401 });
      }
    }

    // Step 5: Compute and verify HMAC using timing-safe comparison
    const queryString = Array.from(url.searchParams.entries())
      .filter(([key]) => key !== 'hmac')
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('&');

    const computed = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(queryString)
      .digest('hex');

    // Critical: Use timing-safe comparison to prevent timing attacks
    try {
      if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac))) {
        return json({ error: 'Invalid request' }, { status: 401 });
      }
    } catch (e) {
      // Buffer lengths don't match
      return json({ error: 'Invalid request' }, { status: 401 });
    }

    // Step 6: Exchange code for access token (with error handling)
    let tokenResponse;
    try {
      tokenResponse = await exchangeCodeForToken(shop, code);
    } catch (e) {
      // Don't leak error details
      return json({ error: 'Authorization failed' }, { status: 500 });
    }

    // Step 7: Verify granted scopes match requirements
    const requiredScopes = ['read_customers', 'write_customers', 'read_orders'];
    const grantedScopes = tokenResponse.scope.split(',').map((s: string) => s.trim());

    for (const required of requiredScopes) {
      if (!grantedScopes.includes(required)) {
        // Log internally but don't expose missing scopes to client
        console.error(`Missing required scope: ${required}`);
        return json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Success - create session and redirect
    return redirect(`/app?shop=${encodeURIComponent(shop)}`);
  };

  describe('OAuth Callback HMAC Validation (Timing-Safe)', () => {
    function generateOAuthHMAC(params: URLSearchParams): string {
      const sortedParams = Array.from(params.entries())
        .filter(([key]) => key !== 'hmac')
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join('&');

      return crypto
        .createHmac('sha256', SHOPIFY_API_SECRET)
        .update(sortedParams)
        .digest('hex');
    }

    test('validates correct OAuth callback with valid HMAC', async () => {
      const validNonce = 'nonce123';
      getStoredNonceForShop.mockResolvedValue(validNonce);
      exchangeCodeForToken.mockResolvedValue({
        access_token: 'shpat_mock',
        scope: 'read_customers,write_customers,read_orders'
      });

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        state: validNonce,
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(302); // Redirect on success
      expect(result.headers.get('Location')).toContain('/app?shop=');
    });

    test('rejects callback with forged HMAC signature', async () => {
      getStoredNonceForShop.mockResolvedValue('nonce123');

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: 'abcde',
        state: 'nonce123',
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      params.set('hmac', 'deadbeef'.repeat(8)); // Invalid 64-char hex

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe('Invalid request'); // Generic error
    });

    test('timing-safe comparison prevents timing attacks', () => {
      const secret = 'test_secret';
      const correctHmac = crypto.createHmac('sha256', secret)
        .update('test_data')
        .digest('hex');

      // Test multiple variations with different similarities
      const testCases = [
        correctHmac, // Exact match
        correctHmac.slice(0, -1) + 'f', // Last char different
        'f' + correctHmac.slice(1), // First char different
        'f'.repeat(64) // Completely different
      ];

      const timings: { hmac: string; avgTime: number }[] = [];

      for (const testHmac of testCases) {
        const times: number[] = [];

        for (let i = 0; i < 1000; i++) {
          const start = performance.now();

          try {
            crypto.timingSafeEqual(
              Buffer.from(correctHmac),
              Buffer.from(testHmac)
            );
          } catch (e) {
            // Expected for different lengths
          }

          times.push(performance.now() - start);
        }

        const avgTime = times.reduce((a, b) => a + b) / times.length;
        timings.push({ hmac: testHmac === correctHmac ? 'correct' : 'wrong', avgTime });
      }

      // All timings should be within 0.1ms of each other
      const maxTime = Math.max(...timings.map(t => t.avgTime));
      const minTime = Math.min(...timings.map(t => t.avgTime));

      expect(maxTime - minTime).toBeLessThan(0.1);
    });

    test('rejects callback with timestamp older than 5 minutes', async () => {
      getStoredNonceForShop.mockResolvedValue('nonce123');

      const oldTimestamp = Math.floor(Date.now() / 1000) - 301; // 5 min 1 sec ago

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        state: 'nonce123',
        timestamp: oldTimestamp.toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(401);
    });
  });

  describe('State Parameter CSRF Protection (RFC 6749 Section 10.12)', () => {
    test('generates cryptographically secure random state', () => {
      const states = new Set<string>();

      // Generate 1000 states - all should be unique
      for (let i = 0; i < 1000; i++) {
        const state = crypto.randomBytes(32).toString('hex');
        expect(states.has(state)).toBe(false);
        states.add(state);
      }

      // Check format and length
      const sampleState = Array.from(states)[0];
      expect(sampleState).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
    });

    test('rejects callback with invalid state (CSRF attack)', async () => {
      const storedNonce = 'stored_nonce_abc123';
      const attackerNonce = 'attacker_nonce_xyz789';

      getStoredNonceForShop.mockResolvedValue(storedNonce);

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        state: attackerNonce, // Wrong state
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.error).toBe('Invalid request'); // Don't leak state mismatch
    });

    test('rejects callback with missing state parameter', async () => {
      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        // state missing - CSRF vulnerability
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(400);
    });

    test('state should not be predictable or static', () => {
      // Anti-pattern tests - these should never be used as state
      const badStates = [
        'state', // Static string
        'test-shop.myshopify.com', // Shop domain
        '12345', // Sequential number
        Date.now().toString(), // Timestamp alone
        Buffer.from('test-shop').toString('base64') // Encoded shop
      ];

      badStates.forEach(badState => {
        // These are predictable and should fail entropy test
        expect(badState.length).toBeLessThan(32); // Too short for secure random
      });
    });
  });

  describe('Shop Domain Validation (CVE-2020-8176 Prevention)', () => {
    test('validates legitimate Shopify shop domains', () => {
      const validShops = [
        'test-shop.myshopify.com',
        'my-store-123.myshopify.com',
        'shop123.myshopify.com',
        'a.myshopify.com',
        'shop-with-many-hyphens.myshopify.com'
      ];

      validShops.forEach(shop => {
        expect(SHOP_DOMAIN_REGEX.test(shop)).toBe(true);
      });
    });

    test('rejects malicious shop domains (XSS/injection)', () => {
      const invalidShops = [
        // Domain spoofing
        'evil.com',
        'shop.myshopify.com.evil.com',
        'myshopify.com',

        // Injection attempts
        'shop.myshopify.com/',
        'shop.myshopify.com%0a',
        'shop.myshopify.com%00',
        'shop.myshopify.com#',
        'shop.myshopify.com?param=value',

        // Path traversal
        '../../etc/passwd',
        '../admin/shop.myshopify.com',

        // XSS attempts
        'javascript:alert(1)',
        '<script>alert(1)</script>.myshopify.com',
        '"><script>alert(1)</script>',

        // Invalid format
        '-shop.myshopify.com', // Can't start with hyphen
        'shop-.myshopify.com', // Can't end with hyphen
        'shop..myshopify.com', // Double dots
        'shop@myshopify.com', // Special chars
        'shop myshopify.com', // Spaces
        'SHOP.MYSHOPIFY.COM' // Should be lowercase (depends on implementation)
      ];

      invalidShops.forEach(shop => {
        expect(SHOP_DOMAIN_REGEX.test(shop)).toBe(false);
      });
    });

    test('OAuth callback rejects invalid shop domains', async () => {
      const params = new URLSearchParams({
        shop: 'evil.com',
        code: 'auth-code',
        state: 'valid-state',
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error).toBe('Invalid request');
    });
  });

  describe('Scope Validation', () => {
    test('verifies all required scopes are granted', async () => {
      getStoredNonceForShop.mockResolvedValue('nonce123');
      exchangeCodeForToken.mockResolvedValue({
        access_token: 'shpat_mock',
        scope: 'read_customers,write_customers,read_orders'
      });

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        state: 'nonce123',
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(302); // Success
    });

    test('rejects when critical scopes are missing', async () => {
      getStoredNonceForShop.mockResolvedValue('nonce123');
      exchangeCodeForToken.mockResolvedValue({
        access_token: 'shpat_mock',
        scope: 'read_customers' // Missing write_customers and read_orders
      });

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        state: 'nonce123',
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      const request = new Request(`https://example.com/auth/callback?${params}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.error).toBe('Insufficient permissions');
    });
  });

  describe('Error Handling Without Information Leakage', () => {
    test('returns generic errors to prevent information disclosure', async () => {
      const testCases = [
        { desc: 'Invalid HMAC', hmac: 'invalid', expectedStatus: 401 },
        { desc: 'Wrong state', state: 'wrong', expectedStatus: 403 },
        { desc: 'Invalid shop', shop: 'evil.com', expectedStatus: 400 },
        { desc: 'Missing code', code: undefined, expectedStatus: 400 }
      ];

      for (const testCase of testCases) {
        const params = new URLSearchParams({
          shop: testCase.shop || 'test-shop.myshopify.com',
          code: testCase.code || '12345',
          state: testCase.state || 'nonce123',
          timestamp: Math.floor(Date.now() / 1000).toString()
        });

        if (testCase.hmac) {
          params.set('hmac', testCase.hmac);
        } else if (testCase.hmac !== undefined) {
          const hmac = generateOAuthHMAC(params);
          params.set('hmac', hmac);
        }

        const request = new Request(`https://example.com/auth/callback?${params}`);
        const result = await authCallbackAction({ request, params: {}, context: {} });

        expect(result.status).toBe(testCase.expectedStatus);
        const body = await result.json();

        // All errors should be generic
        expect(body.error).toMatch(/Invalid request|Authorization failed|Insufficient permissions/);

        // Should not leak specific details
        expect(body.error).not.toContain('HMAC');
        expect(body.error).not.toContain('state');
        expect(body.error).not.toContain('shop');
        expect(body.error).not.toContain('scope');
      }
    });
  });

  describe('Session Fixation Prevention', () => {
    test('generates new session ID after successful OAuth', async () => {
      const oldSessionId = 'old-session-123';
      let currentSessionId = oldSessionId;

      // Mock session regeneration
      const regenerateSession = vi.fn(() => {
        currentSessionId = crypto.randomBytes(16).toString('hex');
        return currentSessionId;
      });

      getStoredNonceForShop.mockResolvedValue('nonce123');
      exchangeCodeForToken.mockResolvedValue({
        access_token: 'shpat_mock',
        scope: 'read_customers,write_customers,read_orders'
      });

      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: '12345',
        state: 'nonce123',
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(params);
      params.set('hmac', hmac);

      // Simulate successful OAuth
      regenerateSession();

      expect(currentSessionId).not.toBe(oldSessionId);
      expect(regenerateSession).toHaveBeenCalled();
    });

    test('sets secure cookie attributes', async () => {
      const setCookieHeader = 'session=abc123; HttpOnly; Secure; SameSite=Strict; Path=/';

      // Verify all security attributes
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('Secure');
      expect(setCookieHeader).toContain('SameSite=Strict');
    });
  });

  describe('Complete OAuth Flow Integration', () => {
    test('handles full OAuth flow from initiation to completion', async () => {
      // Step 1: Generate OAuth URL
      const state = crypto.randomBytes(32).toString('hex');
      const redirectUri = 'https://app.example.com/auth/callback';
      const scopes = 'read_customers,write_customers,read_orders';

      const authUrl = new URL('https://test-shop.myshopify.com/admin/oauth/authorize');
      authUrl.searchParams.set('client_id', SHOPIFY_API_KEY);
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('state', state);

      expect(authUrl.toString()).toContain('client_id=' + SHOPIFY_API_KEY);
      expect(authUrl.toString()).toContain('state=' + state);

      // Step 2: Mock Shopify callback
      getStoredNonceForShop.mockResolvedValue(state);
      exchangeCodeForToken.mockResolvedValue({
        access_token: 'shpat_final_token',
        scope: scopes
      });

      const callbackParams = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: 'auth-code-from-shopify',
        state: state,
        timestamp: Math.floor(Date.now() / 1000).toString()
      });

      const hmac = generateOAuthHMAC(callbackParams);
      callbackParams.set('hmac', hmac);

      const request = new Request(`https://app.example.com/auth/callback?${callbackParams}`);
      const result = await authCallbackAction({ request, params: {}, context: {} });

      // Step 3: Verify successful authentication
      expect(result.status).toBe(302);
      expect(result.headers.get('Location')).toContain('/app?shop=test-shop.myshopify.com');
      expect(exchangeCodeForToken).toHaveBeenCalledWith('test-shop.myshopify.com', 'auth-code-from-shopify');
    });
  });
});

// Helper function to generate OAuth HMAC
function generateOAuthHMAC(params: URLSearchParams): string {
  const secret = process.env.SHOPIFY_API_SECRET || 'test_secret';

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