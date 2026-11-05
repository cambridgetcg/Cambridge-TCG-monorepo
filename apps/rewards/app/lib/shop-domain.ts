/**
 * A store's canonical `*.myshopify.com` domain: the connection's key, and
 * the only shop a webhook the app checks itself may name
 * (app/shopify/webhook-hmac.server.ts). One rule for both, so a delivery
 * can never name a store no connection could have.
 */
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function isCanonicalShop(shop: string): boolean {
  return SHOP_DOMAIN.test(shop);
}
