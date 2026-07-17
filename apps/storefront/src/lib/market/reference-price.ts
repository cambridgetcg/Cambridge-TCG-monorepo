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
 * As of 2026-07-17 the reference is FIRST-PARTY: the last price this card
 * traded for on Cambridge's own P2P market (see @/lib/prices/first-party).
 * The former CardRush-derived spot is `internal-only` / publication-blocked
 * (no recorded downstream permission), so it is never served. Returns null
 * when the card has not yet traded here; callers render an honest "no trades
 * yet" note rather than a bare "not available".
 */

import { getFirstPartyReferences } from "@/lib/prices/first-party";

export async function resolveReferencePrice(sku: string): Promise<number | null> {
  const refs = await getFirstPartyReferences([sku]).catch(() => null);
  return refs?.get(sku)?.price ?? null;
}
