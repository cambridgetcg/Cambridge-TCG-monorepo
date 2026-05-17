/**
 * TCGCollector product normalization — Schema.org Product/Offer JSON-LD
 * to a typed `TcgCollectorProduct` shape the wholesale runner can ingest.
 *
 * Pure function: takes parsed JSON-LD objects, returns a typed shape +
 * substrate-honest error_reason on failure. No fetch, no DB.
 *
 * Schema.org Product fields we extract:
 *   - name             → display name
 *   - image            → first image URL (string or array)
 *   - sku              → upstream SKU (often empty on TCGC)
 *   - brand.name       → game (informational; not load-bearing)
 *   - offers           → AggregateOffer / Offer with price + currency
 *
 * What we deliberately *don't* extract (substrate-honesty):
 *   - description (verbose, not load-bearing for price ingest)
 *   - aggregateRating (TCGC publishes these but we don't aggregate ratings)
 *   - review (not our shape)
 *
 * Per-row produces a `TcgCollectorProduct` with `error_reason: null` on
 * success, or with `error_reason: <specific failure>` and `price: null`
 * on partial failure. The runner decides whether to write to
 * price_archive (success), ingest_quarantine (partial), or skip (no-op).
 */

import type { JsonLdObject } from "./jsonld";
import { filterProducts, filterOffers, typeIncludes } from "./jsonld";

/**
 * Normalized TCGCollector product row. The shape the wholesale ingest
 * runner consumes; one row per source URL.
 */
export interface TcgCollectorProduct {
  /** The TCGCollector URL this row was scraped from. */
  source_url: string;
  /** Display name from Schema.org `name`. Null when missing — substrate-
   *  honest about the page not declaring one. */
  name: string | null;
  /** First image URL from Schema.org `image`. Null when missing. */
  image_url: string | null;
  /** Upstream SKU from Schema.org `sku`. Null when missing — TCGC often
   *  doesn't populate this; the source_url is the de-facto id. */
  upstream_sku: string | null;
  /** Brand/game name from `brand.name`. Informational; not load-bearing. */
  brand: string | null;
  /** Price in the source currency. Null when no offer found or price
   *  unparseable. Cents granularity preserved (e.g. 12.99). */
  price: number | null;
  /** ISO-4217 currency code from the offer. Null when no offer found. */
  currency: string | null;
  /** Offer availability from Schema.org enum (`InStock`, `OutOfStock`, etc.).
   *  Null when no offer or no availability field. */
  availability: string | null;
  /** Substrate-honest about what went wrong. Null on success. */
  error_reason: string | null;
}

/**
 * Build a normalized product row from JSON-LD objects extracted from
 * the page. Looks for a `Product` object first; if found, reads price
 * from its `offers` block (or from a sibling `Offer` / `AggregateOffer`
 * object on the same page).
 *
 * Substrate-honest: every field is independently typed; one missing
 * field yields null for that field, not failure for the whole row.
 * `error_reason` is set only when no Product is found at all OR the
 * Product is found but no price is extractable.
 */
export function normalizeProduct(
  source_url: string,
  jsonld: readonly JsonLdObject[],
): TcgCollectorProduct {
  const products = filterProducts(jsonld);
  if (products.length === 0) {
    return {
      source_url,
      name: null,
      image_url: null,
      upstream_sku: null,
      brand: null,
      price: null,
      currency: null,
      availability: null,
      error_reason: "no_jsonld_product_found",
    };
  }

  // If the page has multiple Products (rare; TCGC normally one-per-page),
  // take the first. The page-shape contract: one canonical product per
  // page; multiples are a doc-error worth surfacing later.
  const product = products[0];

  const name = readString(product.name);
  const image_url = readFirstImage(product.image);
  const upstream_sku = readString(product.sku);
  const brand = readBrandName(product.brand);

  // The offer can live inside Product.offers (nested) or as a sibling
  // top-level Offer/AggregateOffer object. We try nested first, fall
  // back to sibling.
  const offer = pickOffer(product) ?? pickSiblingOffer(jsonld);
  const { price, currency, availability } = readOffer(offer);

  const error_reason =
    price === null && currency === null
      ? "no_offer_or_unparseable_price"
      : null;

  return {
    source_url,
    name,
    image_url,
    upstream_sku,
    brand,
    price,
    currency,
    availability,
    error_reason,
  };
}

// ── Field-level readers ─────────────────────────────────────────────────

function readString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function readFirstImage(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  // Schema.org allows ImageObject — `{"@type":"ImageObject","url":"…"}`
  if (Array.isArray(v) && v.length > 0 && isPlainObject(v[0])) {
    const url = (v[0] as Record<string, unknown>).url;
    return typeof url === "string" ? url : null;
  }
  if (isPlainObject(v)) {
    const url = (v as Record<string, unknown>).url;
    return typeof url === "string" ? url : null;
  }
  return null;
}

function readBrandName(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (isPlainObject(v)) {
    const name = (v as Record<string, unknown>).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

function pickOffer(product: JsonLdObject): JsonLdObject | null {
  const offers = product.offers;
  if (!offers) return null;
  if (Array.isArray(offers) && offers.length > 0 && isPlainObject(offers[0])) {
    return offers[0] as JsonLdObject;
  }
  if (isPlainObject(offers)) return offers as JsonLdObject;
  return null;
}

function pickSiblingOffer(jsonld: readonly JsonLdObject[]): JsonLdObject | null {
  const offers = filterOffers(jsonld);
  return offers.length > 0 ? offers[0] : null;
}

interface ReadOfferResult {
  price: number | null;
  currency: string | null;
  availability: string | null;
}

function readOffer(offer: JsonLdObject | null): ReadOfferResult {
  if (!offer) return { price: null, currency: null, availability: null };

  // AggregateOffer uses lowPrice; Offer uses price. Both may be string
  // or number. Substrate-honest: parse as float; null on NaN.
  const priceRaw = typeIncludes(offer, "AggregateOffer")
    ? offer.lowPrice ?? offer.price
    : offer.price ?? offer.lowPrice;
  const price = readNumber(priceRaw);

  const currency = readString(offer.priceCurrency);
  const availability = readString(offer.availability);

  return { price, currency, availability };
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
