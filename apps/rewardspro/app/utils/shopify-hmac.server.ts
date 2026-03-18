/**
 * Shopify HMAC Verification Utility
 *
 * Verifies that requests (OAuth callbacks, return URLs) actually came from Shopify
 * by validating the HMAC signature against the app's shared secret.
 */

import crypto from "crypto";

/**
 * Verify HMAC signature from Shopify request
 *
 * @param params - URLSearchParams from the request
 * @param hmac - The HMAC value from the request (usually params.get('hmac'))
 * @returns true if HMAC is valid, false otherwise
 */
export function verifyShopifyHMAC(
  params: URLSearchParams,
  hmac: string | null
): boolean {
  if (!hmac) {
    console.warn('[HMAC Verification] No HMAC provided');
    return false;
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('[HMAC Verification] SHOPIFY_API_SECRET not configured');
    return false;
  }

  try {
    // Create a copy of params without the HMAC and signature fields
    const paramsForVerification = new URLSearchParams();

    for (const [key, value] of params.entries()) {
      if (key !== 'hmac' && key !== 'signature') {
        paramsForVerification.append(key, value);
      }
    }

    // Sort parameters alphabetically and create query string
    const sortedParams = Array.from(paramsForVerification.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    // Generate HMAC using SHA256
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(sortedParams)
      .digest('hex');

    // Compare HMACs (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(calculatedHmac, 'hex')
    );

    if (isValid) {
      console.log('[HMAC Verification] ✅ HMAC valid');
    } else {
      console.warn('[HMAC Verification] ❌ HMAC invalid', {
        received: hmac,
        calculated: calculatedHmac,
        params: sortedParams,
      });
    }

    return isValid;

  } catch (error) {
    console.error('[HMAC Verification] Error during verification:', error);
    return false;
  }
}

/**
 * Verify webhook HMAC signature
 *
 * @param rawBody - Raw request body (string or Buffer)
 * @param hmacHeader - The X-Shopify-Hmac-Sha256 header value
 * @returns true if HMAC is valid, false otherwise
 */
export function verifyWebhookHMAC(
  rawBody: string | Buffer,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader) {
    console.warn('[Webhook HMAC] No HMAC header provided');
    return false;
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('[Webhook HMAC] SHOPIFY_API_SECRET not configured');
    return false;
  }

  try {
    // Generate HMAC using SHA256
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'), 'utf8')
      .digest('base64');

    // Compare HMACs
    const isValid = calculatedHmac === hmacHeader;

    if (isValid) {
      console.log('[Webhook HMAC] ✅ Webhook HMAC valid');
    } else {
      console.warn('[Webhook HMAC] ❌ Webhook HMAC invalid');
    }

    return isValid;

  } catch (error) {
    console.error('[Webhook HMAC] Error during verification:', error);
    return false;
  }
}
