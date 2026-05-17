/**
 * TCGCollector SKU matcher — pure-fn URL+JSON-LD → candidate canonical SKU.
 *
 * Bridges the typed `TcgCollectorProduct` (output of `normalize.ts`) to
 * the kingdom's canonical SKU shape via `@cambridge-tcg/sku`'s
 * `buildSku()`. Pure: no fetch, no DB. The caller (wholesale runner)
 * takes the candidate, looks it up in `cards.sku`, and either writes
 * `price_archive` (match) or quarantines (no match).
 *
 * ── URL shapes this matches ──────────────────────────────────────────
 *
 *   /cards/<game>/<set>/<slug>     — per-card pages (what we want)
 *   /products/<slug>               — sealed products (skipped; not a card)
 *
 * ── Substrate-honest scope ───────────────────────────────────────────
 *
 * - When the game segment is unknown, return null with reason
 *   `unknown_game_segment_<segment>`. Caller quarantines.
 * - When the card_number is unextractable, return null with reason
 *   `card_number_unextractable`.
 * - When buildSku throws (set_code or card_number malformed), return
 *   null with reason `build_sku_failed_<message>`.
 * - Default language: `en`. TCGC is multi-language but the international
 *   product pages default English; if a per-language pattern emerges,
 *   the matcher gains language detection — for now, EN is the floor.
 *
 * ── Why this lives here ──────────────────────────────────────────────
 *
 * In `packages/data-ingest/src/tcgcollector/` rather than the wholesale
 * runner because the URL → SKU mapping is a vendor-specific concern
 * (not a writer concern). The runner stays DB-aware; the matcher stays
 * pure. When the second sitemap+JSON-LD vendor lands, its matcher lives
 * in its own vendor directory; only the shared post-match write path
 * lives in the wholesale runner.
 */

import { buildSku, type GameCode } from "@cambridge-tcg/sku";
import type { TcgCollectorProduct } from "./normalize";

/**
 * Map TCGCollector URL game segments to canonical GameCode. Curated —
 * append only when a real TCGC URL with the segment has been observed.
 * Substrate-honest: the matcher returns `unknown_game_segment_<seg>`
 * for any segment not in this table, and the operator either confirms
 * + adds the row or accepts the quarantine.
 */
export const TCGC_GAME_SEGMENT_MAP: Record<string, GameCode> = {
  // ── Confirmed TCGCollector path slugs ────────────────────────────
  pokemon: "pkm",
  "pokemon-tcg-pocket": "pkp",
  "magic-the-gathering": "mtg",
  "one-piece": "op",
  "yu-gi-oh": "ygo",
  "dragon-ball-super": "dbs",
  "dragon-ball-super-fusion-world": "dbf",
  "digimon-card-game": "dmw",
  "cardfight-vanguard": "vng",
  "weiss-schwarz": "wei",
  "flesh-and-blood": "fab",
  "disney-lorcana": "lgr",
  "battle-spirits-saga": "bsr",
};

/** The set of segments we currently recognize (for audits + introspection). */
export function knownGameSegments(): readonly string[] {
  return Object.keys(TCGC_GAME_SEGMENT_MAP);
}

// ── Match result ───────────────────────────────────────────────────────

/** Confidence in the candidate SKU. */
export type MatchConfidence =
  /** URL game + set + card_number all extracted cleanly; buildSku succeeded. */
  | "high"
  /** Game + set + number extracted but at least one field had ambiguity
   *  (e.g. card_number from URL slug rather than JSON-LD sku field). */
  | "medium";

/** Successful match. */
export interface MatchOk {
  ok: true;
  sku: string;
  game: GameCode;
  set: string;
  card_number: string;
  language: string;
  confidence: MatchConfidence;
}

/** Substrate-honest match failure. */
export interface MatchFail {
  ok: false;
  reason: string;
}

export type MatchResult = MatchOk | MatchFail;

// ── The matcher ────────────────────────────────────────────────────────

/**
 * Parse a TCGCollector source URL + normalized product into a candidate
 * canonical SKU. Substrate-honest: returns `{ok: false, reason}` rather
 * than guessing when fields are missing.
 *
 * Pure-fn; no I/O. The caller decides whether to write or quarantine
 * based on the returned confidence + the existence of the SKU in the
 * cards table.
 */
