import 'server-only';
import { skuIdentity, type SkuIdentity } from '@cambridge-tcg/sku';
import { query as dbQuery } from '@/lib/db';
import { cardRushListingImageUrl } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { getOfficialCardImages, type OfficialImageChoice } from '@/lib/cards/en-card-data';
import type { ImageReference } from '@/lib/cards/image-reference';
import { DISPLAY_ONLY_INPUT_PAGE_LIMIT, type MemberPriceItem } from './member-feed-types';

/** How the official image relates to its row. The image is the publisher's
 * base print in the row's own language when one is published (Japanese,
 * since Yu's decision of 2026-10-30), else the English base print; the
 * projectors refuse any other row (image-publication.ts), and the reference
 * names the SKU it depicts. Relationships are measured against the image's
 * language:
 * - same-printing: a printing-level row in the image's language with no
 *   variant, so the depicted SKU is the row's own.
 * - same-language-base-print: a printing-level row in the image's language
 *   with a variant (a parallel or reprint), so the art may differ.
 * - other-language: a printing-level row in another language.
 * - pooled-row: a source-product aggregate (a Cardmarket row), whose price
 *   may pool printings and languages. Its SKU names the card, not a printing
 *   or language of the row's ("A product-level aggregate must NOT inherit a
 *   printing's language/condition", data-ingest member-prices.ts).
 * All four are matched by SKU syntax; none verifies the physical card. */
export type MemberOfficialImageRelationship = 'same-printing' | 'same-language-base-print' | 'other-language' | 'pooled-row';

/** The official image beside a row, and how it relates to the row. */
export type MemberOfficialImage = {
  url: string;
  attribution: string;
  imageLang: 'en' | 'ja';
  /** The canonical SKU the image depicts, from the projector's reference. */
  depictedSku: string;
  /** The reference's own scope, 'syntax_only': the SKUs match as text, and
   * nothing checked the card. */
  scope: ImageReference['scope'];
} & (
  /** A printing-level row: its language and variant are its exact SKU's. */
  | { relationship: Exclude<MemberOfficialImageRelationship, 'pooled-row'>; rowLang: string; rowVariant: string | null }
  /** An aggregate: no one printing, and only the language its source gave (none, for Cardmarket). */
  | { relationship: 'pooled-row'; rowLang: string | null; rowVariant: null }
);

/** Identity images beside /prices rows, so a person or an agent reading the
 * page can check the item against its price (Yu, 2026-10-29). Display only,
 * in two lanes, and a row may have both:
 * - A row with an exact SKU shows its official image through the shared
 *   readers and projectors (en-card-data.ts), from Cambridge's own image host:
 *   the same-language base print when one is published (a Japanese row's
 *   Japanese image), else the English base reference, labelled with how its
 *   language and printing relate to the row's (Yu, 2026-10-30: "sort out the
 *   languages and corresponding images").
 * - A CardRush row offers the listing's own image at CardRush's own URL,
 *   credited and linked to the listing (price_source_listing_images, 0145).
 *   Cambridge never copies, mirrors, re-hosts, proxies or caches it, and the
 *   member's browser asks CardRush for it only when the member opens it
 *   (member-source-browser.tsx), so viewing /prices tells CardRush nothing.
 *   That is the agents' reading of Yu's words, in the decision record, and
 *   CARDRUSH_LISTING_IMAGES=off turns the lane off.
 * A row with neither shows none. Nothing in the member API, the downloads or
 * /api/v1/market/* reads this: the item projection (member-feed.ts) is
 * unchanged.
 */
export interface MemberPriceImage {
  official?: MemberOfficialImage;
  /** The CardRush listing's own image, so its language and printing are the
   * listing's: `lang` is the row's language, or null when unknown. */
  listing?: { url: string; lang: string | null; relationship: 'same-listing' };
}
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

async function officialImages(skus: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<Map<string, OfficialImageChoice>> {
  if (!skus.length) return new Map();
  try {
    return await getOfficialCardImages(skus, env);
  } catch (error) {
    console.error('[member-prices] official images unavailable', error instanceof Error ? error.name : 'unknown');
    return new Map();
  }
}

function officialImage(image: OfficialImageChoice, printing: SkuIdentity | null, language: string | null): MemberOfficialImage {
  const shown = { url: image.url, attribution: image.attribution, imageLang: image.language, depictedSku: image.reference.depicted_canonical_sku, scope: image.reference.scope };
  if (!printing) return { ...shown, relationship: 'pooled-row', rowLang: language, rowVariant: null };
  const relationship = printing.lang !== image.language ? 'other-language' : printing.variant ? 'same-language-base-print' : 'same-printing';
  return { ...shown, relationship, rowLang: printing.lang, rowVariant: printing.variant };
}

/** One bounded lookup per lane, by (source, source product) and by SKU, for
 * the page's first MEMBER_PRICE_IMAGE_ROWS rows. Never throws: a store that
 * cannot answer, or lacks 0145, shows no images. */
export async function readMemberPriceImages(items: readonly MemberPriceItem[], env: Readonly<Record<string, string | undefined>> = process.env): Promise<MemberPriceImages> {
  const rows = items.slice(0, MEMBER_PRICE_IMAGE_ROWS);
  const exactSku = (item: MemberPriceItem) => item.mappingStatus === 'exact' && item.sku ? item.sku : null;
  const listings = cardRushListingImagesOn(env) ? [...new Set(rows.filter(item => item.source === 'cardrush').map(item => item.sourceProductId))] : [];
  const skus = [...new Set(rows.map(exactSku).filter((sku): sku is string => sku !== null))];
  const [linked, official] = await Promise.all([listingImages(listings), officialImages(skus, env)]);
  const byItem = new Map<string, MemberPriceImage>();
  for (const item of rows) {
    const listing = item.source === 'cardrush' ? linked.get(item.sourceProductId) : undefined;
    const sku = exactSku(item);
    const identity = sku ? skuIdentity(sku) : null;
    const reference = sku && identity ? official.get(sku) : undefined;
    if (!listing && !reference) continue;
    // The row's language: a printing-level row's exact SKU's, else the
    // observation's own. An aggregate's SKU names the card, not the row's
    // printing or language, so it keeps its own (unknown, for Cardmarket).
    const printing = identity && item.granularity === 'printing' ? identity : null;
    const lang = printing ? printing.lang : item.language;
    byItem.set(item.id, {
      ...(reference ? { official: officialImage(reference, printing, item.language) } : {}),
      ...(listing ? { listing: { url: listing, lang, relationship: 'same-listing' as const } } : {}),
    });
  }
  return { byItem, rowsLookedUp: rows.length };
}
