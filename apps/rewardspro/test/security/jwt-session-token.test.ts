import { describe, test, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

describe('JWT Session Token Security Tests', () => {
  const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-api-key';
  const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';
  const SHOP_DOMAIN = 'test-shop.myshopify.com';

  // Helper to create Shopify-compliant session tokens
  function createSessionToken(overrides: Partial<Record<string, any>> = {}): string {
    const now = Math.floor(Date.now() / 1000);

    const claims = {
      // Required Shopify claims
      iss: `https://${SHOP_DOMAIN}/admin`,
      dest: `https://${SHOP_DOMAIN}`,
      aud: SHOPIFY_API_KEY,
      sub: 'user-123',
      exp: now + 60, // 1 minute expiry
      nbf: now - 10,
      iat: now - 10,
      jti: 'uuid-' + Math.random().toString(36).substr(2, 9),
      sid: 'session-' + Math.random().toString(36).substr(2, 9),
      ...overrides
    };

    return jwt.sign(claims, SHOPIFY_API_SECRET, { algorithm: 'HS256' });
  }

  // Token validation function (matches app implementation)
  function validateSessionToken(token: string): { valid: boolean; error?: string; payload?: any } {
    try {
      const decoded = jwt.verify(token, SHOPIFY_API_SECRET, {
        algorithms: ['HS256'],
        audience: SHOPIFY_API_KEY,
        clockTolerance: 5 // 5 seconds tolerance for clock skew
      });

      // Additional Shopify-specific validations
      if (!decoded.iss || !decoded.iss.includes(SHOP_DOMAIN)) {
        return { valid: false, error: 'Invalid issuer' };
      }

      if (!decoded.dest || !decoded.dest.includes(SHOP_DOMAIN)) {
        return { valid: false, error: 'Invalid destination' };
      }

      if (!decoded.sub || !decoded.jti || !decoded.sid) {
        return { valid: false, error: 'Missing required claims' };
      }

      return { valid: true, payload: decoded };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  describe('Token Expiry (1-Minute Lifetime)', () => {
    test('accepts fresh token', () => {
      const token = createSessionToken();
      const result = validateSessionToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    test('rejects expired token', () => {
      const expiredToken = createSessionToken({
        exp: Math.floor(Date.now() / 1000) - 120 // 2 minutes ago
      });

      const result = validateSessionToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    test('enforces 1-minute expiry with fake timers', () => {
      vi.useFakeTimers();

      const token = createSessionToken({
        exp: Math.floor(Date.now() / 1000) + 30 // 30 seconds from now
      });

      // Should work initially
      let result = validateSessionToken(token);
      expect(result.valid).toBe(true);

      // Advance time by 60 seconds
      vi.setSystemTime(Date.now() + 60000);

      // Should now be expired
      result = validateSessionToken(token);
      expect(result.valid).toBe(false);

      vi.useRealTimers();
    });

    test('rejects not-yet-active token (nbf claim)', () => {
      const futureToken = createSessionToken({
        nbf: Math.floor(Date.now() / 1000) + 60 // Valid in 60 seconds
      });

      const result = validateSessionToken(futureToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('before');
    });

    test('handles clock skew tolerance', () => {
      // Token with slight future nbf (within tolerance)
      const tokenWithSkew = createSessionToken({
        nbf: Math.floor(Date.now() / 1000) + 3 // 3 seconds in future
      });

      const result = validateSessionToken(tokenWithSkew);

      expect(result.valid).toBe(true); // Should accept within 5s tolerance
    });
  });

  describe('Required Claims Validation', () => {
    const requiredClaims = [
      { name: 'iss', desc: 'issuer' },
      { name: 'dest', desc: 'destination' },
      { name: 'aud', desc: 'audience' },
      { name: 'sub', desc: 'subject' },
      { name: 'exp', desc: 'expiration' },
      { name: 'nbf', desc: 'not before' },
      { name: 'iat', desc: 'issued at' },
      { name: 'jti', desc: 'JWT ID' },
      { name: 'sid', desc: 'session ID' }
    ];

    requiredClaims.forEach(({ name, desc }) => {
      test(`rejects token missing ${desc} (${name})`, () => {
        const claims: any = {};

        // Add all claims except the one being tested
        requiredClaims.forEach(claim => {
          if (claim.name !== name) {
            if (claim.name === 'iss') claims.iss = `https://${SHOP_DOMAIN}/admin`;
            else if (claim.name === 'dest') claims.dest = `https://${SHOP_DOMAIN}`;
            else if (claim.name === 'aud') claims.aud = SHOPIFY_API_KEY;
            else if (claim.name === 'sub') claims.sub = 'user-123';
            else if (claim.name === 'exp') claims.exp = Math.floor(Date.now() / 1000) + 60;
            else if (claim.name === 'nbf') claims.nbf = Math.floor(Date.now() / 1000) - 10;
            else if (claim.name === 'iat') claims.iat = Math.floor(Date.now() / 1000) - 10;
            else if (claim.name === 'jti') claims.jti = 'uuid-123';
            else if (claim.name === 'sid') claims.sid = 'session-123';
          }
        });

        const token = jwt.sign(claims, SHOPIFY_API_SECRET, { algorithm: 'HS256' });
        const result = validateSessionToken(token);

        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Shop Domain Validation', () => {
    test('validates correct shop in issuer and destination', () => {
      const token = createSessionToken();
      const result = validateSessionToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload.iss).toContain(SHOP_DOMAIN);
      expect(result.payload.dest).toContain(SHOP_DOMAIN);
    });

    test('rejects token for different shop', () => {
      const wrongShopToken = createSessionToken({
        iss: 'https://other-shop.myshopify.com/admin',
        dest: 'https://other-shop.myshopify.com'
      });

      const result = validateSessionToken(wrongShopToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('issuer');
    });

    test('prevents shop mismatch between iss and dest', () => {
      const mismatchToken = createSessionToken({
        iss: 'https://shop-a.myshopify.com/admin',
        dest: 'https://shop-b.myshopify.com'
      });

      const result = validateSessionToken(mismatchToken);

      expect(result.valid).toBe(false);
    });
  });

  describe('Token Tampering Prevention', () => {
    test('rejects token with modified payload', () => {
      let token = createSessionToken();

      // Tamper with the payload
      const [header, payload, signature] = token.split('.');
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
      decodedPayload.sub = 'attacker-user'; // Modify subject
      const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

      const result = validateSessionToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature');
    });

    test('rejects token with wrong signature', () => {
      const token = createSessionToken();
      const [header, payload] = token.split('.');
      const wrongSignature = 'invalid-signature';
      const tamperedToken = `${header}.${payload}.${wrongSignature}`;

      const result = validateSessionToken(tamperedToken);

      expect(result.valid).toBe(false);
    });

    test('rejects token signed with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        {
          iss: `https://${SHOP_DOMAIN}/admin`,
          dest: `https://${SHOP_DOMAIN}`,
          aud: SHOPIFY_API_KEY,
          sub: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 60,
          nbf: Math.floor(Date.now() / 1000) - 10,
          iat: Math.floor(Date.now() / 1000) - 10,
          jti: 'uuid-123',
          sid: 'session-123'
        },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      const result = validateSessionToken(wrongSecretToken);

      expect(result.valid).toBe(false);
    });
  });

  describe('Algorithm Validation', () => {
    test('accepts HS256 algorithm', () => {
      const token = createSessionToken();
      const result = validateSessionToken(token);

      expect(result.valid).toBe(true);
    });

    test('rejects tokens with different algorithms', () => {
      // Try to use RS256 (asymmetric) when expecting HS256
      const claims = {
        iss: `https://${SHOP_DOMAIN}/admin`,
        dest: `https://${SHOP_DOMAIN}`,
        aud: SHOPIFY_API_KEY,
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 60
      };

      // This would require a private key, so we simulate the attack
      // by creating a token with 'none' algorithm
      const unsignedToken = [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify(claims)).toString('base64url'),
        ''
      ].join('.');

      const result = validateSessionToken(unsignedToken);

      expect(result.valid).toBe(false);
    });
  });

  describe('Session Token Refresh Flow', () => {
    test('simulates token refresh after expiry', async () => {
      vi.useFakeTimers();

      let currentToken = createSessionToken();
      const makeApiCall = async (token: string) => {
        const result = validateSessionToken(token);
        if (!result.valid && result.error?.includes('expired')) {
          // Simulate App Bridge fetching new token
          currentToken = createSessionToken();
          return validateSessionToken(currentToken);
        }
        return result;
      };

      // First call succeeds
      let result = await makeApiCall(currentToken);
      expect(result.valid).toBe(true);

      // Advance time by 61 seconds
      vi.setSystemTime(Date.now() + 61000);

      // Call should trigger refresh
      result = await makeApiCall(currentToken);
      expect(result.valid).toBe(true); // New token is valid

      vi.useRealTimers();
    });
  });

  describe('Performance Requirements', () => {
    test('JWT validation completes within 2ms', () => {
      const token = createSessionToken();

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        validateSessionToken(token);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      expect(avgTime).toBeLessThan(2);
    });
  });

  describe('Security Best Practices', () => {
    test('tokens are unique (jti claim)', () => {
      const tokens = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const token = createSessionToken();
        const decoded: any = jwt.decode(token);

        expect(tokens.has(decoded.jti)).toBe(false);
        tokens.add(decoded.jti);
      }
    });

    test('session IDs are unique', () => {
      const sessionIds = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const token = createSessionToken();
        const decoded: any = jwt.decode(token);

        expect(sessionIds.has(decoded.sid)).toBe(false);
        sessionIds.add(decoded.sid);
      }
    });

    test('validates audience matches API key', () => {
      const wrongAudienceToken = createSessionToken({
        aud: 'wrong-api-key'
      });

      const result = validateSessionToken(wrongAudienceToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });
  });

  describe('Error Handling', () => {
    test('handles malformed tokens gracefully', () => {
      const malformedTokens = [
        'not.a.token',
        'invalid-jwt',
        '',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // Incomplete
        'a.b.c.d' // Too many parts
      ];

      malformedTokens.forEach(token => {
        const result = validateSessionToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    test('provides clear error messages', () => {
      const testCases = [
        {
          token: createSessionToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
          expectedError: 'expired'
        },
        {
          token: createSessionToken({ aud: 'wrong' }),
          expectedError: 'audience'
        },
        {
          token: 'malformed',
          expectedError: 'malformed'
        }
      ];

      testCases.forEach(({ token, expectedError }) => {
        const result = validateSessionToken(token);
        expect(result.valid).toBe(false);
        expect(result.error?.toLowerCase()).toContain(expectedError);
      });
    });
  });
});