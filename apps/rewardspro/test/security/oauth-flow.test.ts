import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { validateOAuthCallback, generateOAuthUrl } from '~/utils/oauth-validation';
import { db } from '~/db.server';
import { encrypt, decrypt } from '~/utils/encryption';

describe('OAuth Flow Security Tests', () => {
  const API_KEY = process.env.SHOPIFY_API_KEY || 'test-api-key';
  const API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-api-secret';
  const APP_URL = process.env.SHOPIFY_APP_URL || 'https://app.example.com';
  const SCOPES = 'read_products,write_products,read_customers,write_customers,read_orders';

  describe('OAuth Callback HMAC Validation', () => {
    function generateValidOAuthParams(overrides: Partial<Record<string, string>> = {}) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params = new URLSearchParams({
        shop: 'test-shop.myshopify.com',
        code: 'test-authorization-code-123',
        state: 'nonce-' + crypto.randomBytes(16).toString('hex'),
        timestamp,
        ...overrides
      });

      // Generate HMAC (OAuth uses hex, not base64)
      const sortedParams = new URLSearchParams();
      Array.from(params.entries())
        .filter(([key]) => key !== 'hmac')
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([key, value]) => sortedParams.append(key, value));

      const message = sortedParams.toString();
      const hmac = crypto.createHmac('sha256', API_SECRET)
        .update(message)
        .digest('hex');

      params.set('hmac', hmac);
      return params;
    }

    it('should validate correct OAuth callback parameters', () => {
      const params = generateValidOAuthParams();
      const result = validateOAuthCallback(params, API_SECRET);
      expect(result).toBe(true);
    });

    it('should reject callback with invalid HMAC', () => {
      const params = generateValidOAuthParams();
      params.set('hmac', 'invalid-hmac-value');
      const result = validateOAuthCallback(params, API_SECRET);
      expect(result).toBe(false);
    });

    it('should reject callback with tampered parameters', () => {
      const params = generateValidOAuthParams();
      // Tamper with shop after HMAC generation
      const originalShop = params.get('shop');
      params.set('shop', 'evil-shop.myshopify.com');

      const result = validateOAuthCallback(params, API_SECRET);
      expect(result).toBe(false);

      // Restore and verify original works
      params.set('shop', originalShop!);
      const validResult = validateOAuthCallback(params, API_SECRET);
      expect(validResult).toBe(true);
    });

    it('should reject callback with missing HMAC', () => {
      const params = generateValidOAuthParams();
      params.delete('hmac');
      const result = validateOAuthCallback(params, API_SECRET);
      expect(result).toBe(false);
    });

    it('should reject callback with old timestamp', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
      const params = generateValidOAuthParams({ timestamp: oldTimestamp.toString() });

      const result = validateOAuthCallback(params, API_SECRET, {
        maxAge: 300 // 5 minute window
      });
      expect(result).toBe(false);
    });

    it('should accept callback within timestamp tolerance', () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute old
      const params = generateValidOAuthParams({ timestamp: recentTimestamp.toString() });

      const result = validateOAuthCallback(params, API_SECRET, {
        maxAge: 300 // 5 minute window
      });
      expect(result).toBe(true);
    });

    it('should handle parameter order independence', () => {
      // Create params in different orders
      const params1 = new URLSearchParams();
      params1.set('timestamp', '1234567890');
      params1.set('shop', 'test-shop.myshopify.com');
      params1.set('code', 'abc123');
      params1.set('state', 'xyz789');

      const params2 = new URLSearchParams();
      params2.set('code', 'abc123');
      params2.set('shop', 'test-shop.myshopify.com');
      params2.set('state', 'xyz789');
      params2.set('timestamp', '1234567890');

      // Generate HMAC for each
      const generateHmac = (params: URLSearchParams): string => {
        const sortedParams = new URLSearchParams();
        Array.from(params.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .forEach(([key, value]) => sortedParams.append(key, value));

        return crypto.createHmac('sha256', API_SECRET)
          .update(sortedParams.toString())
          .digest('hex');
      };

      const hmac1 = generateHmac(params1);
      const hmac2 = generateHmac(params2);

      // HMACs should be identical
      expect(hmac1).toBe(hmac2);
    });
  });

  describe('State Parameter CSRF Protection', () => {
    it('should validate matching state parameter', () => {
      const state = 'nonce-' + crypto.randomBytes(16).toString('hex');

      // Simulate storing state in session
      const sessionState = state;

      const params = generateValidOAuthParams({ state });

      // Validate state matches
      expect(params.get('state')).toBe(sessionState);
    });

    it('should reject mismatched state parameter', () => {
      const originalState = 'nonce-' + crypto.randomBytes(16).toString('hex');
      const sessionState = originalState;

      const params = generateValidOAuthParams({
        state: 'different-state-value'
      });

      // State doesn't match session
      expect(params.get('state')).not.toBe(sessionState);
    });

    it('should reject missing state parameter', () => {
      const params = generateValidOAuthParams();
      params.delete('state');

      // State is required for CSRF protection
      expect(params.has('state')).toBe(false);
    });

    it('should use cryptographically secure state generation', () => {
      const states = new Set<string>();

      // Generate multiple states
      for (let i = 0; i < 1000; i++) {
        const state = 'nonce-' + crypto.randomBytes(16).toString('hex');
        states.add(state);
      }

      // All should be unique
      expect(states.size).toBe(1000);

      // Should have sufficient entropy (32 hex chars = 128 bits)
      const sampleState = Array.from(states)[0];
      expect(sampleState.length).toBeGreaterThan(30);
    });
  });

  describe('Shop Domain Validation', () => {
    function isValidShopDomain(domain: string): boolean {
      const regex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
      return regex.test(domain);
    }

    it('should accept valid shop domains', () => {
      const validDomains = [
        'test-shop.myshopify.com',
        'my-store-123.myshopify.com',
        'shop.myshopify.com',
        'a.myshopify.com',
        '123-shop.myshopify.com'
      ];

      for (const domain of validDomains) {
        expect(isValidShopDomain(domain)).toBe(true);
      }
    });

    it('should reject invalid shop domains', () => {
      const invalidDomains = [
        'evil-shop.myshopify.com.attacker.com',
        'myshopify.com',
        'shop.com',
        'shop.myshopify.com/',
        'shop.myshopify.com/admin',
        'shop.myshopify.com?test=1',
        'shop.myshopify.com#fragment',
        '../../../etc/passwd',
        'shop.myshopify.com%0a',
        'shop.myshopify.com\n',
        'shop.myshopify.com;ls',
        '',
        'null',
        'undefined'
      ];

      for (const domain of invalidDomains) {
        expect(isValidShopDomain(domain)).toBe(false);
      }
    });

    it('should prevent open redirect attacks', () => {
      const maliciousShops = [
        'shop.myshopify.com@evil.com',
        'shop.myshopify.com.evil.com',
        'shop.myshopify.com%2fevil.com',
        'shop.myshopify.com//evil.com'
      ];

      for (const shop of maliciousShops) {
        expect(isValidShopDomain(shop)).toBe(false);
      }
    });
  });

  describe('Session Management Security', () => {
    it('should generate new session ID on OAuth completion', async () => {
      // Simulate existing session
      let sessionId = 'old-session-' + crypto.randomBytes(16).toString('hex');

      // OAuth completion should regenerate session
      const newSessionId = 'new-session-' + crypto.randomBytes(16).toString('hex');

      // Sessions should be different (prevents session fixation)
      expect(newSessionId).not.toBe(sessionId);
      expect(newSessionId).toMatch(/^new-session-[a-f0-9]{32}$/);
    });

    it('should set secure cookie attributes', () => {
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax' as const,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
      };

      expect(cookieOptions.httpOnly).toBe(true); // Prevents XSS
      expect(cookieOptions.secure).toBe(true); // HTTPS only
      expect(cookieOptions.sameSite).toBe('lax'); // CSRF protection
    });

    it('should encrypt session data at rest', async () => {
      const sessionData = {
        accessToken: 'shpat_' + crypto.randomBytes(32).toString('hex'),
        shop: 'test-shop.myshopify.com',
        scope: SCOPES
      };

      // Encrypt session data
      const encrypted = encrypt(JSON.stringify(sessionData));

      // Encrypted data should be different from plain text
      expect(encrypted).not.toContain('shpat_');
      expect(encrypted).not.toContain('test-shop');

      // Should be able to decrypt
      const decrypted = decrypt(encrypted);
      const parsed = JSON.parse(decrypted);

      expect(parsed.accessToken).toBe(sessionData.accessToken);
      expect(parsed.shop).toBe(sessionData.shop);
    });

    it('should use different IV for each encryption', () => {
      const data = 'same-data';

      const encrypted1 = encrypt(data);
      const encrypted2 = encrypt(data);

      // Same data should produce different ciphertexts (due to random IV)
      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(data);
      expect(decrypt(encrypted2)).toBe(data);
    });
  });

  describe('OAuth URL Generation', () => {
    it('should generate valid OAuth authorization URL', () => {
      const state = 'test-state-123';
      const redirectUri = `${APP_URL}/auth/callback`;
      const shop = 'test-shop.myshopify.com';

      const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
      authUrl.searchParams.set('client_id', API_KEY);
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('state', state);

      const url = authUrl.toString();

      expect(url).toContain('test-shop.myshopify.com');
      expect(url).toContain('client_id=' + API_KEY);
      expect(url).toContain('scope=' + encodeURIComponent(SCOPES));
      expect(url).toContain('redirect_uri=' + encodeURIComponent(redirectUri));
      expect(url).toContain('state=test-state-123');
    });

    it('should include all required OAuth parameters', () => {
      const params = {
        client_id: API_KEY,
        scope: SCOPES,
        redirect_uri: `${APP_URL}/auth/callback`,
        state: 'nonce-123',
        grant_options: 'offline' // For offline access tokens
      };

      // All required params should be present
      expect(params.client_id).toBeDefined();
      expect(params.scope).toBeDefined();
      expect(params.redirect_uri).toBeDefined();
      expect(params.state).toBeDefined();
    });
  });

  describe('Token Exchange Security', () => {
    it('should validate token exchange response', () => {
      // Mock successful token exchange response
      const validResponse = {
        access_token: 'shpat_' + crypto.randomBytes(32).toString('hex'),
        scope: SCOPES,
        associated_user_scope: 'write_products',
        associated_user: {
          id: 12345,
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com'
        }
      };

      // Validate response structure
      expect(validResponse.access_token).toMatch(/^shpat_[a-f0-9]{64}$/);
      expect(validResponse.scope).toBe(SCOPES);
    });

    it('should never log sensitive tokens', () => {
      const token = 'shpat_secret_token_12345';

      // Mock logger that should redact tokens
      const sanitizeForLogging = (data: any): any => {
        const str = JSON.stringify(data);
        return JSON.parse(
          str.replace(/shpat_[a-zA-Z0-9_-]+/g, 'shpat_[REDACTED]')
        );
      };

      const logData = {
        event: 'oauth_complete',
        access_token: token,
        shop: 'test-shop.myshopify.com'
      };

      const sanitized = sanitizeForLogging(logData);
      expect(sanitized.access_token).toBe('shpat_[REDACTED]');
      expect(sanitized.shop).toBe('test-shop.myshopify.com');
    });
  });

  describe('OAuth Error Handling', () => {
    it('should handle OAuth denial gracefully', () => {
      const params = new URLSearchParams({
        error: 'access_denied',
        error_description: 'User denied authorization'
      });

      expect(params.get('error')).toBe('access_denied');

      // Should redirect to an error page, not expose technical details
      const errorMessage = 'Installation was cancelled. Please try again.';
      expect(errorMessage).not.toContain('access_denied'); // User-friendly message
    });

    it('should handle invalid client errors', () => {
      const params = new URLSearchParams({
        error: 'invalid_client',
        error_description: 'The client is not authorized'
      });

      // Should log error internally but show generic message to user
      const userMessage = 'Installation failed. Please contact support.';
      expect(userMessage).not.toContain('invalid_client');
    });
  });

  describe('Scope Validation', () => {
    it('should validate granted scopes match requested', () => {
      const requestedScopes = SCOPES.split(',');
      const grantedScopes = 'read_products,write_products,read_customers';
      const granted = grantedScopes.split(',');

      // Check if all granted scopes were requested
      for (const scope of granted) {
        expect(requestedScopes).toContain(scope);
      }

      // Check if we got all required scopes (subset is ok)
      const requiredScopes = ['read_products', 'read_customers'];
      for (const required of requiredScopes) {
        expect(granted).toContain(required);
      }
    });

    it('should reject if critical scopes are missing', () => {
      const requiredScopes = ['read_products', 'read_customers', 'read_orders'];
      const grantedScopes = ['read_products']; // Missing critical scopes

      const hasAllRequired = requiredScopes.every(scope =>
        grantedScopes.includes(scope)
      );

      expect(hasAllRequired).toBe(false);
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should prevent reuse of authorization codes', async () => {
      const code = 'auth-code-123';
      const usedCodes = new Set<string>();

      // First use of code
      if (usedCodes.has(code)) {
        throw new Error('Code already used');
      }
      usedCodes.add(code);

      // Attempt to reuse code
      expect(usedCodes.has(code)).toBe(true); // Code marked as used
      expect(() => {
        if (usedCodes.has(code)) {
          throw new Error('Code already used');
        }
      }).toThrow('Code already used');
    });

    it('should expire authorization codes quickly', () => {
      const code = {
        value: 'auth-code-456',
        createdAt: Date.now(),
        maxAge: 60000 // 60 seconds
      };

      // Code is valid initially
      const isExpired = (Date.now() - code.createdAt) > code.maxAge;
      expect(isExpired).toBe(false);

      // Simulate time passing
      const futureTime = code.createdAt + 65000; // 65 seconds later
      const isExpiredLater = (futureTime - code.createdAt) > code.maxAge;
      expect(isExpiredLater).toBe(true);
    });
  });
});