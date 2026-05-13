/**
 * TCGplayer raw response shapes.
 *
 * Mirrors the documented developer API. Every field we read is declared;
 * fields we don't read are omitted to keep the type surface small.
 *
 * Reference: https://docs.tcgplayer.com/reference
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN).
 */

// ── OAuth ───────────────────────────────────────────────────────────────

export interface TcgplayerTokenResponse {
  /** "Bearer". */
  token_type?: string;
  access_token: string;
  /** TTL in seconds — typically ~1209600 (14 days). */
  expires_in: number;
  /** Optional scope info. */
  scope?: string;
}

// ── Catalog ─────────────────────────────────────────────────────────────

export interface TcgplayerCategory {
  categoryId: number;
  name: string;
  displayName?: string;
  modifiedOn?: string;
  isScannable?: boolean;
  popularity?: number;
}

export interface TcgplayerGroup {
  groupId: number;
  /** Group abbreviation, e.g. "OP-04". */
  abbreviation?: string;
  /** Full set name. */
  name: string;
  isSupplemental?: boolean;
  publishedOn?: string;
  modifiedOn?: string;
  categoryId: number;
}

export interface TcgplayerExtendedData {
  /** Field name, e.g. "Number" | "Rarity" | "Card Type" | "Color" | "Power" | "Cost". */
  name: string;
  /** The display value. For "Number", a string like "OP01-001" or "5/102". */
  displayName?: string;
  /** Machine value (may be numeric for numeric fields). */
  value: string;
}

export interface TcgplayerProduct {
  productId: number;
  name: string;
  cleanName?: string;
  imageUrl?: string;
  categoryId: number;
  groupId: number;
  url?: string;
  modifiedOn?: string;
  imageCount?: number;
  /** Per-printing fields; contains "Number", "Rarity", etc. Heavily-used
   *  by the normalizer to extract a collector_number. */
  extendedData?: TcgplayerExtendedData[];
}

/**
 * A leaf SKU on TCGplayer — `(productId × subType × condition × language × printing)`.
 * Returned by `/catalog/products/{productId}/skus` and `/pricing/sku/{ids}`.
 */
export interface TcgplayerSku {
  skuId: number;
  productId: number;
  /** Foreign key into TCGplayer's languages table. */
  languageId: number;
  /** Foreign key into TCGplayer's printings table. */
  printingId: number;
  /** Foreign key into TCGplayer's conditions table. */
  conditionId: number;
}

/** Expanded sku with the joined human-readable fields the reader fills in
 *  from the catalog `/catalog/conditions`, `/catalog/printings`, `/catalog/languages`
 *  reference lists. */
export interface TcgplayerSkuExpanded extends TcgplayerSku {
  /** "Near Mint" | "Lightly Played" | ... — joined from /catalog/conditions. */
  condition: string;
  /** "English" | "Japanese" | ... — joined from /catalog/languages. */
  languageName: string;
  /** "Normal" | "Foil" | ... — joined from /catalog/printings. */
  printingName: string;
}

// ── Pricing ─────────────────────────────────────────────────────────────

/**
 * Pricing returned per (productId, subTypeName) by `/pricing/product/{ids}`.
 * Each field is independently nullable when TCGplayer has no listings of
 * that tier.
 */
export interface TcgplayerProductPricing {
  productId: number;
  /** "Normal" | "Foil" | "Reverse Holofoil" | "1st Edition" | "1st Edition Holofoil". */
  subTypeName: string;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  /** TCGplayer's algorithmic "Market Price" — the public headline number. */
  marketPrice: number | null;
  /** TCGplayer Direct (in-house seller) lowest. Often null outside MTG/Pokémon. */
  directLowPrice: number | null;
}

/**
 * Pricing returned per skuId by `/pricing/sku/{ids}`. Same fields as
 * productPricing but condition-discriminated.
 */
export interface TcgplayerSkuPricing {
  skuId: number;
  productConditionId?: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  /** Optional ISO 8601 — when present, used for our `@as_of` per row. */
  updatedAt?: string;
}

// ── List-response envelopes ─────────────────────────────────────────────

export interface TcgplayerListResponse<T> {
  totalItems: number;
  success: boolean;
  errors: string[];
  results: T[];
}

// ── The reader's raw row shape ──────────────────────────────────────────

/**
 * Catalog-mode raw row — one per (product, sub_type) discovered.
 *
 * Carries the joined sku list inline so the normalizer can emit a single
 * `CanonicalMapping` per row with the leaf-id fan-out attached.
 */
export interface TcgplayerCatalogRaw {
  kind: "catalog";
  product: TcgplayerProduct;
  /** All skus for this productId, joined with condition/printing/language names. */
  skus: TcgplayerSkuExpanded[];
  group: TcgplayerGroup;
  category: TcgplayerCategory;
}

/**
 * Pricing-mode raw row — one per (productId × subType × condition × language)
 * — i.e. one per skuId returned by /pricing/sku.
 *
 * `card_id` is the writer's hint (resolved from `cards.tcgplayer_product_id`
 * + `tcgplayer_sub_type` lookup at read time when the watchlist was built).
 * The writer cross-checks this against the live mapping.
 */
export interface TcgplayerPricingRaw {
  kind: "pricing";
  sku: TcgplayerSkuExpanded;
  pricing: TcgplayerSkuPricing;
  /** From cards.tcgplayer_product_id (the reader's watchlist build). */
  product_id: number;
  /** From cards.id (the reader's watchlist build). */
  card_id: number;
  /** From cards.sku — the reader passes this through so the writer doesn't
   *  need a second lookup. */
  card_sku: string;
}

/** The union the source module emits. */
export type TcgplayerRaw = TcgplayerCatalogRaw | TcgplayerPricingRaw;