export function matchSku(product: TcgCollectorProduct): MatchResult {
  const url = product.source_url;

  // Step 1 — URL shape: only /cards/<game>/<set>/<slug> is matchable.
  // /products/<slug> are sealed products that don't map to a card SKU;
  // they'd need their own matching (sealed-product table, etc.) which
  // is out of scope for v2.
  const cardsPathMatch = url.match(
    /\/cards\/([^/]+)\/([^/]+)\/([^/?#]+)/i,
  );
  if (!cardsPathMatch) {
    if (url.includes("/products/")) {
      return {
        ok: false,
        reason: "sku_match_sealed_product_not_supported",
      };
    }
    return {
      ok: false,
      reason: "sku_match_url_shape_not_card_page",
    };
  }

  const [, gameSegmentRaw, setSegmentRaw, cardSlugRaw] = cardsPathMatch;
  const gameSegment = decodeURIComponent(gameSegmentRaw).toLowerCase();
  const setSegment = decodeURIComponent(setSegmentRaw).toLowerCase();
  const cardSlug = decodeURIComponent(cardSlugRaw);

  // Step 2 — game segment → GameCode (substrate-honest: null on unknown).
  const game = TCGC_GAME_SEGMENT_MAP[gameSegment];
  if (!game) {
    return {
      ok: false,
      reason: `sku_match_unknown_game_segment_${gameSegment}`,
    };
  }

  // Step 3 — set: lowercase set segment as-is. TCGC slugs typically
  // match the publisher's set code (e.g. `svobf`, `op01`). If the slug
  // is a verbose name (`scarlet-violet-obsidian-flames`), it won't
  // match the publisher code and downstream lookup will fail with
  // "set not in cards table" — the kingdom learns the alias gap.
  const set = setSegment;
  if (set.length === 0 || set.length > 32) {
    return {
      ok: false,
      reason: "sku_match_set_segment_malformed",
    };
  }

  // Step 4 — card_number: try the JSON-LD upstream_sku first (often
  // numeric); fall back to extracting trailing digits from the slug.
  // `confidence: "high"` when sku field is present + parseable;
  // `medium` when extracted from slug.
  const extracted = extractCardNumber(product, cardSlug);
  if (!extracted) {
    return {
      ok: false,
      reason: "sku_match_card_number_unextractable",
    };
  }
  const { card_number, source: numberSource } = extracted;

  // Step 5 — language. Default English; TCGC international pages are
  // English-primary. Future: parse URL prefix or page metadata for
  // localized pages (e.g. `/de/cards/…`).
  const language = "en";

  // Step 6 — buildSku. Substrate-honest: catch any buildSku errors and
  // surface them as a match failure rather than throwing through to
  // the wholesale runner.
  let sku: string;
  try {
    sku = buildSku({ game, set, number: card_number, lang: language });
  } catch (err) {
    return {
      ok: false,
      reason: `sku_match_build_sku_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    sku,
    game,
    set,
    card_number,
    language,
    confidence: numberSource === "jsonld_sku" ? "high" : "medium",
  };
}

// ── Card-number extraction ─────────────────────────────────────────────

interface ExtractedNumber {
  card_number: string;
  source: "jsonld_sku" | "url_slug";
}

/**
 * Pull a card_number from either:
 *   (a) the JSON-LD `sku` field (preferred — often the publisher's
 *       canonical number like `020` or `OP01-001`),
 *   (b) the URL slug's trailing numeric segment (fallback — works when
 *       slug is `<name>-<NNN>` or `<name>-<set>-<NNN>`).
 *
 * Substrate-honest: returns null when neither path yields a parseable
 * number. The caller quarantines.
 */
function extractCardNumber(
  product: TcgCollectorProduct,
  cardSlug: string,
): ExtractedNumber | null {
  // (a) JSON-LD sku field — strip non-numeric suffixes; preserve
  // leading zeros (a card's canonical number is its publisher code).
  if (product.upstream_sku) {
    const fromSku = normalizeCardNumber(product.upstream_sku);
    if (fromSku) {
      return { card_number: fromSku, source: "jsonld_sku" };
    }
  }

  // (b) URL slug trailing-digits — `charizard-vmax-020` → `020`.
  // Match the last hyphen-separated segment if it's digit-only.
  const slugMatch = cardSlug.match(/-(\d{1,5})$/);
  if (slugMatch) {
    return { card_number: slugMatch[1], source: "url_slug" };
  }

  // (b') Sometimes the slug ends with `-<set>-<NNN>` (e.g.
  // `charizard-swsh01-020`) — the regex above handles it by greedily
  // matching trailing digits, but if `<NNN>` is the publisher's
  // alphanumeric (e.g. `TG14`) the digit-only regex misses. Try a
  // broader pattern: last hyphen-segment if it's a card-number shape.
  const broadMatch = cardSlug.match(/-([0-9a-z]{1,8})$/i);
  if (broadMatch && /\d/.test(broadMatch[1])) {
    // Only accept if it contains at least one digit — pure-letter
    // tails are usually name fragments, not card numbers.
    return { card_number: broadMatch[1].toLowerCase(), source: "url_slug" };
  }

  return null;
}

/**
 * Normalize a card-number string. Substrate-honest: returns the
 * original string trimmed of whitespace if it looks like a publisher
 * card number; null if it doesn't.
 *
 * Accepts: `001`, `OP01-001`, `020`, `TG14`, `SWSH01-020`. Rejects:
 * pure-text strings, ambiguous IDs without any digit.
 */
function normalizeCardNumber(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > 16) return null;
  // Must contain at least one digit to be considered a card number.
  if (!/\d/.test(s)) return null;
  // Lowercase for canonical SKU form.
  return s.toLowerCase();
}
