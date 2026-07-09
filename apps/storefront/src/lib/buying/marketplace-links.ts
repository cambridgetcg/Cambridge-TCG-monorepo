/**
 * @module @/lib/buying/marketplace-links
 *
 * Pure, dependency-free URL builders for the "find this card elsewhere"
 * links. Given a card's own fields (name + card number) and its game, we
 * hand the reader a ready-made link out to each external channel:
 * CardRush (Japan), Cardmarket (Europe), eBay UK.
 *
 * Substrate honesty — these are SEARCH links, never exact-product links.
 * The storefront card object (PriceItem) carries no external marketplace
 * product IDs (no cardrush_url, no cardmarket product id, no ebay item
 * number), so the honest thing we can build from name + number is a
 * pre-filled search on the other site. Every link is therefore labelled
 * `kind: "search"`. If a stored exact-product URL is ever surfaced onto
 * the card object, add a `kind: "exact"` builder beside these and prefer
 * it — but don't claim "exact" for a link we didn't actually resolve.
 *
 * The house sells nothing (docs/decisions/2026-07-06-collectors-first.md).
 * These links route the reader OUT to where a card actually sells; the
 * guide at /guides/buying explains each channel's cost, wait and fees.
 */

import { getPriceGuideConfig } from "@/lib/prices/games-config";
import { gameFromSku, type SkuGameSlug } from "@/lib/games/sku-game";

export type ExternalLinkKind = "search" | "exact";

export interface ExternalMarketLink {
  /** Which marketplace this points at. */
  channel: "CardRush" | "Cardmarket" | "eBay UK";
  /** Button text shown to the reader. */
  label: string;
  /** The outbound URL. */
  href: string;
  /** Honest badge: a pre-filled search, or a resolved exact-product link. */
  kind: ExternalLinkKind;
  /** Where the reader is being sent, in plain words. */
  region: string;
  /** Optional one-line caution shown under the link. */
  note?: string;
}

/** The minimum a card must carry for us to build links from it. */
export interface CardLinkFields {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
}

/**
 * Cardmarket's game category token in its URL path. Only games Cardmarket
 * actually carries appear here; anything absent (e.g. Dragon Ball Super
 * Fusion World, which Cardmarket doesn't list) simply gets no Cardmarket
 * link rather than a search that lands nowhere.
 */
const CARDMARKET_GAME_TOKEN: Partial<Record<SkuGameSlug, string>> = {
  "one-piece": "OnePiece",
  pokemon: "Pokemon",
};

/** "Monkey.D.Luffy OP01-001" — the human words a search box wants. */
function searchTerm(card: CardLinkFields): string {
  return `${card.name_en || card.name || ""} ${card.card_number}`.trim();
}

/**
 * CardRush (カードラッシュ) — a Japanese-language store, prices in yen.
 * Confirmed-live keyword search by card number, e.g.
 *   https://www.cardrush-op.jp/product-list?keyword=OP13-012
 * We only link where the games-config marks the CardRush store `confirmed`
 * — an unconfirmed subdomain is registered-but-unscraped and may 404.
 */
export function buildCardRushSearch(
  card: CardLinkFields,
  gameSlug: string,
): ExternalMarketLink | null {
  const cfg = getPriceGuideConfig(gameSlug);
  if (!cfg?.cardrush?.confirmed) return null;
  if (!card.card_number) return null;
  return {
    channel: "CardRush",
    label: "Search CardRush (Japan)",
    href: `https://www.${cfg.cardrush.subdomain}/product-list?keyword=${encodeURIComponent(card.card_number)}`,
    kind: "search",
    region: "Japan",
    note: "Japanese-language store, prices in yen — reached through a proxy. See the buying guide.",
  };
}

/**
 * Cardmarket — Europe's deepest singles pool. We usually can't rebuild the
 * exact /Singles/{Expansion}/{Card} slug from the fields we hold, so this
 * is a site search on name + card number.
 */
export function buildCardmarketSearch(
  card: CardLinkFields,
  gameSlug: string,
): ExternalMarketLink | null {
  const token = CARDMARKET_GAME_TOKEN[gameSlug as SkuGameSlug];
  if (!token) return null;
  const term = searchTerm(card);
  if (!term) return null;
  return {
    channel: "Cardmarket",
    label: "Find on Cardmarket (Europe)",
    href: `https://www.cardmarket.com/en/${token}/Products/Search?searchString=${encodeURIComponent(term)}`,
    kind: "search",
    region: "Europe",
    note: "Filter by Seller country: United Kingdom to skip customs entirely.",
  };
}

/** eBay UK — the universal fallback; a UK seller means no customs. */
export function buildEbayUkSearch(card: CardLinkFields): ExternalMarketLink | null {
  const term = searchTerm(card);
  if (!term) return null;
  return {
    channel: "eBay UK",
    label: "Search eBay UK",
    href: `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(term)}`,
    kind: "search",
    region: "UK / global",
  };
}

/**
 * Every buildable external link for a card, in reading order. Channels
 * with no coverage for the card's game are omitted (never a dead link).
 * `gameSlug` may be passed when the caller already derived it; otherwise
 * we derive it from the SKU (falling back to One Piece, the founding
 * game, for underivable SKUs — matching the product page's own default).
 */
export function buildExternalMarketLinks(
  card: CardLinkFields,
  gameSlug?: SkuGameSlug,
): ExternalMarketLink[] {
  const slug = gameSlug ?? gameFromSku(card.sku) ?? "one-piece";
  return [
    buildCardRushSearch(card, slug),
    buildCardmarketSearch(card, slug),
    buildEbayUkSearch(card),
  ].filter((link): link is ExternalMarketLink => link !== null);
}
