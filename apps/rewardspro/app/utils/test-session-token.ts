/**
 * Test Utility for Customer Account Session Tokens
 *
 * This utility helps test the customer account authentication by generating
 * valid session tokens for development and testing.
 *
 * IMPORTANT: This is for testing only! In production, tokens are generated
 * by Shopify's App Bridge in the customer account extension.
 */

import jwt from 'jsonwebtoken';

interface SessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string; // Customer Global ID
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

/**
 * Generate a test session token for customer account authentication
 *
 * @param customerId - Shopify customer ID (numeric string)
 * @param shop - Shop domain (e.g., "test-store.myshopify.com")
 * @returns Signed JWT token valid for 1 minute
 */
export function generateTestSessionToken(
  customerId: string,
  shop: string
): string {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set');
  }

  const now = Math.floor(Date.now() / 1000);

  const payload: SessionTokenPayload = {
    iss: 'https://shopify.com',
    dest: shop,
    aud: apiKey,
    sub: `gid://shopify/Customer/${customerId}`,
    exp: now + 60, // Expires in 1 minute
    nbf: now,
    iat: now,
    jti: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sid: `test-session-${Date.now()}`,
  };

  return jwt.sign(payload, apiSecret, {
    algorithm: 'HS256',
  });
}

/**
 * Decode a session token without verification (for debugging)
 *
 * @param token - JWT token to decode
 * @returns Decoded payload
 */
export function decodeSessionToken(token: string): SessionTokenPayload {
  return jwt.decode(token) as SessionTokenPayload;
}

/**
 * Verify a session token
 *
 * @param token - JWT token to verify
 * @returns Decoded and verified payload
 */
export function verifySessionToken(token: string): SessionTokenPayload {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set');
  }

  return jwt.verify(token, apiSecret, {
    algorithms: ['HS256'],
    audience: apiKey,
    issuer: 'https://shopify.com',
    clockTolerance: 5, // Allow 5 seconds clock skew
  }) as SessionTokenPayload;
}

/**
 * Example usage for testing:
 *
 * ```typescript
 * // Generate a test token
 * const token = generateTestSessionToken('7187914809641', 'test-store.myshopify.com');
 *
 * // Use in fetch request
 * const response = await fetch('http://localhost:3000/api/customer-account/loyalty', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *     'Content-Type': 'application/json',
 *   },
 * });
 *
 * // Decode token to see contents
 * const decoded = decodeSessionToken(token);
 * console.log(decoded);
 * ```
 */
