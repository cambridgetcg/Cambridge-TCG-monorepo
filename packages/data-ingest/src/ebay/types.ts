/**
 * eBay Browse + (future) Marketplace Insights API raw types.
 *
 * We carry the *minimum* fields we need from each surface — eBay's
 * responses are large + chatty. The full schema is in eBay's
 * developer docs; this module is the type-level subset we depend on.
 *
 *   Browse API:
 *     https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
 *   Marketplace Insights API (Limited Release):
 *     https://developer.ebay.com/api-docs/buy/marketplace-insights/resources/item_sales/methods/search
 */

// ── Marketplace identifiers ─────────────────────────────────────────────

/** eBay marketplace identifiers used in the `X-EBAY-C-MARKETPLACE-ID` header. */
export type EbayMarketplaceId =
  | "EBAY_GB"
  | "EBAY_US"
  | "EBAY_DE"
  | "EBAY_FR"
  | "EBAY_IT"
  | "EBAY_ES"
  | "EBAY_JP"
  | "EBAY_AU"
  | "EBAY_CA";

// ── Browse API: itemSummary subset ──────────────────────────────────────

export interface EbayPrice {
  value: string;          // numeric as string per eBay (avoid float drift)
  currency: string;       // ISO 4217
}

export interface EbayCategory {
  categoryId: string;
  categoryName: string;
}

export interface EbayBidCount {
  bidCount?: number;
  /** Auction end time when known. */
  bidEndTime?: string;
}

/** One result of a Browse API `item_summary/search` call. */
export interface EbayItemSummary {
  itemId: string;
  legacyItemId?: string;
  title: string;
  /** Web URL the buyer would land on. */
  itemWebUrl?: string;
  /** API URL for further detail. */
  itemHref?: string;
  /** Listing image URL. */
  image?: { imageUrl: string };
  thumbnailImages?: Array<{ imageUrl: string }>;
  /** Current price (BIN or current bid). */
  price?: EbayPrice;
  /** Shipping cost block. */
  shippingOptions?: Array<{
    shippingCost?: EbayPrice;
    shippingCostType?: string;
  }>;
  /** eBay's mapped category. */
  categories?: EbayCategory[];
  /** Sale type. eBay returns `FIXED_PRICE` | `AUCTION` | `AUCTION_WITH_BIN`. */
  buyingOptions?: string[];
  /** Auction state. */
  bidCount?: number;
  currentBidPrice?: EbayPrice;
  bidsCount?: number;
  bidEndTime?: string;
  /** Item condition. */
  condition?: string;
  conditionId?: string;
  /** Seller. */
  seller?: {
    username?: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  /** Best-Offer enabled? */
  bestOfferEnabled?: boolean;
  /** ISO 8601 listing end time. */
  itemEndDate?: string;
  /** Item location. */
  itemLocation?: {
    country?: string;
    postalCode?: string;
  };
  /** Marketplace this listing is on. */
  listingMarketplaceId?: EbayMarketplaceId;
  // — many more eBay fields exist; we don't depend on them.
}

export interface EbayPaginatedResponse<T> {
  total?: number;
  limit?: number;
  offset?: number;
  href?: string;
  next?: string;
  prev?: string;
  itemSummaries?: T[];
  /** Marketplace Insights uses `itemSales` instead. */
  itemSales?: T[];
  /** Browse API warnings (e.g. category not found). */
  warnings?: Array<{ errorId?: number; category?: string; message?: string }>;
}

// ── Marketplace Insights API: itemSales subset ──────────────────────────
//
// Deferred: this module ships the type for future Marketplace Insights
// integration. v0 cron pulls Browse only. See `the-ebay-alignment.md`
// for the partner-application gating.

/** One result of a Marketplace Insights `item_sales/search` call. */
export interface EbayItemSale {
  itemId: string;
  legacyItemId?: string;
  title: string;
  itemWebUrl?: string;
  itemHref?: string;
  image?: { imageUrl: string };
  /** The amount the item ACTUALLY SOLD FOR. The whole point of MI API. */
  lastSoldPrice?: EbayPrice;
  /** When the sale happened. */
  lastSoldDate?: string;
  /** Total quantity sold across the listing's lifetime (for multi-quantity). */
  totalSoldQuantity?: number;
  /** Sale type. */
  buyingOptions?: string[];
  /** Condition at sale. */
  condition?: string;
  conditionId?: string;
  /** Categories. */
  categories?: EbayCategory[];
  /** Listing location at sale time. */
  itemLocation?: { country?: string; postalCode?: string };
  listingMarketplaceId?: EbayMarketplaceId;
}

// ── Our internal "raw row" envelope ────────────────────────────────────
//
// Both Browse and Marketplace Insights items get wrapped in this discriminated
// envelope before being yielded from `read()`. Downstream the normalizer
// branches on `api_surface`.

export interface EbayBrowseRaw {
  api_surface: "browse";
  marketplace_id: EbayMarketplaceId;
  /** The eBay listing as returned by the API. */
  item: EbayItemSummary;
  /** Our query (so the operator can audit which watch-list entry produced this row). */
  query: string;
  /** The SKU we asked the watch list for. The normalizer cross-checks
   *  that the parsed title resolves to this SKU; mismatch → quarantine. */
  expected_sku: string;
  /** When we fetched. */
  fetched_at: string;
}

export interface EbayInsightsRaw {
  api_surface: "marketplace-insights";
  marketplace_id: EbayMarketplaceId;
  item: EbayItemSale;
  query: string;
  expected_sku: string;
  fetched_at: string;
}

/** Discriminated union of the two raw shapes. */
export type EbayRaw = EbayBrowseRaw | EbayInsightsRaw;
