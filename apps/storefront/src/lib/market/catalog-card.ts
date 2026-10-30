/**
 * Server-side card identity resolver — the local catalogue read that lets
 * /market/[sku] render a real card (name, set, number, image) in SSR
 * instead of a nameless SKU.
 *
 * The interactive card page is a client component: its SSR HTML carried
 * zero card data, so crawlers, link previews, text-mode and no-JS readers
 * saw a blank main, and the <title> was the generic site title on every
 * card. This resolver reads the storefront-local `card_set_cards` catalog
 * (one query, joined to `card_sets` for the set name) so the page can
 * server-render identity + a real <title> before any client fetch runs.
 *
 * Reference PRICE is deliberately NOT here: it lives in the wholesale
 * substrate (the same one the /market table reads), resolved by
 * `resolveReferencePrice` so the two surfaces agree. Identity is local and
 * always available; price is enrichment and may be unavailable.
 *
 * The resolver also handles card-number-shaped URLs: /market/OP01-003 is a
 * card_number, not a SKU — it resolves to the canonical SKU so the page
 * can redirect, instead of rendering an empty main at a URL the site's own
 * copy teaches users to type.
 */

import { cache } from "react";
import { query } from "@/lib/db";
import {
  extractIllustArtist,
  slugifyHand,
  stripIllustAnnotation,
} from "@/lib/cards/illust-annotation";
import {
  getEnCardData,
  type EnCardText,
  type CardAttributes,
} from "@/lib/cards/en-card-data";
import type { ImageReference } from "@/lib/cards/image-reference";
import type { SameLanguageImageReference } from "@/lib/cards/same-language-image-reference";
import { catalogImageUrl } from "@/lib/cards/image-publication";

export interface CatalogIdentity {
  sku: string;
  card_number: string;
  card_name: string;
  set_code: string;
  set_name: string | null;
  rarity: string | null;
  // Published official art takes priority and carries attribution and its
  // reference relationship together: a Japanese request's own-language image
  // first (Yu, 2026-10-30), then the English base reference. The retained
  // catalogue fallback has no verified source/printing claim; its metadata
  // fields stay null.
  image_url: string | null;
  image_attribution: string | null;
  /** The English base reference, when the image is the English one. */
  image_reference: ImageReference | null;
  /** The official image's language, or null for the catalogue fallback (unknown). */
  image_language: "en" | "ja" | null;
  /** The same-language reference, when the image is the Japanese one. */
  image_same_language_reference: SameLanguageImageReference | null;
  // Official English effect text + structured game facts (same getEnCardData
  // result as the image). `effect_text` carries its own copyright line in
  // `attribution` (render co-located); `attributes` are non-copyrightable
  // facts. Both null when unpublished — render only what is present.
  effect_text: EnCardText | null;
  attributes: CardAttributes | null;
  // Illustrator credit when THIS printing's catalogue title carries the
  // `illust:` annotation (the printed card-face credit, mirrored). Per-print:
  // a base printing stays uncredited even when its parallel is credited.
  artist: string | null;
  // Slug into /artists/[slug] — precomputed server-side so the client
  // component links without importing server-only card libs.
  artist_slug: string | null;
}

export type IdentityResolution =
  | { kind: "ok"; card: CatalogIdentity }
  // The URL was a card_number (or a differently-cased SKU); redirect to
  // the canonical SKU so every card has one address.
  | { kind: "redirect"; sku: string }
  // No catalogue row for this SKU or card_number.
  | { kind: "notfound" };

const SELECT_IDENTITY = `
  SELECT csc.sku, csc.card_number, csc.card_name, csc.set_code,
         cs.set_name, csc.rarity, csc.image_url
    FROM card_set_cards csc
    LEFT JOIN card_sets cs ON cs.set_code = csc.set_code`;

