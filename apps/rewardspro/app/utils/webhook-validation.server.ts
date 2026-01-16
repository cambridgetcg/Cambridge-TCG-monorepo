/**
 * Webhook HMAC Validation Utility
 * 
 * Verifies that webhook requests are legitimately from Shopify
 * using HMAC-SHA256 signature verification.
 */

import crypto from 'crypto';

/**
 * Verify a Shopify webhook HMAC signature
 * 
 * @param request - The incoming request
 * @param rawBody - The raw request body as a string
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyWebhookHMAC(
  request: Request,
  rawBody: string
): Promise<boolean> {
  const hmacHeader = request.headers.get('X-Shopify-Hmac-SHA256');
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';
  
  if (!hmacHeader) {
    console.error('[WebhookValidation] Missing HMAC header');
    return false;
  }
  
  if (!secret) {
    console.error('[WebhookValidation] Missing webhook secret in environment');
    return false;
  }
  
  try {
    // Calculate HMAC for the raw body
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    
    // Use timing-safe comparison to prevent timing attacks
    const hmacBuffer = Buffer.from(hmacHeader, 'base64');
    const hashBuffer = Buffer.from(hash, 'base64');
    
    if (hmacBuffer.length !== hashBuffer.length) {
      console.error('[WebhookValidation] HMAC length mismatch');
      return false;
    }
    
    const isValid = crypto.timingSafeEqual(hmacBuffer, hashBuffer);
    
    if (!isValid) {
      // SECURITY: Only log truncated HMAC values to prevent credential exposure in logs
      console.error('[WebhookValidation] HMAC verification failed', {
        expectedPrefix: hash.substring(0, 8) + '...',
        receivedPrefix: hmacHeader?.substring(0, 8) + '...',
        shop: request.headers.get('x-shopify-shop-domain')
      });
    }
    
    return isValid;
  } catch (error) {
    console.error('[WebhookValidation] Error verifying HMAC:', error);
    return false;
  }
}

/**
 * Extract webhook metadata from request headers
 */
export function getWebhookMetadata(request: Request) {
  return {
    topic: request.headers.get('X-Shopify-Topic'),
    shopDomain: request.headers.get('X-Shopify-Shop-Domain'),
    webhookId: request.headers.get('X-Shopify-Webhook-Id'),
    apiVersion: request.headers.get('X-Shopify-API-Version'),
    hmac: request.headers.get('X-Shopify-Hmac-SHA256'),
  };
}

/**
 * Validate that a shop domain is in the correct format
 */
export function isValidShopDomain(domain: string): boolean {
  // Shop domains should be in format: shop-name.myshopify.com
  const shopDomainRegex = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
  return shopDomainRegex.test(domain);
}

/**
 * Create a webhook response with proper headers
 */
export function createWebhookResponse(
  status: number,
  message?: string
): Response {
  return new Response(message || (status === 200 ? 'OK' : 'Error'), {
    status,
    headers: {
      'Content-Type': 'text/plain',
      'X-Webhook-Processed': 'true',
    },
  });
}

/**
 * Log webhook processing for debugging
 */
export function logWebhookReceived(
  topic: string | null,
  shopDomain: string | null,
  webhookId: string | null
): void {
  const timestamp = new Date().toISOString();
  console.log(`[Webhook] ${timestamp} Received: ${topic} from ${shopDomain} (ID: ${webhookId})`);
}

/**
 * Helper to safely parse webhook body
 */
export async function parseWebhookBody<T = any>(
  request: Request
): Promise<{ body: T | null; rawBody: string; error?: string }> {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody) as T;
    return { body, rawBody };
  } catch (error) {
    console.error('[WebhookValidation] Failed to parse webhook body:', error);
    return {
      body: null,
      rawBody: '',
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}