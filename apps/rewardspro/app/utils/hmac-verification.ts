/**
 * HMAC Verification for Shopify App Proxy Requests
 * 
 * CRITICAL: App proxy HMAC uses NO delimiter between parameters (unlike OAuth)
 * This is the most common source of verification failures.
 */

import crypto from 'crypto';

/**
 * Verify HMAC signature for Shopify App Proxy requests
 * 
 * @param url - The full request URL with query parameters
 * @param secret - Your Shopify app's API secret key
 * @returns true if signature is valid, false otherwise
 */
export function verifyAppProxySignature(url: string | URL, secret: string): boolean {
  try {
    const urlObj = url instanceof URL ? url : new URL(url);
    const params = urlObj.searchParams;
    
    // Extract the signature
    const signature = params.get('signature');
    if (!signature) {
      console.error('No signature parameter found in request');
      return false;
    }
    
    // Build the message to verify (all params except signature)
    const entries: string[] = [];
    params.forEach((value, key) => {
      if (key === 'signature') return;
      entries.push(`${key}=${value}`);
    });
    
    // Sort alphabetically by key
    entries.sort();
    
    // CRITICAL: Join WITHOUT delimiter for app proxy
    const message = entries.join('');
    
    // Calculate HMAC-SHA256
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(message, 'utf8')
      .digest('hex');
    
    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch (error) {
    console.error('Error verifying app proxy signature:', error);
    return false;
  }
}

/**
 * Verify HMAC for webhook requests (different from app proxy!)
 * 
 * @param rawBody - The raw request body as string
 * @param signature - The X-Shopify-Hmac-Sha256 header value
 * @param secret - Your webhook secret
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  try {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Extract and validate shop domain from request
 * 
 * @param shop - The shop parameter from the request
 * @returns Validated shop domain or null if invalid
 */
export function validateShopDomain(shop: string | null): string | null {
  if (!shop) return null;
  
  // Strict validation for Shopify shop domains
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  
  if (!shopRegex.test(shop)) {
    console.warn(`Invalid shop domain format: ${shop}`);
    return null;
  }
  
  return shop;
}

/**
 * Security logging helper for tracking suspicious activity
 */
export function logSecurityEvent(
  event: 'INVALID_SIGNATURE' | 'INVALID_SHOP' | 'UNAUTHORIZED_ACCESS' | 'RATE_LIMIT',
  details: Record<string, any>
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...details
  };
  
  // In production, send to monitoring service
  console.warn('[SECURITY]', JSON.stringify(logEntry));
  
  // You could also store in database for audit trail
  // await db.securityLog.create({ data: logEntry });
}