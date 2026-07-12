/**
 * The subset of Scryfall card fields the protocol consumes. Scryfall
 * returns many more (legalities, prices, rulings, ...) — we model only
 * what the canonical normalizer needs. Future iterations can widen this.
 *
 * Reference: https://scryfall.com/docs/api/cards
 */
export interface ScryfallCard {
  /** Scryfall printing id (UUID). */
  id: string;
  /** Cross-printing oracle id. Same card across printings shares this. */
  oracle_id?: string;
  /** Lowercase 3-5 letter Scryfall set code. */
  set: string;
  /** Collector number. */
  collector_number: string;
  /** ISO 639-1-ish language. Scryfall uses 2-3 char codes. */
  lang: string;
  /** Card name. Natural-language. */
  name: string;
  /** "Card // Other Card" if multi-face. */
  printed_name?: string;
  /** Type line ("Creature — Human Wizard"). */
  type_line?: string;
  /** Rules text. May include {symbols}. */
  oracle_text?: string;
  /** Rarity. */
  rarity?: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
  /** Illustrator credit. Scryfall ships this on (nearly) every card. */
  artist?: string;
  /** Stable ids for each credited artist. See scryfall.com/docs/api/cards. */
  artist_ids?: string[];
  /** Stable id for the illustration itself — the same artwork reused across
   *  printings shares one illustration_id, so it clusters "same art" prints. */
  illustration_id?: string;
  /** Image URIs. */
  image_uris?: { normal?: string; large?: string; png?: string };
  /** For double-faced cards. */
  card_faces?: { name: string; image_uris?: { normal?: string } }[];
  /** Frame effects (foil-etched, showcase, etc.). */
  frame_effects?: string[];
  /** Promo flags ("boosterfun", "datestamped", ...). */
  promo_types?: string[];
  /** Released date (ISO date). */
  released_at?: string;
  /** Whether this printing is a digital-only object (MTGO/MTGA). */
  digital?: boolean;
  /** Variant marker. */
  variation?: boolean;
}

export interface ScryfallBulkMeta {
  type: string;
  download_uri: string;
  updated_at: string;
  size: number;
  content_type: string;
  content_encoding?: string;
}

export interface ScryfallBulkIndex {
  object: "list";
  has_more: boolean;
  data: ScryfallBulkMeta[];
}
