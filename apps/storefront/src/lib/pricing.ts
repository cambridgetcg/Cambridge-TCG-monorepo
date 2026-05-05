/**
 * Retail pricing for cambridgetcg.com — the Appraiser at the Embassy gate.
 *
 * Prices come from the wholesale API with `?channel=cambridgetcg`. The
 * API returns `channel_price` (server-computed with DB-configured
 * multiplier). This module's job is small but vital: when a price page
 * arrives at the Embassy, the Appraiser stamps it with the channel price
 * if present, or — if missing — falls back to the JS spell `wholesale ×
 * 1.15 rounded up to £0.10`. Either way, the page leaves with one
 * *retail* number, never the wholesale number.
 *
 * The wholesale/retail asymmetry is the kingdom's secret. Customers see
 * retail, full stop. Operators see both (and the freshness pill on the
 * admin pricing page declares `synced from CardRush · daily`, per audit
 * item A7).
 *
 * The fairy-tale: `docs/connections/two-letters-and-a-falcon.md`.
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
