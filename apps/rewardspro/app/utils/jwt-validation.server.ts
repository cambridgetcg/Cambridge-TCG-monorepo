/**
 * JWT Validation Middleware for Shopify Session Tokens
 * Implements comprehensive validation based on 2024-2025 requirements
 *
 * NOTE: Full JWT validation disabled - using Shopify's built-in session validation instead.
 * This module provides helper utilities for token extraction and error responses.
 */

import { createLogger } from '~/services/logger.server';

const logger = createLogger('JWTValidation');

export interface SessionTokenPayload {
  iss: string;  // Issuer - shop's admin domain
  dest: string; // Destination shop domain
  aud: string;  // Audience - app's client ID
  sub: string;  // Subject - user ID
  exp: number;  // Expiration timestamp
  nbf: number;  // Not before timestamp
  iat: number;  // Issued at timestamp
  jti: string;  // Unique JWT ID
  sid: string;  // Session ID
  sig: string;  // Additional Shopify signature
}

export interface ValidationResult {
  valid: boolean;
  payload?: SessionTokenPayload;
  error?: {
    code: string;
    message: string;
    shouldRetry?: boolean;
  };
  shopifySession?: {
    shop: string;
    userId: string;
    sessionId: string;
  };
}

/**
 * Validate a Shopify session token
 */
export async function validateSessionToken(
  request: Request,
  _apiSecret: string,
  _apiKey: string
): Promise<ValidationResult> {
  logger.debug('Starting validation');

  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('Missing or invalid Authorization header');
    return {
      valid: false,
      error: {
        code: 'MISSING_TOKEN',
        message: 'Authorization header with Bearer token required',
        shouldRetry: false
      }
    };
  }

  const sessionToken = authHeader.substring(7);
  logger.debug('Token extracted', { tokenLength: sessionToken.length });

  // Full JWT validation disabled - Shopify's authenticate.admin() handles this
  // This function is kept for compatibility but always returns disabled status
  return {
    valid: false,
    error: {
      code: 'JWT_DISABLED',
      message: 'Use Shopify authenticate.admin() for session validation'
    }
  };
}

/**
 * Extract shop domain from request (URL param or token)
 */
export function extractShopFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get('shop');

  if (shopParam) {
    logger.debug('Shop extracted from URL', { shop: shopParam });
    return shopParam;
  }

  // Try to extract from token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const [, payloadBase64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      const shop = payload.dest?.replace('https://', '');

      if (shop) {
        logger.debug('Shop extracted from token', { shop });
        return shop;
      }
    } catch (error) {
      logger.error('Failed to extract shop from token', error);
    }
  }

  logger.warn('No shop found in request');
  return null;
}

/**
 * Create a response with proper error structure
 */
export function createErrorResponse(error: ValidationResult['error']) {
  const status = error?.shouldRetry ? 401 : 403;
  
  return new Response(
    JSON.stringify({
      error: error?.code,
      message: error?.message,
      shouldRetry: error?.shouldRetry || false
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Code': error?.code || 'UNKNOWN_ERROR'
      }
    }
  );
}

/**
 * Middleware helper for Remix loaders/actions
 */
export async function requireValidSession(
  request: Request,
  apiSecret: string,
  apiKey: string
) {
  const validation = await validateSessionToken(request, apiSecret, apiKey);
  
  if (!validation.valid) {
    throw createErrorResponse(validation.error);
  }
  
  return validation.shopifySession!;
}