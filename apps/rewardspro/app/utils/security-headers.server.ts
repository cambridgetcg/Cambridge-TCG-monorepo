/**
 * Security headers for document and data responses (called from entry.server).
 *
 * Embedding in Shopify admin is governed by the Content-Security-Policy
 * frame-ancestors header that addDocumentResponseHeaders sets for the shop.
 * Don't add X-Frame-Options here: it can't allow both admin.shopify.com and
 * the shop's domain, and browsers ignore its old ALLOW-FROM form.
 */
export function addSecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}
