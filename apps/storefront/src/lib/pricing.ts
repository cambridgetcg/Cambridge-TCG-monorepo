/**
 * Retail pricing for cambridgetcg.com — the Appraiser at the Embassy gate.
 *
 * Prices come from the wholesale API with `?channel=cambridgetcg`. The
 * API returns `channel_price` (server-computed with DB-configured
 * multiplier). This module's job is small but vital: when a price page
 * arrives at the Embassy, the Appraiser stamps it with the channel price
 * if present, or — if missing — falls back to a local computation using
 * the cambridgetcg channel constants. Either way, the page leaves with
 * one *retail* number, never the wholesale number.
 *
 * The wholesale/retail asymmetry is the kingdom's secret. Customers see
 * retail, full stop. Operators see both (and the freshness pill on the
 * admin pricing page declares `synced from CardRush · daily`, per audit
 * item A7).
 *
 * Phase 1 (kingdom-049, 2026-05-10): the fallback's two magic numbers
 * (×1.15 retail, ceil to £0.10) used to be hard-coded here. They now
 * come from `@cambridge-tcg/pricing` DEFAULTS — one source. Phase 3 of
 * the consolidation will make the DB the authoritative source for
 * channel constants and remove silent fallbacks entirely.
 *
 * Known imperfection (will be addressed in Phase 3): this fallback
 * applies the retailMultiplier and roundTo only — it does NOT re-apply
 * VAT or margin, on the assumption that `wholesaleGbp` is already
 * post-margin/post-fee. The mismatch with the wholesale-side full chain
 * (which includes VAT) is the substrate-honesty hazard the audit flags.
 *
 * The fairy-tale: `docs/connections/two-letters-and-a-falcon.md`.
 */

import { DEFAULTS } from "@cambridge-tcg/pricing";

const CAMBRIDGETCG = DEFAULTS["cambridgetcg"]!;

/**
 * Get the retail price for a card.
 * Prefers channel_price from API; falls back to local calculation using
 * the cambridgetcg channel's retailMultiplier and roundTo.
 */
export function retailPrice(wholesaleGbp: number, channelPrice?: number): number {
  if (channelPrice != null && channelPrice > 0) return channelPrice;
  const r = CAMBRIDGETCG.retailMultiplier;
  const step = CAMBRIDGETCG.roundTo;
  return Math.ceil(wholesaleGbp * r / step) * step;
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
