import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { validateSessionToken } from '~/utils/jwt-validation.server';

describe('JWT Session Token Security Tests', () => {
  const APP_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret-key';
  const APP_KEY = process.env.SHOPIFY_API_KEY || 'test-app-key';

  // Helper to create test session tokens
  function createSessionToken(overrides: Partial<Record<string, any>> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: "https://test-shop.myshopify.com/admin",
      dest: "https://test-shop.myshopify.com",
      aud: APP_KEY,
      sub: "user-123456",
      exp: now + 60, // 1 minute from now (Shopify standard)
      nbf: now - 10, // Valid from 10 seconds ago
      iat: now - 10,
      jti: `session-${Date.now()}`,
      sid: "session-id-123",
      ...overrides
    };

    return jwt.sign(claims, APP_SECRET, { algorithm: 'HS256' });
  }

  describe('Token Validation Logic', () => {
    it('should accept valid session token', () => {
      const token = createSessionToken();
      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.dest).toBe('https://test-shop.myshopify.com');
    });

    it('should reject expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createSessionToken({
        exp: now - 120, // Expired 2 minutes ago
        iat: now - 180,
        nbf: now - 180
      });

      const result = validateSessionToken(expiredToken, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject token not yet active (nbf in future)', () => {
      const now = Math.floor(Date.now() / 1000);
      const futureToken = createSessionToken({
        nbf: now + 60, // Not valid for another minute
        exp: now + 120,
        iat: now
      });

      const result = validateSessionToken(futureToken, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should reject token with shop mismatch', () => {
      const token = createSessionToken({
        iss: "https://other-shop.myshopify.com/admin",
        dest: "https://other-shop.myshopify.com"
      });

      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com' // Different shop
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('shop mismatch');
    });

    it('should reject token with wrong audience', () => {
      const token = createSessionToken({
        aud: 'wrong-app-key'
      });

      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });

    it('should reject tampered token', () => {
      const token = createSessionToken();

      // Tamper with the payload
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      payload.sub = 'hacked-user';
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '');
      const tamperedToken = parts.join('.');

      const result = validateSessionToken(tamperedToken, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('should reject token with invalid signature', () => {
      const token = createSessionToken();
      const invalidToken = token.slice(0, -1) + '0'; // Modify last character

      const result = validateSessionToken(invalidToken, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
    });

    it('should reject token signed with wrong secret', () => {
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: "https://test-shop.myshopify.com/admin",
        dest: "https://test-shop.myshopify.com",
        aud: APP_KEY,
        sub: "user-123456",
        exp: now + 60,
        nbf: now - 10,
        iat: now - 10,
        jti: "session-123",
        sid: "session-id-123"
      };

      const wrongSecretToken = jwt.sign(claims, 'wrong-secret', { algorithm: 'HS256' });

      const result = validateSessionToken(wrongSecretToken, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('Missing Claims Validation', () => {
    const requiredClaims = ['iss', 'dest', 'aud', 'sub', 'exp', 'nbf', 'iat', 'jti'];

    requiredClaims.forEach(claim => {
      it(`should reject token missing ${claim} claim`, () => {
        const claims: any = {
          iss: "https://test-shop.myshopify.com/admin",
          dest: "https://test-shop.myshopify.com",
          aud: APP_KEY,
          sub: "user-123456",
          exp: Math.floor(Date.now() / 1000) + 60,
          nbf: Math.floor(Date.now() / 1000) - 10,
          iat: Math.floor(Date.now() / 1000) - 10,
          jti: "session-123",
          sid: "session-id-123"
        };

        delete claims[claim];

        const token = jwt.sign(claims, APP_SECRET, { algorithm: 'HS256' });

        const result = validateSessionToken(token, {
          apiKey: APP_KEY,
          apiSecret: APP_SECRET,
          shop: 'test-shop.myshopify.com'
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain(claim);
      });
    });
  });

  describe('Token Lifespan and Refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should enforce 1-minute token expiration', () => {
      const token = createSessionToken(); // Expires in 60 seconds

      // Token should be valid initially
      let result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });
      expect(result.valid).toBe(true);

      // Advance time by 59 seconds - should still be valid
      vi.advanceTimersByTime(59000);
      result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });
      expect(result.valid).toBe(true);

      // Advance time by 2 more seconds (total 61 seconds) - should be expired
      vi.advanceTimersByTime(2000);
      result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should simulate token refresh flow', () => {
      // First token
      let token = createSessionToken();
      let result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });
      expect(result.valid).toBe(true);

      // Advance time by 61 seconds - token expires
      vi.advanceTimersByTime(61000);
      result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });
      expect(result.valid).toBe(false);

      // Get a new token (simulating App Bridge refresh)
      const now = Math.floor((Date.now() + 61000) / 1000);
      token = createSessionToken({
        iat: now,
        nbf: now - 10,
        exp: now + 60
      });

      result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Clock Skew Tolerance', () => {
    it('should allow small clock skew for nbf', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createSessionToken({
        nbf: now + 5, // 5 seconds in future (within typical clock skew tolerance)
        exp: now + 65,
        iat: now
      });

      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com',
        clockTolerance: 10 // 10 second tolerance
      });

      expect(result.valid).toBe(true);
    });

    it('should allow small clock skew for exp', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = createSessionToken({
        nbf: now - 70,
        exp: now - 5, // Just expired 5 seconds ago
        iat: now - 70
      });

      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com',
        clockTolerance: 10 // 10 second tolerance
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should validate tokens within performance budget', () => {
      const tokens = Array.from({ length: 100 }, () => createSessionToken());

      const start = performance.now();
      for (const token of tokens) {
        validateSessionToken(token, {
          apiKey: APP_KEY,
          apiSecret: APP_SECRET,
          shop: 'test-shop.myshopify.com'
        });
      }
      const duration = performance.now() - start;
      const avgTime = duration / tokens.length;

      expect(avgTime).toBeLessThan(2); // Average under 2ms per token
      console.log(`JWT validation average: ${avgTime.toFixed(3)}ms per token`);
    });
  });

  describe('Algorithm Security', () => {
    it('should reject tokens with wrong algorithm', () => {
      // Try to use RS256 instead of HS256
      const token = jwt.sign(
        {
          iss: "https://test-shop.myshopify.com/admin",
          dest: "https://test-shop.myshopify.com",
          aud: APP_KEY,
          sub: "user-123456",
          exp: Math.floor(Date.now() / 1000) + 60,
          nbf: Math.floor(Date.now() / 1000) - 10,
          iat: Math.floor(Date.now() / 1000) - 10,
          jti: "session-123"
        },
        APP_SECRET,
        { algorithm: 'HS512' as any } // Different algorithm
      );

      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com',
        algorithms: ['HS256'] // Only accept HS256
      });

      expect(result.valid).toBe(false);
    });

    it('should reject "none" algorithm attack', () => {
      // Create token without signature (alg: none attack)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64').replace(/=/g, '');
      const payload = Buffer.from(JSON.stringify({
        iss: "https://test-shop.myshopify.com/admin",
        dest: "https://test-shop.myshopify.com",
        aud: APP_KEY,
        sub: "user-123456",
        exp: Math.floor(Date.now() / 1000) + 60,
        nbf: Math.floor(Date.now() / 1000) - 10,
        iat: Math.floor(Date.now() / 1000) - 10,
        jti: "session-123"
      })).toString('base64').replace(/=/g, '');

      const unsignedToken = `${header}.${payload}.`;

      const result = validateSessionToken(unsignedToken, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'test-shop.myshopify.com'
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('Session Token Payload Validation', () => {
    it('should validate Shopify-specific token structure', () => {
      const token = createSessionToken();
      const decoded = jwt.decode(token) as any;

      // Check required Shopify session token fields
      expect(decoded.iss).toMatch(/^https:\/\/[a-z0-9-]+\.myshopify\.com\/admin$/);
      expect(decoded.dest).toMatch(/^https:\/\/[a-z0-9-]+\.myshopify\.com$/);
      expect(decoded.aud).toBeDefined();
      expect(decoded.sub).toBeDefined();
      expect(decoded.sid).toBeDefined();
      expect(decoded.jti).toBeDefined();

      // Check token lifetime is exactly 60 seconds
      const lifetime = decoded.exp - decoded.iat;
      expect(lifetime).toBe(70); // iat is 10 seconds before, exp is 60 seconds after now
    });

    it('should extract shop domain from token', () => {
      const token = createSessionToken({
        iss: "https://my-test-shop.myshopify.com/admin",
        dest: "https://my-test-shop.myshopify.com"
      });

      const result = validateSessionToken(token, {
        apiKey: APP_KEY,
        apiSecret: APP_SECRET,
        shop: 'my-test-shop.myshopify.com'
      });

      expect(result.valid).toBe(true);
      expect(result.payload?.dest).toContain('my-test-shop.myshopify.com');
    });
  });
});