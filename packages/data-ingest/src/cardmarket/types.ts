/**
 * Cardmarket ("MKM") upstream entity shapes + the small lookup tables that map
 * its vocabularies onto Cambridge's. Structural fields only — MKM returns more,
 * but the normalizer reads just these.
 *
 * Refs: https://api.cardmarket.com/ws/documentation/API_2.0:Entities:Product
 */

import type { GameCode } from "@cambridge-tcg/sku";

/** MKM `priceGuide` block (attached to a product). All major-unit EUR. */
export interface CardmarketPriceGuide {
  /** Average price of articles ever sold. */
  SELL?: number;
  /** Current lowest price (any condition). */
  LOW?: number;
  /** Current lowest price, Excellent+ condition. */
  LOWEX?: number;
  /** Current lowest foil price. */
  LOWFOIL?: number;
  /** Average of current listings. */
  AVG?: number;
  /** Trend price — the headline we anchor on. */
  TREND?: number;
  /** Trend price for foils. */
  TRENDFOIL?: number;
}

export interface CardmarketLocalization {
  idLanguage: number;
  languageName?: string;
  name?: string;
}

/** A single MKM product = one printing in one language (idProduct is per-language). */
export interface CardmarketProduct {
  idProduct: number;
  idMetaproduct?: number;
  enName?: string;
  /** Languages this product is available in (idProduct is itself per-language). */
  localization?: CardmarketLocalization[];
  /** Numeric game id (see CARDMARKET_GAME). */
  idGame?: number;
  gameName?: string;
  /** The product's own language id, when present. */
  idLanguage?: number;
  categoryName?: string;
  expansionName?: string;
  expansion?: { idExpansion?: number; enName?: string; abbreviation?: string };
  /** Collector number within the set. */
  number?: string;
  rarity?: string;
  image?: string;
  website?: string;
  /** Inline price guide (present on product detail responses). */
  priceGuide?: CardmarketPriceGuide;
}

/**
 * MKM `idLanguage` → ISO 639-1. The well-established MKM language vocabulary.
 * (MKM distinguishes Simplified vs Traditional Chinese as 6 and 11; we collapse
 * both to `zh` since the Cambridge SKU `lang` slot is ISO 639-1.)
 */
export const CARDMARKET_LANG: Record<number, string> = {
  1: "en",
  2: "fr",
  3: "de",
  4: "es",
  5: "it",
  6: "zh", // Simplified Chinese
  7: "ja",
  8: "pt",
  9: "ru",
  10: "ko",
  11: "zh", // Traditional Chinese
};

/**
 * MKM `idGame` → Cambridge `GameCode`. Only the long-established ids are
 * asserted here; the rest resolve to `undefined` and the normalizer quarantines
 * them (so an unknown game is an inspectable gap, not a silent miscode). Extend
 * by reading the live `/games` endpoint or confirming ids against MKM docs.
 */
export const CARDMARKET_GAME: Record<number, GameCode> = {
  1: "mtg", // Magic: The Gathering
  3: "ygo", // Yu-Gi-Oh!
  6: "pkm", // Pokémon
  // Newer TCGs (One Piece, Lorcana, Flesh and Blood, Digimon, Star Wars
  // Unlimited) exist on MKM but their numeric idGame must be confirmed against
  // the live /games endpoint before being asserted here. Until then they
  // quarantine as `mapping.unknown-game`.
};

export function gameForCardmarketId(idGame: number | undefined): GameCode | undefined {
  return idGame == null ? undefined : CARDMARKET_GAME[idGame];
}

export function isoLangForCardmarketId(idLanguage: number | undefined): string | undefined {
  return idLanguage == null ? undefined : CARDMARKET_LANG[idLanguage];
}
