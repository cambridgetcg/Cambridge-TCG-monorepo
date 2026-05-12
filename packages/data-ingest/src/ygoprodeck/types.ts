/**
 * Subset of YGOPRODeck v7 card fields the protocol consumes.
 * Reference: https://ygoprodeck.com/api-guide/
 *
 * One card can have many `card_sets[]` entries — each one a printing.
 * The normalizer fans out one CanonicalCard per (card_id × printing).
 */
export interface YgoCard {
  /** Card passcode (8-digit numeric id). Stable across printings. */
  id: number;
  /** Card name. Natural-language. */
  name: string;
  /** Type ("Effect Monster", "Spell Card", etc.). */
  type?: string;
  /** Rules / effect text. Natural-language. */
  desc?: string;
  /** Attack / Defense / Level for monsters. */
  atk?: number;
  def?: number;
  level?: number;
  /** Attribute (DARK / LIGHT / FIRE etc.). */
  attribute?: string;
  /** Race / monster type ("Spellcaster", "Dragon", etc.). */
  race?: string;
  /** Archetype tag. */
  archetype?: string;
  /** All printings of this card across sets. */
  card_sets?: YgoCardSet[];
  /** Card images. */
  card_images?: YgoCardImage[];
}

export interface YgoCardSet {
  /** Set name, e.g. "Legend of Blue Eyes White Dragon". */
  set_name?: string;
  /** Set code + collector number, e.g. "LOB-EN001". */
  set_code: string;
  /** Rarity in this printing. */
  set_rarity?: string;
  /** Rarity code (UR / SR / etc.). */
  set_rarity_code?: string;
  /** Price snapshot, often "0.00" if unknown. */
  set_price?: string;
}

export interface YgoCardImage {
  id: number;
  image_url: string;
  image_url_small?: string;
  image_url_cropped?: string;
}

export interface YgoCardInfoResponse {
  data: YgoCard[];
}
