/**
 * Secure Session Management for RewardsPro Widget
 * 
 * Handles customer session validation without exposing sensitive data
 * Uses server-side verification with Shopify's customer accounts
 */

import { db } from "~/db.server";
import crypto from "crypto";
import { validateShopDomain } from "./hmac-verification";

interface SessionData {
  customerId: string;
  shop: string;
  createdAt: number;
  expiresAt: number;
}

interface SessionValidationResult {
  isValid: boolean;
  customerId?: string;
  shop?: string;
  reason?: string;
}

// Session configuration
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS_PER_CUSTOMER = 5; // Prevent session flooding

// In-memory session store (consider Redis for production)
const sessionStore = new Map<string, SessionData>();

// Cleanup expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessionStore.entries()) {
    if (session.expiresAt < now) {
      sessionStore.delete(token);
    }
  }
}, SESSION_CLEANUP_INTERVAL);

/**
 * Create a secure session token
 * Uses cryptographically secure random generation
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create a new session for an authenticated customer
 * Called after successful Shopify authentication
 */
export async function createCustomerSession(
  customerId: string,
  shop: string
): Promise<{ token: string; expiresAt: number } | null> {
  try {
    // Validate shop domain
    const validatedShop = validateShopDomain(shop);
    if (!validatedShop) {
      console.error('[SessionManager] Invalid shop domain:', shop);
      return null;
    }
    
    // Verify customer exists and belongs to shop
    const customer = await db.customer.findFirst({
      where: {
        shopifyCustomerId: customerId,
        shop: validatedShop
      },
      select: {
        id: true
      }
    });
    
    if (!customer) {
      console.warn('[SessionManager] Customer not found:', { customerId, shop });
      return null;
    }
    
    // Clean up old sessions for this customer
    const customerSessions: string[] = [];
    for (const [token, session] of sessionStore.entries()) {
      if (session.customerId === customerId && session.shop === validatedShop) {
        customerSessions.push(token);
      }
    }
    
    // Limit sessions per customer
    if (customerSessions.length >= MAX_SESSIONS_PER_CUSTOMER) {
      // Remove oldest sessions
      const sessionsToRemove = customerSessions
        .sort((a, b) => {
          const sessionA = sessionStore.get(a)!;
          const sessionB = sessionStore.get(b)!;
          return sessionA.createdAt - sessionB.createdAt;
        })
        .slice(0, customerSessions.length - MAX_SESSIONS_PER_CUSTOMER + 1);
      
      sessionsToRemove.forEach(token => sessionStore.delete(token));
    }
    
    // Create new session
    const token = generateSessionToken();
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION;
    
    const sessionData: SessionData = {
      customerId,
      shop: validatedShop,
      createdAt: now,
      expiresAt
    };
    
    sessionStore.set(token, sessionData);
    
    console.log('[SessionManager] Session created for customer:', {
      customerId,
      shop: validatedShop,
      expiresAt: new Date(expiresAt).toISOString()
    });
    
    return { token, expiresAt };
    
  } catch (error) {
    console.error('[SessionManager] Failed to create session:', error);
    return null;
  }
}

/**
 * Validate a session token
 * Returns session data if valid, null otherwise
 */
export function validateSession(token: string | null): SessionValidationResult {
  if (!token) {
    return {
      isValid: false,
      reason: 'No token provided'
    };
  }
  
  const session = sessionStore.get(token);
  
  if (!session) {
    return {
      isValid: false,
      reason: 'Session not found'
    };
  }
  
  const now = Date.now();
  
  if (session.expiresAt < now) {
    sessionStore.delete(token);
    return {
      isValid: false,
      reason: 'Session expired'
    };
  }
  
  return {
    isValid: true,
    customerId: session.customerId,
    shop: session.shop
  };
}

/**
 * Extend session expiration (for active users)
 */
export function extendSession(token: string): boolean {
  const session = sessionStore.get(token);
  
  if (!session) {
    return false;
  }
  
  const now = Date.now();
  
  // Only extend if session is valid and has less than 30 minutes remaining
  if (session.expiresAt > now && (session.expiresAt - now) < 30 * 60 * 1000) {
    session.expiresAt = now + SESSION_DURATION;
    return true;
  }
  
  return false;
}

/**
 * Revoke a session (logout)
 */
export function revokeSession(token: string): boolean {
  return sessionStore.delete(token);
}

/**
 * Revoke all sessions for a customer
 */
export function revokeAllCustomerSessions(customerId: string, shop: string): number {
  let revokedCount = 0;
  
  for (const [token, session] of sessionStore.entries()) {
    if (session.customerId === customerId && session.shop === shop) {
      sessionStore.delete(token);
      revokedCount++;
    }
  }
  
  return revokedCount;
}

/**
 * Get session statistics (for monitoring)
 */
export function getSessionStats(): {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  customerCounts: Record<string, number>;
} {
  const now = Date.now();
  let activeSessions = 0;
  let expiredSessions = 0;
  const customerCounts: Record<string, number> = {};
  
  for (const session of sessionStore.values()) {
    if (session.expiresAt > now) {
      activeSessions++;
    } else {
      expiredSessions++;
    }
    
    const key = `${session.shop}:${session.customerId}`;
    customerCounts[key] = (customerCounts[key] || 0) + 1;
  }
  
  return {
    totalSessions: sessionStore.size,
    activeSessions,
    expiredSessions,
    customerCounts
  };
}

/**
 * Validate customer authentication from Shopify
 * This should be called after OAuth flow or customer login
 */
export async function validateCustomerAuth(
  request: Request
): Promise<{ isAuthenticated: boolean; customerId?: string; shop?: string }> {
  try {
    // Check for session token in cookie
    const cookie = request.headers.get('cookie');
    if (!cookie) {
      return { isAuthenticated: false };
    }
    
    // Parse session token from cookie
    const tokenMatch = cookie.match(/rp_session=([^;]+)/);
    if (!tokenMatch) {
      return { isAuthenticated: false };
    }
    
    const token = tokenMatch[1];
    const validation = validateSession(token);
    
    if (!validation.isValid) {
      return { isAuthenticated: false };
    }
    
    return {
      isAuthenticated: true,
      customerId: validation.customerId,
      shop: validation.shop
    };
    
  } catch (error) {
    console.error('[SessionManager] Auth validation error:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Create secure session cookie
 */
export function createSessionCookie(token: string, expiresAt: number): string {
  const expires = new Date(expiresAt).toUTCString();
  
  // Secure cookie settings
  const cookieOptions = [
    `rp_session=${token}`,
    `Expires=${expires}`,
    'HttpOnly',      // Prevent JavaScript access
    'Secure',        // HTTPS only
    'SameSite=Lax',  // CSRF protection
    'Path=/'         // Available site-wide
  ];
  
  return cookieOptions.join('; ');
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(): string {
  return 'rp_session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax; Path=/';
}