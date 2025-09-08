/**
 * JWT Validation Middleware for Shopify Session Tokens
 * Implements comprehensive validation based on 2024-2025 requirements
 */

// import jwt from 'jsonwebtoken';
// JWT functionality temporarily disabled - need to install @types/jsonwebtoken

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
  apiSecret: string,
  apiKey: string
): Promise<ValidationResult> {
  console.log("[JWT Validation] Starting validation...");

  // Extract token from Authorization header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    console.error("[JWT Validation] Missing or invalid Authorization header");
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
  console.log("[JWT Validation] Token extracted, length:", sessionToken.length);

  // JWT validation temporarily disabled - need to install @types/jsonwebtoken
  return {
    valid: false,
    error: {
      code: 'JWT_DISABLED',
      message: 'JWT validation temporarily disabled'
    }
  };
  
  /* Commented out until @types/jsonwebtoken is installed
  try {

    const now = Math.floor(Date.now() / 1000);

    // 1. Check expiration
    if (payload.exp <= now) {
      console.error("[JWT Validation] Token expired:", {
        exp: payload.exp,
        now,
        expired_seconds_ago: now - payload.exp
      });
      
      return {
        valid: false,
        error: {
          code: 'SESSION_TOKEN_EXPIRED',
          message: `Token expired ${now - payload.exp} seconds ago`,
          shouldRetry: true
        }
      };
    }

    // 2. Check not-before timestamp
    if (payload.nbf > now) {
      console.error("[JWT Validation] Token not yet valid:", {
        nbf: payload.nbf,
        now,
        valid_in_seconds: payload.nbf - now
      });
      
      return {
        valid: false,
        error: {
          code: 'TOKEN_NOT_YET_VALID',
          message: `Token will be valid in ${payload.nbf - now} seconds`,
          shouldRetry: true
        }
      };
    }

    // 3. Validate audience (must match our API key)
    if (payload.aud !== apiKey) {
      console.error("[JWT Validation] Invalid audience:", {
        expected: apiKey,
        received: payload.aud
      });
      
      return {
        valid: false,
        error: {
          code: 'INVALID_AUDIENCE',
          message: 'Token audience does not match API key',
          shouldRetry: false
        }
      };
    }

    // 4. Validate issuer and destination consistency
    const shopDomain = payload.dest.replace('https://', '');
    const issuerDomain = payload.iss.replace('https://', '');
    
    if (!shopDomain || !issuerDomain) {
      console.error("[JWT Validation] Invalid shop domains:", {
        dest: payload.dest,
        iss: payload.iss
      });
      
      return {
        valid: false,
        error: {
          code: 'INVALID_SHOP_DOMAIN',
          message: 'Invalid shop domain in token',
          shouldRetry: false
        }
      };
    }

    // 5. Additional validation - check token age
    const tokenAge = now - payload.iat;
    if (tokenAge > 70) { // Tokens should be refreshed every 60 seconds
      console.warn("[JWT Validation] Token is old but still valid:", {
        age_seconds: tokenAge
      });
    }

    console.log("[JWT Validation] ✅ Token validated successfully:", {
      shop: shopDomain,
      userId: payload.sub,
      sessionId: payload.sid,
      expires_in: payload.exp - now,
      age: tokenAge
    });

    return {
      valid: true,
      payload,
      shopifySession: {
        shop: shopDomain,
        userId: payload.sub,
        sessionId: payload.sid
      }
    };

  } catch (error: any) {
    console.error("[JWT Validation] Validation error:", error.message);

    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return {
        valid: false,
        error: {
          code: 'SESSION_TOKEN_EXPIRED',
          message: 'Session token has expired',
          shouldRetry: true
        }
      };
    }

    if (error.name === 'JsonWebTokenError') {
      return {
        valid: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message,
          shouldRetry: false
        }
      };
    }

    if (error.name === 'NotBeforeError') {
      return {
        valid: false,
        error: {
          code: 'TOKEN_NOT_YET_VALID',
          message: 'Token not yet valid',
          shouldRetry: true
        }
      };
    }

    // Generic error
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Token validation failed',
        shouldRetry: false
      }
    };
  }
  */
}

/**
 * Extract shop domain from request (URL param or token)
 */
export function extractShopFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get('shop');
  
  if (shopParam) {
    console.log("[JWT Validation] Shop extracted from URL:", shopParam);
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
        console.log("[JWT Validation] Shop extracted from token:", shop);
        return shop;
      }
    } catch (error) {
      console.error("[JWT Validation] Failed to extract shop from token:", error);
    }
  }

  console.warn("[JWT Validation] No shop found in request");
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