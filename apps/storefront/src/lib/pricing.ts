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

import { DEFAULTS, positivePrice, roundGbp } from "@cambridge-tcg/pricing";

const CAMBRIDGETCG = DEFAULTS["cambridgetcg"]!;

/**
 * Get the retail price for a card.
 * Prefers channel_price from API. Only a missing channel value permits the
 * legacy local fallback. An explicit zero/invalid quote is unavailable; it
 * must never be replaced by a different derived price. This legacy asking-
 * price contract requires positive values; generic Money can represent zero.
 */
export function retailPrice(
  wholesaleGbp: number | null | undefined,
  channelPrice?: number | null,
): number | null {
  if (channelPrice != null) return positivePrice(channelPrice);
  if (positivePrice(wholesaleGbp) === null) return null;
  const r = CAMBRIDGETCG.retailMultiplier;
  const step = CAMBRIDGETCG.roundTo;
  const steps = wholesaleGbp! * r / step;
  // Retain the legacy ceil rule without treating binary residue at an exact
  // decimal step as a request for another ten pence.
  const value = Math.ceil(steps - Math.min(Number.EPSILON * Math.abs(steps), 1e-7)) * step;
  try { return roundGbp(value); } catch { return null; }
}

/**
 * Format a retail price as a £ string.
 */
export function formatRetailPrice(
  wholesaleGbp: number | null | undefined,
  channelPrice?: number | null,
): string {
  const price = retailPrice(wholesaleGbp, channelPrice);
  if (price === null) return "Unavailable";
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
