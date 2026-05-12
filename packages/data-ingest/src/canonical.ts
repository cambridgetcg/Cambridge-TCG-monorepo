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

/** Discriminated union for the recommended canonical types. */
export type CanonicalRecord =
  | { kind: "card"; data: CanonicalCard }
  | { kind: "price"; data: CanonicalPrice }
  | { kind: "tournament_mention"; data: CanonicalTournamentMention }
  | { kind: "sentiment_mention"; data: CanonicalSentimentMention };
