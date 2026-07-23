import crypto from 'node:crypto';

// ============================================================================
// INPUT VALIDATION & SANITIZATION
// ============================================================================

/**
 * Sanitize string input to prevent XSS
 * Removes HTML tags and dangerous characters
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Remove dangerous characters that could be used in XSS
  sanitized = sanitized
    .replace(/[<>"']/g, '') // Remove quotes and brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
  
  // Trim and limit length
  return sanitized.trim().substring(0, 1000);
}

/**
 * Validate and sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  
  // Basic email validation and sanitization
  const sanitized = email.toLowerCase().trim();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
}

/**
 * Validate shop domain format (Shopify specific)
 */
export function isValidShopDomain(shop: string): boolean {
  if (!shop || typeof shop !== 'string') return false;
  
  // Must match Shopify domain format
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(input: any, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const num = Number(input);
  
  if (isNaN(num) || !isFinite(num)) {
    throw new Error('Invalid number');
  }
  
  if (num < min || num > max) {
    throw new Error(`Number must be between ${min} and ${max}`);
  }
  
  return num;
}

// ============================================================================
// HMAC VERIFICATION
// ============================================================================

/**
 * Verify HMAC signature for Shopify requests
 */
export function verifyHMAC(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac');
  if (!hmac) return false;
  
  // Remove hmac and signature from params
  const filteredParams = new URLSearchParams();
  for (const [key, value] of params) {
    if (key !== 'hmac' && key !== 'signature') {
      filteredParams.append(key, value);
    }
  }
  
  // Sort params lexicographically
  const sortedParams = Array.from(filteredParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // Compute HMAC
  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');
  
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedHmac),
    Buffer.from(hmac.toLowerCase())
  );
}

/**
 * Verify webhook HMAC signature
 */
export function verifyWebhookHMAC(request: Request, rawBody: string, secret: string): boolean {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  if (!hmacHeader) return false;
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  );
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

const rateLimitMap = new Map<string, number[]>();

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(key: string, options: RateLimitOptions): void {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  
  // Filter out old timestamps outside the window
  const recentTimestamps = timestamps.filter(t => now - t < options.windowMs);
  
  if (recentTimestamps.length >= options.maxRequests) {
    throw new Response('Too many requests. Please wait a moment.', { status: 429 });
  }
  
  // Add current timestamp
  recentTimestamps.push(now);
  rateLimitMap.set(key, recentTimestamps);
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean up
    cleanupRateLimitMap(options.windowMs);
  }
}

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimitMap(windowMs: number): void {
  const now = Date.now();
  
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const recentTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (recentTimestamps.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, recentTimestamps);
    }
  }
}

// ============================================================================
// VALIDATION HELPERS (without Zod)
// ============================================================================

/**
 * Validate customer input
 */
export function validateCustomerInput(data: any): {
  email: string;
  shopifyCustomerId: string;
  storeCredit: number;
} {
  const email = sanitizeEmail(data.email);
  
  if (!data.shopifyCustomerId || !/^\d+$/.test(data.shopifyCustomerId)) {
    throw new Error('Invalid Shopify customer ID');
  }
  
  const storeCredit = sanitizeNumber(data.storeCredit, 0, 999999.99);
  
  return {
    email,
    shopifyCustomerId: data.shopifyCustomerId,
    storeCredit,
  };
}

/**
 * Validate tier input
 */
export function validateTierInput(data: any): {
  name: string;
  minSpend: number;
  cashbackPercent: number;
  evaluationPeriod: 'ANNUAL' | 'LIFETIME';
} {
  // Name validation
  if (!data.name || data.name.length < 1) {
    throw new Error('Name is required');
  }
  if (data.name.length > 50) {
    throw new Error('Name must be less than 50 characters');
  }
  if (!/^[a-zA-Z0-9\s-]+$/.test(data.name)) {
    throw new Error('Name contains invalid characters');
  }
  
  const minSpend = sanitizeNumber(data.minSpend, 0, 1000000);
  const cashbackPercent = sanitizeNumber(data.cashbackPercent, 0, 100);
  
  if (!['ANNUAL', 'LIFETIME'].includes(data.evaluationPeriod)) {
    throw new Error('Invalid evaluation period');
  }
  
  return {
    name: data.name.trim(),
    minSpend,
    cashbackPercent,
    evaluationPeriod: data.evaluationPeriod as 'ANNUAL' | 'LIFETIME',
  };
}

/**
 * Validate credit adjustment input
 */
export function validateCreditAdjustment(data: any): {
  customerId: string;
  amount: number;
  reason: string;
  actionType: 'add' | 'remove' | 'sync';
} {
  // UUID validation for customerId
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!data.customerId || !uuidRegex.test(data.customerId)) {
    throw new Error('Invalid customer ID format');
  }
  
  const amount = sanitizeNumber(data.amount, 0.01, 999999.99);
  
  if (!data.reason || data.reason.length < 1) {
    throw new Error('Reason is required');
  }
  if (data.reason.length > 500) {
    throw new Error('Reason must be less than 500 characters');
  }
  
  if (!['add', 'remove', 'sync'].includes(data.actionType)) {
    throw new Error('Invalid action type');
  }
  
  return {
    customerId: data.customerId,
    amount,
    reason: sanitizeString(data.reason),
    actionType: data.actionType as 'add' | 'remove' | 'sync',
  };
}

// ============================================================================
// SQL INJECTION PREVENTION
// ============================================================================

/**
 * Escape SQL identifiers (table/column names)
 * Note: Prisma handles parameterized queries automatically
 */
export function escapeIdentifier(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Invalid identifier');
  }
  
  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid identifier format');
  }
  
  return identifier;
}

// ============================================================================
// SESSION SECURITY
// ============================================================================

/**
 * Generate secure session ID
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash sensitive data for storage
 */
export function hashSensitiveData(data: string): string {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export interface AuditLogEntry {
  event: string;
  shop: string;
  userId?: string;
  details: Record<string, any>;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
}

/**
 * Create audit log entry for security events
 */
export function createAuditLog(entry: AuditLogEntry): AuditLogEntry {
  // Sanitize details to prevent log injection
  const sanitizedDetails = Object.fromEntries(
    Object.entries(entry.details).map(([key, value]) => [
      sanitizeString(key),
      typeof value === 'string' ? sanitizeString(value) : value
    ])
  );
  
  return {
    ...entry,
    details: sanitizedDetails,
    timestamp: new Date(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  sanitizeString,
  sanitizeEmail,
  isValidShopDomain,
  sanitizeNumber,
  verifyHMAC,
  verifyWebhookHMAC,
  checkRateLimit,
  validateCustomerInput,
  validateTierInput,
  validateCreditAdjustment,
  escapeIdentifier,
  generateSessionId,
  hashSensitiveData,
  createAuditLog,
};
