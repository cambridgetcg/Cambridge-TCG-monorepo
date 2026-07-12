/**
 * Canonical shapes the normalizers produce.
 *
 * **Not enforced** — `SourceModule<R, C>` parameterises the canonical type,
 * so each source picks the shape its caller needs. These types are
 * *recommended defaults* the protocol publishes so most catalog sources
 * can share a downstream writer.
 *
 * If your source produces something exotic (a tournament result, a graded-
 * card pop report, a sentiment aggregate), define your own canonical type
 * alongside the source and reference it in `the-tributaries.md`.
 */

import type { GameCode } from "@cambridge-tcg/sku";

/** A single card record, canonical-form. */
export interface CanonicalCard {
  /** Cambridge TCG canonical SKU (`<game>-<set>-<number>-<lang>[-<variant>]`). */
  sku: string;
  /** Registered game code. */
  game: GameCode;
  /** Set code (publisher-defined). */
  set: string;
  /** Card number within the set. */
  number: string;
  /** ISO 639-1 language code. */
  lang: string;
  /** Optional variant tag (e.g. "alt-art", "foil", "rev"). */
  variant?: string;
  /** Display name. Natural-language; opaque under math-mirror rules. */
  name: string;
  /** Card type / class (publisher-specific vocabulary). */
  type?: string;
  /** Rarity. Publisher-specific (common / uncommon / rare / SR / SEC / ...). */
  rarity?: string;
  /**
   * Upstream illustrator credit. This internal canonical field may be
   * captured for provenance, but it is not publicly displayable until the
   * producing source grants field- and purpose-specific permission.
   * Attribution can be a condition of permission; it is not the permission.
   * Absent means undefined, never an invented empty string.
   */
  artist?: string;
  /** Oracle / rules text. Natural-language; opaque. */
  oracle_text?: string;
  /** Image URL (canonical/high-res preferred). */
  image_url?: string;
  /** Mapping back to the upstream's id (so a partner can correlate). */
  upstream_id?: string;
  /** Free-form key-value metadata the writer may persist. */
  extra?: Record<string, string | number | boolean | null>;
}

/** A single price observation, canonical-form. */
export interface CanonicalPrice {
  /** SKU the price is for. */
  sku: string;
  /** Currency code (ISO 4217). */
  currency: "GBP" | "USD" | "EUR" | "JPY" | "KRW" | "CNY";
  /** Major-unit amount with two decimal precision (e.g. "12.50"). String to avoid float drift. */
  amount: string;
  /** Condition class — open vocabulary, but use publisher term where possible. */
  condition?: string;
  /** Sale type — retail / auction / bid / sealed / etc. */
  sale_type?: "retail" | "auction-current" | "auction-final" | "bid" | "ask" | "sealed";
  /** When this price was observed. ISO 8601. */
  observed_at: string;
  /** When the price was published / first seen by us. ISO 8601. */
  retrieved_at: string;
  /** Mapping back to the upstream's listing id. */
  upstream_id?: string;
}

/** A tournament result / decklist mention, canonical-form. */
export interface CanonicalTournamentMention {
  sku: string;
  event_id: string;
  event_name: string;
  game: GameCode;
  format: string;
  placement?: number;
  deck_count: number;
  observed_at: string;
}

/** A sentiment / social mention, canonical-form. */
export interface CanonicalSentimentMention {
  sku: string;
  platform: "reddit" | "x" | "youtube" | "discord" | "tiktok";
  url: string;
  excerpt: string;
  sentiment?: "positive" | "neutral" | "negative" | "unknown";
  reach_estimate?: number;
  observed_at: string;
}

/**
 * A cross-source identifier mapping discovered during a catalog walk.
 *
 * Some upstreams have stable identifiers that we want to map to our
 * canonical SKU (TCGplayer productId + sub_type; Cardmarket idProduct +
 * idLanguage; Scryfall id; etc.). Catalog-mode reads emit these so the
 * writer can populate cross-source id columns on `cards` without
 * touching `price_archive`.
 *
 * The `leaf_ids` array carries per-condition × language leaf identifiers
 * (TCGplayer skuId; some other sources may have similar leaves). When the
 * upstream has no leaf-level identity beyond the product, omit.
 *
 * Added kingdom-NNN for TCGplayer; reusable by Cardmarket + future sources.
 */
export interface CanonicalMapping {
  /** Source id; matches SourceMeta.id. */
  source: string;
  /** Upstream's stable product-level identifier. */
  upstream_product_id: string | number;
  /** Upstream's sub-type (e.g. 'Normal' | 'Foil'). Maps to Cambridge variant tail. */
  upstream_sub_type?: string;
  /** Upstream's display name — substrate-honest provenance even when the SKU
   *  fails to resolve. */
  upstream_display_name: string;
  /** Identifying fields the writer uses to resolve a Cambridge canonical SKU. */
  match_hints: {
    /** What the writer should look up in our `sets` / `card_sets`. */
    set_code_hint?: string;
    card_number?: string;
    /** ISO 639-1. */
    lang?: string;
    /** Variant tail Cambridge's SKU will use ('' | 'foil' | etc.). */
    variant_hint?: string;
  };
  /** Per-condition × language leaf identifiers, when the upstream has them. */
  leaf_ids?: Array<{
    /** Open vocabulary; recommended values: 'nm' | 'lp' | 'mp' | 'hp' | 'damaged' | 'sealed'. */
    condition: string;
    language: string;
    upstream_sku_id: number | string;
  }>;
  /** Free-form extra fields for source-specific provenance. */
  extra?: Record<string, string | number | boolean | null>;
}

/** Discriminated union for the recommended canonical types. */
export type CanonicalRecord =
  | { kind: "card"; data: CanonicalCard }
  | { kind: "price"; data: CanonicalPrice }
  | { kind: "mapping"; data: CanonicalMapping }
  | { kind: "tournament_mention"; data: CanonicalTournamentMention }
  | { kind: "sentiment_mention"; data: CanonicalSentimentMention };