function rowToIdentity(row: {
  sku: string;
  card_number: string;
  card_name: string;
  set_code: string;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
}): CatalogIdentity {
  // Read the illustrator credit out of the product title and clean the
  // display name — "Ace (illust:otton)" renders as "Ace" + a credit line,
  // not as an annotation leaking into the H1. One shared grammar with the
  // artist wing and the SQL extractors (src/lib/cards/illust-annotation.ts).
  const artist = extractIllustArtist(row.card_name);
  const cleanName = stripIllustAnnotation(row.card_name);
  return {
    sku: row.sku,
    card_number: row.card_number,
    card_name: cleanName,
    set_code: row.set_code,
    set_name: row.set_name ?? null,
    rarity: row.rarity ?? null,
    // The catalogue photo is the FALLBACK image (self-hosted on jp-op-photos).
    // _resolveCardIdentity overrides it with the official publisher image when
    // one is published (and only then sets image_attribution).
    image_url: catalogImageUrl(row.image_url),
    image_attribution: null,
    image_reference: null,
    image_language: null,
    image_same_language_reference: null,
    // Same story: effect text + facts are attached from the SAME
    // getEnCardData result in _resolveCardIdentity, not the catalogue row.
    effect_text: null,
    attributes: null,
    artist,
    artist_slug: artist ? slugifyHand(artist) : null,
  };
}

/**
 * Resolve a /market/[sku] path segment to a catalogue card.
 *
 * The segment may be a SKU (`OP-OP01-003-JP`) or a card_number
 * (`OP01-003`). SKUs resolve directly; card_numbers resolve to their
 * canonical SKU and return a redirect. Anything unknown is notfound().
 */
export const resolveCardIdentity = cache(_resolveCardIdentity);

async function _resolveCardIdentity(
  skuOrNumber: string,
): Promise<IdentityResolution> {
  const raw = (skuOrNumber || "").trim();
  if (!raw) return { kind: "notfound" };

  // Exact SKU match first (the canonical address).
  const bySku = await query(
    `${SELECT_IDENTITY} WHERE csc.sku = $1 LIMIT 1`,
    [raw],
  );
  if (bySku.rows[0]) {
    const card = rowToIdentity(bySku.rows[0]);
    // Publish the reference URL, copyright and relationship as one unit.
    // An incomplete official candidate leaves the catalogue fallback intact;
    // it does not confer a source, printing or rights claim on that fallback.
    const en = await getEnCardData(card.sku);
    const sameLanguage = en.same_language_image;
    if (sameLanguage?.url && sameLanguage.attribution && sameLanguage.reference) {
      card.image_url = sameLanguage.url;
      card.image_attribution = sameLanguage.attribution;
      card.image_language = "ja";
      card.image_same_language_reference = sameLanguage.reference;
    } else if (en.en_image?.url && en.en_image.attribution && en.en_image.reference) {
      card.image_url = en.en_image.url;
      card.image_attribution = en.en_image.attribution;
      card.image_reference = en.en_image.reference;
      card.image_language = "en";
    }
    // Effect text + game facts ride in from the SAME result (no second
    // fetch). Each stays null when unpublished; the effect text carries its
    // own copyright line for co-located rendering.
    card.effect_text = en.effect_text;
    card.attributes = en.attributes;
    return { kind: "ok", card };
  }

  // Card-number-shaped URL (case-insensitive) → canonical SKU. Order by
  // the base variant first so the plain printing wins over parallels.
  const byNumber = await query(
    `${SELECT_IDENTITY} WHERE UPPER(csc.card_number) = UPPER($1)
      ORDER BY csc.variant ASC LIMIT 1`,
    [raw],
  );
  const numberRow = byNumber.rows[0];
  if (numberRow) return { kind: "redirect", sku: numberRow.sku };

  return { kind: "notfound" };
}

/** Bare identity lookup used by generateMetadata (no redirect semantics). */
export async function getCardIdentity(
  sku: string,
): Promise<CatalogIdentity | null> {
  const r = await resolveCardIdentity(sku);
  return r.kind === "ok" ? r.card : null;
}
