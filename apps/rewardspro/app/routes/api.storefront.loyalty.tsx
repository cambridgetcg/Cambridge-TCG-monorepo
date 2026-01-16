/**
 * DEPRECATED: Storefront Loyalty Endpoint
 *
 * ⚠️ SECURITY: This endpoint is permanently disabled.
 *
 * This endpoint had a critical security vulnerability (unauthenticated access)
 * and has been replaced with authenticated alternatives:
 * - App Proxy: /apps/proxy/loyalty (HMAC-authenticated by Shopify)
 * - Customer Account: /api/customer-account/loyalty (JWT-authenticated)
 *
 * Returns HTTP 410 Gone for all requests.
 */

import { json } from "@remix-run/node";

const GONE_RESPONSE = {
  error: "This endpoint is permanently disabled",
  code: "ENDPOINT_GONE"
};

export async function loader() {
  return json(GONE_RESPONSE, { status: 410 });
}

export async function action() {
  return json(GONE_RESPONSE, { status: 410 });
}

// OPTIONS for CORS preflight
export function options() {
  return new Response(null, { status: 204 });
}
