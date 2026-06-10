import type { DecodedSessionToken, SessionTokenClaims } from '../types/session';
import { logger } from './logger';

/**
 * Decodes a JWT session token without verification
 * Note: Verification should happen on your backend
 */
export function decodeSessionToken(token: string): DecodedSessionToken {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = parts[1];
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(decodedPayload) as SessionTokenClaims;

    logger.debug('Decoded claims:', {
      hasDest: !!claims.dest,
      hasSub: !!claims.sub,
      dest: claims.dest,
      sub: claims.sub,
      exp: claims.exp
    });

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    const isExpired = claims.exp < now;

    // Extract customer ID if present
    let customerId: string | undefined;
    if (claims.sub) {
      const match = claims.sub.match(/gid:\/\/shopify\/Customer\/(\d+)/);
      customerId = match ? match[1] : undefined;
      logger.debug('Extracted customer ID:', customerId, 'from sub:', claims.sub);
    }

    return {
      claims,
      token,
      isExpired,
      customerId,
    };
  } catch (error) {
    logger.error('Failed to decode session token:', error);
    throw new Error('Invalid session token');
  }
}

/**
 * Gets the customer ID from a session token
 */
export function getCustomerIdFromToken(token: string): string | null {
  try {
    const decoded = decodeSessionToken(token);
    return decoded.customerId || null;
  } catch {
    return null;
  }
}

/**
 * Checks if a session token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = decodeSessionToken(token);
    return decoded.isExpired;
  } catch {
    return true;
  }
}

/**
 * Gets the remaining time (in seconds) before token expiration
 */
export function getTokenExpiryTime(token: string): number {
  try {
    const decoded = decodeSessionToken(token);
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, decoded.claims.exp - now);
  } catch {
    return 0;
  }
}
