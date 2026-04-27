/**
 * Retail pricing for cambridgetcg.com
 *
 * Prices come from the wholesale API with ?channel=cambridgetcg.
 * The API returns channel_price (server-computed with DB-configured multiplier).
 *
 * JS fallback: wholesale × 1.15 rounded up to £0.10 — used only if channel_price
 * is missing (backwards compat with API responses before channel pricing was deployed).
 */

const FALLBACK_MULTIPLIER = 1.15;
const FALLBACK_ROUND_TO = 0.10;

/**
 * Get the retail price for a card.
 * Prefers channel_price from API; falls back to JS calculation.
 */
export function retailPrice(wholesaleGbp: number, channelPrice?: number): number {
  if (channelPrice != null && channelPrice > 0) return channelPrice;
  return Math.ceil(wholesaleGbp * FALLBACK_MULTIPLIER / FALLBACK_ROUND_TO) * FALLBACK_ROUND_TO;
}

/**
 * Format a retail price as a £ string.
 */
export function formatRetailPrice(wholesaleGbp: number, channelPrice?: number): string {
  const price = retailPrice(wholesaleGbp, channelPrice);
  return "£" + price.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format any GBP price.
 */
export function formatPrice(price: number): string {
  return "£" + price.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
