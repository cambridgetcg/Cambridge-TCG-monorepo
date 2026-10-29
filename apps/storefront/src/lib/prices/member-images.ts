import 'server-only';
import { query as dbQuery } from '@/lib/db';
import { cardRushListingImageUrl } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { getEnCardImages } from '@/lib/cards/en-card-data';
import { DISPLAY_ONLY_INPUT_PAGE_LIMIT, type MemberPriceItem } from './member-feed-types';

/** Identity images beside /prices rows, so a person or an agent reading the
 * page can check the item against its price (Yu, 2026-10-29). Display only,
 * in two lanes:
 * - A CardRush row shows the listing's own image at CardRush's own URL,
 *   credited and linked to the listing (price_source_listing_images, 0145).
 *   Cambridge never copies, mirrors, re-hosts, proxies or caches it: the
 *   viewer's browser loads it from CardRush. That is the agents' reading of
 *   Yu's words, in the decision record, and CARDRUSH_LISTING_IMAGES=off
 *   turns the lane off.
 * - A row with an exact SKU shows the official English base reference
 *   through the existing reader and projector (en-card-data.ts), labelled
 *   as a reference. A CardRush row without a listing image falls back to it.
 * A row with neither shows none. Nothing in the member API, the downloads or
 * /api/v1/market/* reads this: the item projection (member-feed.ts) is
 * unchanged.
 */
export type MemberPriceImage =
  | { lane: 'cardrush-listing'; url: string }
  | { lane: 'official-reference'; url: string; attribution: string };
export interface MemberPriceImages {
  /** By item id. */
  byItem: ReadonlyMap<string, MemberPriceImage>;
  /** The page's first rows looked up, at most MEMBER_PRICE_IMAGE_ROWS. */
  rowsLookedUp: number;
}

/** At most this many rows a page are looked up: the display-only page size,
 * so a CardRush view is always covered whole. */
export const MEMBER_PRICE_IMAGE_ROWS = DISPLAY_ONLY_INPUT_PAGE_LIMIT;

/** The one switch for the CardRush image lane, read on every render (on
 * Vercel a changed value reaches only a new deployment). On unless set to
 * "off" (for when Yu says the permission does not cover linking); it stops
 * the display only, so the collector still records URLs, and the official
 * lane is not affected. */
export function cardRushListingImagesOn(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.CARDRUSH_LISTING_IMAGES?.trim().toLowerCase() !== 'off';
}

const undefinedTable = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01';

async function listingImages(ids: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!ids.length) return found;
  try {
    const { rows } = await dbQuery(`SELECT source_product_id, image_url FROM price_source_listing_images
      WHERE source = 'cardrush' AND source_product_id = ANY($1::text[]) AND withdrawn_at IS NULL`, [ids]);
    for (const row of rows) {
      const id = String(row.source_product_id);
      // Checked again as read: the stored URL must still be the listing's own host and shape.
      const url = cardRushListingImageUrl(row.image_url, id.split('/')[0]!);
      if (url) found.set(id, url);
    }
  } catch (error) {
    // A store without 0145 has no listing images yet; any other failure shows none either.
    if (!undefinedTable(error)) console.error('[member-prices] listing images unavailable', error instanceof Error ? error.name : 'unknown');
  }
  return found;
}

async function officialImages(skus: readonly string[]): Promise<Map<string, { url: string; attribution: string }>> {
  if (!skus.length) return new Map();
  try {
    return await getEnCardImages(skus);
  } catch (error) {
    console.error('[member-prices] official images unavailable', error instanceof Error ? error.name : 'unknown');
    return new Map();
  }
}

/** One bounded lookup per lane, by (source, source product) and by SKU, for
 * the page's first MEMBER_PRICE_IMAGE_ROWS rows. Never throws: a store that
 * cannot answer, or lacks 0145, shows no images. */
export async function readMemberPriceImages(items: readonly MemberPriceItem[], env: Readonly<Record<string, string | undefined>> = process.env): Promise<MemberPriceImages> {
  const rows = items.slice(0, MEMBER_PRICE_IMAGE_ROWS);
  const exactSku = (item: MemberPriceItem) => item.mappingStatus === 'exact' && item.sku ? item.sku : null;
  const listings = cardRushListingImagesOn(env) ? [...new Set(rows.filter(item => item.source === 'cardrush').map(item => item.sourceProductId))] : [];
  const skus = [...new Set(rows.map(exactSku).filter((sku): sku is string => sku !== null))];
  const [linked, official] = await Promise.all([listingImages(listings), officialImages(skus)]);
  const byItem = new Map<string, MemberPriceImage>();
  for (const item of rows) {
    const listing = item.source === 'cardrush' ? linked.get(item.sourceProductId) : undefined;
    const sku = exactSku(item);
    const reference = sku ? official.get(sku) : undefined;
    if (listing) byItem.set(item.id, { lane: 'cardrush-listing', url: listing });
    else if (reference) byItem.set(item.id, { lane: 'official-reference', url: reference.url, attribution: reference.attribution });
  }
  return { byItem, rowsLookedUp: rows.length };
}
