/**
 * Shopify GID utilities for tests
 */

const GID_PATTERN = /^gid:\/\/shopify\/[A-Za-z]+\/\d+$/;

export function isShopifyGid(id: string): boolean {
  return GID_PATTERN.test(id);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertShopifyGid(id: string): void {
  if (UUID_PATTERN.test(id)) {
    throw new Error(`Invalid Shopify GID - database UUID provided: ${id}`);
  }
  if (/^\d+$/.test(id)) {
    throw new Error(`Invalid Shopify GID - raw numeric ID provided: ${id}`);
  }
  if (!isShopifyGid(id)) {
    throw new Error(`Invalid Shopify GID format: ${id}`);
  }
}

export function toShopifyGid(
  id: string | number | null | undefined,
  resource: string
): string | null {
  if (id === null || id === undefined || id === '') return null;
  const raw = String(id);
  // Already a GID
  if (isShopifyGid(raw)) return raw;
  // Numeric ID — convert to GID
  if (/^\d+$/.test(raw)) return `gid://shopify/${resource}/${raw}`;
  return null;
}
