/**
 * Pure logic for the /market/list wizard: the draft that survives the
 * login round-trip, listing validation, and price guidance derived from
 * the catalog row the seller already fetched.
 *
 * Draft persistence uses localStorage (per-browser, matching the cart /
 * trade-in / deck-builder convention): the magic-link sign-in opens in a
 * NEW tab of the same browser, so a per-tab store would lose the draft.
 * The parse side is defensive — a corrupt or foreign value must never
 * crash the wizard, only fall back to a fresh start.
 */

import type { CatalogCard, CatalogSource } from "./catalog";

export const LISTING_DRAFT_KEY = "market.listing-draft.v1";

export const CONDITIONS = [
  { value: "NM", label: "Near Mint (NM)" },
  { value: "LP", label: "Lightly Played (LP)" },
  { value: "MP", label: "Moderately Played (MP)" },
  { value: "HP", label: "Heavily Played (HP)" },
] as const;

export type Condition = (typeof CONDITIONS)[number]["value"];

/** Choices offered for the per-listing return window. 14 matches the
 *  platform default (`market_trades.return_window_days DEFAULT 14`,
 *  migration 0070) — the value is sent with the listing, never assumed. */
export const RETURN_WINDOW_CHOICES = [7, 14, 30] as const;
export const DEFAULT_RETURN_WINDOW_DAYS = 14;

/** The catalog row snapshot a draft carries — enough to re-render the
 *  confirm panel and guidance without refetching. */
export interface DraftCard {
  sku: string;
  name: string;
  card_number: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
  best_ask: number | null;
  best_bid: number | null;
  /** Which substrate priced this row when it was picked. */
  source: CatalogSource;
}

export interface ListingDraft {
  v: 1;
  game: string;
  card: DraftCard;
  condition: Condition;
  price: string; // raw input text, revalidated on restore
  quantity: string; // raw input text
  acceptsReturns: boolean;
  returnWindowDays: number;
  savedAt: string;
}

export function draftCardFromCatalog(card: CatalogCard, source: CatalogSource): DraftCard {
  return {
    sku: card.sku,
    name: card.name,
    card_number: card.card_number,
    set_code: card.set_code,
    set_name: card.set_name,
    rarity: card.rarity,
    image_url: card.image_url,
    // 0 = no first-party reference yet (the draft's price hints treat >0 only).
    spot_price: card.spot_price ?? 0,
    best_ask: card.best_ask,
    best_bid: card.best_bid,
    source,
  };
}

export function serializeListingDraft(draft: ListingDraft): string {
  return JSON.stringify(draft);
}

function isCondition(v: unknown): v is Condition {
  return CONDITIONS.some((c) => c.value === v);
}

/** Defensive parse: returns null for anything that isn't a well-formed
 *  v1 draft with a usable card. */
export function parseListingDraft(raw: string | null | undefined): ListingDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const d = parsed as Record<string, unknown>;
  if (d.v !== 1) return null;
  if (typeof d.game !== "string" || !d.game) return null;
  if (!isCondition(d.condition)) return null;
  if (typeof d.price !== "string" || typeof d.quantity !== "string") return null;
  if (typeof d.acceptsReturns !== "boolean") return null;
  if (typeof d.returnWindowDays !== "number" || !Number.isFinite(d.returnWindowDays)) return null;
  const card = d.card as Record<string, unknown> | null | undefined;
  if (!card || typeof card !== "object") return null;
  if (typeof card.sku !== "string" || !card.sku) return null;
  if (typeof card.name !== "string" || !card.name) return null;
  return {
    v: 1,
    game: d.game,
    card: {
      sku: card.sku,
      name: card.name,
      card_number: typeof card.card_number === "string" ? card.card_number : "",
      set_code: typeof card.set_code === "string" ? card.set_code : "",
      set_name: typeof card.set_name === "string" ? card.set_name : "",
      rarity: typeof card.rarity === "string" ? card.rarity : null,
      image_url: typeof card.image_url === "string" ? card.image_url : null,
      spot_price: typeof card.spot_price === "number" ? card.spot_price : 0,
      best_ask: typeof card.best_ask === "number" ? card.best_ask : null,
      best_bid: typeof card.best_bid === "number" ? card.best_bid : null,
      source: card.source === "wholesale-api" || card.source === "wholesale-db"
        ? card.source
        : "unavailable",
    },
    condition: d.condition,
    price: d.price,
    quantity: d.quantity,
    acceptsReturns: d.acceptsReturns,
    returnWindowDays: d.returnWindowDays,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : new Date(0).toISOString(),
  };
}

// ── Validation ──────────────────────────────────────────────────────────

export interface ListingErrors {
  price?: string;
  quantity?: string;
}

export const MAX_LISTING_QUANTITY = 999;

export function validateListing(price: string, quantity: string): ListingErrors {
  const errors: ListingErrors = {};
  const p = Number.parseFloat(price);
  if (price.trim() === "" || !Number.isFinite(p)) {
    errors.price = "Enter a price.";
  } else if (p <= 0) {
    errors.price = "Price must be above zero.";
  } else if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) {
    // Epsilon, not exact equality: most 2-dp prices (19.99, 4.10, …) are
    // not exactly representable in binary floating point, so p*100 lands
    // a hair off its integer. Sub-penny inputs (1.999) sit ~0.1 away and
    // are still rejected.
    errors.price = "Price can have at most two decimal places.";
  }
  const q = Number(quantity);
  if (quantity.trim() === "" || !Number.isInteger(q)) {
    errors.quantity = "Quantity must be a whole number.";
  } else if (q < 1) {
    errors.quantity = "Quantity must be at least 1.";
  } else if (q > MAX_LISTING_QUANTITY) {
    errors.quantity = `Quantity can be at most ${MAX_LISTING_QUANTITY}.`;
  }
  return errors;
}

// ── Price guidance ──────────────────────────────────────────────────────

export type PriceHint =
  | { kind: "meets_bid"; bid: number }
  | { kind: "undercuts_best_ask"; ask: number }
  | { kind: "at_or_above_best_ask"; ask: number }
  | { kind: "first_ask" }
  | { kind: "above_spot"; spot: number };

/**
 * Hints for the price input, derived only from the catalog row the
 * seller already has. Ordered by how actionable they are; the UI renders
 * them in order. No hint is a promise — matching happens server-side at
 * post time against the book as it exists then.
 */
export function priceGuidance(
  price: number,
  card: Pick<DraftCard, "best_ask" | "best_bid" | "spot_price">,
): PriceHint[] {
  if (!Number.isFinite(price) || price <= 0) return [];
  const hints: PriceHint[] = [];
  if (card.best_bid != null && price <= card.best_bid) {
    hints.push({ kind: "meets_bid", bid: card.best_bid });
  }
  if (card.best_ask != null) {
    if (price < card.best_ask) {
      hints.push({ kind: "undercuts_best_ask", ask: card.best_ask });
    } else {
      hints.push({ kind: "at_or_above_best_ask", ask: card.best_ask });
    }
  } else {
    hints.push({ kind: "first_ask" });
  }
  if (card.spot_price > 0 && price > card.spot_price) {
    hints.push({ kind: "above_spot", spot: card.spot_price });
  }
  return hints;
}
