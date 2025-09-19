/**
 * SKU Generation Utility
 *
 * Generates unique, readable SKUs for tier products based on:
 * - Store name
 * - Tier name
 * - Duration/billing period
 * - Date created
 * - Random suffix for uniqueness
 */

export interface SKUGeneratorOptions {
  tierName: string;
  duration?: string;
  shop: string;
  productType?: 'tier' | 'addon' | 'custom';
  includeDate?: boolean;
  customPrefix?: string;
}

/**
 * Generate a unique SKU for tier products
 * Format: SHOP-TIER-DUR-DATE-RND
 * Example: TESTS-GOLD-MON-2501-X9K (TestStore - Gold - Monthly - Jan 2025 - Random X9K)
 *
 * @param options SKU generation options
 * @returns Formatted SKU string (max 40 chars)
 */
export function generateTierSKU(options: SKUGeneratorOptions): string {
  const {
    tierName,
    duration = 'ONE_TIME',
    shop,
    productType = 'tier',
    includeDate = true,
    customPrefix
  } = options;

  // Get shop name without .myshopify.com
  const shopName = shop.split('.')[0];

  // Use custom prefix or derive from shop name (3-6 chars)
  const shopPrefix = customPrefix || shopName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, Math.min(6, Math.max(3, shopName.length)));

  // Clean the tier name (use first word if multi-word, max 5 chars)
  const tierWords = tierName.split(/\s+/);
  const cleanTierName = tierWords[0]
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 5) || 'TIER';

  // Duration code mapping
  const durationCode = getDurationCode(duration);

  // Product type code (optional)
  const typeCode = {
    'tier': 'T',
    'addon': 'A',
    'custom': 'C'
  }[productType] || '';

  // Build SKU components
  const components: string[] = [shopPrefix, cleanTierName];

  if (typeCode) {
    components.push(typeCode);
  }

  components.push(durationCode);

  // Add date code if requested (YYMM format)
  if (includeDate) {
    const dateCode = getDateCode();
    components.push(dateCode);
  }

  // Add random suffix for uniqueness
  const randomSuffix = getRandomSuffix();
  components.push(randomSuffix);

  // Join with hyphens and ensure max length
  const sku = components.join('-').toUpperCase();
  return sku.substring(0, 40);
}

/**
 * Generate a simplified SKU without date/random components
 * Useful for consistent SKUs across deployments
 *
 * @param tierName Tier name
 * @param duration Duration/billing period
 * @param shop Shop domain
 * @returns Simplified SKU string
 */
export function generateSimpleSKU(
  tierName: string,
  duration: string,
  shop: string
): string {
  const shopName = shop.split('.')[0];

  const shopCode = shopName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 4);

  const tierCode = tierName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 4);

  const durCode = getDurationCode(duration);

  return `${shopCode}-${tierCode}-${durCode}`.toUpperCase();
}

/**
 * Get duration code from duration string
 */
function getDurationCode(duration: string): string {
  const codes: Record<string, string> = {
    'MONTHLY': 'MON',
    'QUARTERLY': 'QTR',
    'ANNUAL': 'ANN',
    'YEARLY': 'ANN',
    'LIFETIME': 'LTM',
    'ONE_TIME': 'ONE',
    'SINGLE': 'ONE',
    'WEEKLY': 'WKL',
    'DAILY': 'DLY'
  };

  return codes[duration.toUpperCase()] || 'STD';
}

/**
 * Get date code in YYMM format
 */
function getDateCode(): string {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * Get random alphanumeric suffix (3 chars)
 */
function getRandomSuffix(length: number = 3): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Validate if a SKU follows the expected format
 *
 * @param sku SKU to validate
 * @returns true if valid, false otherwise
 */
export function isValidSKU(sku: string): boolean {
  // Basic validation rules
  if (!sku || sku.length === 0 || sku.length > 255) {
    return false;
  }

  // Check for invalid characters (Shopify allows alphanumeric, hyphens, underscores)
  const validPattern = /^[A-Z0-9\-_]+$/i;
  return validPattern.test(sku);
}

/**
 * Parse an existing SKU to extract components
 *
 * @param sku SKU to parse
 * @returns Parsed components or null if invalid format
 */
export function parseSKU(sku: string): {
  shop?: string;
  tier?: string;
  duration?: string;
  date?: string;
  suffix?: string;
} | null {
  if (!sku) return null;

  const parts = sku.split('-');
  if (parts.length < 3) return null;

  return {
    shop: parts[0],
    tier: parts[1],
    duration: parts[2],
    date: parts[3],
    suffix: parts[4]
  };
}

/**
 * Generate batch SKUs for multiple products
 *
 * @param baseOptions Base options for all SKUs
 * @param count Number of SKUs to generate
 * @returns Array of unique SKUs
 */
export function generateBatchSKUs(
  baseOptions: SKUGeneratorOptions,
  count: number
): string[] {
  const skus = new Set<string>();

  while (skus.size < count) {
    const sku = generateTierSKU(baseOptions);
    skus.add(sku);
  }

  return Array.from(skus);
}