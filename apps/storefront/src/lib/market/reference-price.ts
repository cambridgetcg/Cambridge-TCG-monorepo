/**
 * Reference-price resolution — one helper, three surfaces.
 *
 * The /market table, the /market/[sku] card page, and the listing
 * composer all show a "reference price (ref)". They used to disagree: the
 * table read through the wholesale DB (which works), while the card page
 * read through the retired wholesale HTTP API (which 401s locally / times
 * out in production), so the card page said "Not available" next to a
 * table showing £12.20 for the same card.
 *
 * `fetchCard` now shares the DB ground route with `fetchPrices`, so this
 * helper — a thin wrapper applying the same `retailPrice` stamp the
 * catalog route applies — resolves to the SAME number the table shows. It
 * is the single reference-price authority the card page's SSR seed reads,
 * so the three surfaces stay in step.
 *
 * Returns null ONLY when the reference is genuinely unavailable (the card
 * has no priced catalogue row, or every price substrate is down). Callers
 * render a labelled "source unavailable" note in that case — never a bare
 * "Not available" that reads like the card has no value.
 */

import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";

export async function resolveReferencePrice(sku: string): Promise<number | null> {
  const card = await fetchCard(sku).catch(() => null);
  if (!card || card.price_gbp == null) return null;
  return retailPrice(card.price_gbp, card.channel_price);
}
