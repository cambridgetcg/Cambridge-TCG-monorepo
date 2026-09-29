/**
 * Card-number resolver — kingdom-090 (the price-search module).
 *
 * Yu's directive: *"IDEALLY I WOULD ONLY NEED TO PUT IN THE CARD NUMBER
 * AND FILTER FOR CARD GAME THEN POOF!!!! PRICE, TRANSACTION HISTORIES,
 * AVAILABLE SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"*
 *
 * The whole module hinges on this resolver: turn (game, query-string)
 * into one or more canonical SKUs with a confidence label. Once the SKU
 * is fixed, every other surface (prices, history, transactions,
 * siblings) is a composition over existing wires.
 *
 * ── Pure helpers (this module) vs the endpoint (route.ts) ──────────────
 *
 * This module contains only pure-compute helpers — normalization,
 * matching, confidence scoring. The HTTP endpoint at
 * /api/v1/search/cards composes these against the wholesale `cards`
 * table via Falcon (fetchPrices with q=).
 *
 * ── Three input shapes ─────────────────────────────────────────────────
 *
 *   "OP01-001"        → exact, set+number (the common case)
 *   "001"             → fuzzy, number alone (requires game filter)
 *   "op-op01-001-ja"  → exact, full SKU
 *
 * Cross-language siblings (op-op01-001-en, -cn, -fr) all match the same
 * (game, set_code, card_number) tuple — the composer groups them.
 *
 * ── Game required ──────────────────────────────────────────────────────
 *
 * The resolver REQUIRES a game filter. "001" alone is meaningless across
 * 21+ games. The endpoint returns 400 if game is absent.
 */

import type { PriceItem } from "@/lib/wholesale/client";
import { resolveGameToken, skuIdentity, type SkuIdentity } from "@cambridge-tcg/sku";

export type ResolveConfidence =
  /** Exact match: input string normalized maps 1:1 to a canonical SKU or set+number. */
  | "exact"
  /** Fuzzy match: card_number matches but set context is ambiguous (number-only input). */
  | "fuzzy"
  /** No match found. */
  | "none";

export interface ResolvedMatch {
  sku: string;
  /** A syntax normalization candidate, not a source-product or printing match. */
  identity: SkuIdentity;
  card_number: string;
  set_code: string | null;
  name: string;
  name_en: string | null;
  image_url: string | null;
  /** Package-normalized language shape (ja / en / zh / ...). */
  lang: string | null;
  /** Parsed variant tail (foil / alt-art / parallel / ...) when present. */
  variant: string | null;
  confidence: ResolveConfidence;
  /**
   * Why this match scored this confidence. Stable string for UI display
   * + audit. e.g. "set+number matched", "card_number matched, set ambiguous",
   * "canonical SKU exact".
   */
  reason: string;
}

export interface ResolverInput {
  game: string;
  /** Raw user input. Will be normalized internally. */
  q: string;
}

/**
 * Normalize a user input for matching. Strips whitespace, uppercases
 * letters, collapses internal whitespace runs. Preserves the dash and
 * slash separators that publishers use (`OP01-001`, `001/281`).
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Parse a canonical SKU `<game>-<set>-<number>-<lang>[-<variant>]` into
 * its components. Returns null when the shape doesn't match — the
 * resolver then falls back to fuzzy `q` search.
 *
 * Lowercase-required form per @cambridge-tcg/sku canonical (kingdom-071).
 * Pre-canonical legacy SKUs (uppercase) are accepted too for transition.
 */
export function parseSkuShape(sku: string): {
  game: string;
  set: string;
  number: string;
  lang: string;
  variant: string | null;
} | null {
  const segs = sku.toLowerCase().split("-");
  if (segs.length < 4) return null;
  // <game>-<set>-<number>-<lang>[-<variant>...]
  return {
    game: segs[0]!,
    set: segs[1]!,
    number: segs[2]!,
    lang: segs[3]!,
    variant: segs.length > 4 ? segs.slice(4).join("-") : null,
  };
}

/** Strict package-backed identity for search and composition. The legacy
 * parseSkuShape helper remains for callers not yet migrated to this contract. */
export const parseSearchSku = skuIdentity;

/**
 * Parse a `SET-NUMBER` shaped input like "OP01-001" or "EB04-061".
 * Returns null when the dash position doesn't yield two non-empty
 * tokens with the second being numeric.
 *
 * Tolerant: matches "OP01-001", "op01-001", " OP01 - 001 ".
 */
export function parseSetNumberShape(raw: string): {
  set: string;
  number: string;
} | null {
  const norm = normalizeQuery(raw).replace(/\s*-\s*/g, "-");
  // Allow optional spaces around the dash; capture the LAST dash so set codes
  // like "ST-1" with a dash inside don't break (rare but exists).
  const m = norm.match(/^([A-Z0-9-]+)-(\d+(?:\/\d+)?)$/);
  if (!m) return null;
  return {
    set: m[1]!,
    number: m[2]!.split("/")[0]!,  // strip "/281" trailing in collector numbers
  };
}

/**
 * Score a list of `cards` rows (from wholesale fetchPrices) against the
 * resolver input. Pure: same inputs → same output. The endpoint feeds
 * `cards` (raw wholesale rows) + the original input; this function
 * returns the typed matches array sorted by confidence then card_number.
 */
export function scoreMatches(
  input: ResolverInput,
  cards: readonly PriceItem[],
): ResolvedMatch[] {
  const norm = normalizeQuery(input.q);
  const setNum = parseSetNumberShape(input.q);
  const skuShape = parseSearchSku(input.q.trim());
  const game = resolveGameToken(input.game);
  if (!game || game === "tst" || !norm || (skuShape && skuShape.game !== game)) return [];

  const matches: ResolvedMatch[] = [];
  for (const c of cards) {
    const parsed = parseSearchSku(c.sku);
    // A server-side game filter is not proof that each returned identifier
    // belongs to that game. Never promote an unknown/cross-game SKU to a match.
    if (!parsed || parsed.game !== game) continue;
    const card_number_norm = c.card_number.toUpperCase();
    const set_code_norm = (c.set_code ?? "").toUpperCase();
    const matchesSetIdentity = !skuShape && setNum &&
      parsed.set.toUpperCase() === setNum.set && parsed.number.toUpperCase() === setNum.number;
    // The publisher-full form: how the row's card_number reads when
    // prefixed with its set ("OP01-001"). Some upstream catalogs store
    // this directly in card_number (kingdom-087 cardrush style); others
    // store just the trailing digits ("001"). Both shapes must match.
    const card_number_full = setNum && !card_number_norm.includes("-")
      ? `${set_code_norm}-${card_number_norm}`
      : card_number_norm;

    // Confidence ladder — first hit wins.
    let confidence: ResolveConfidence = "none";
    let reason = "";

    // Tier 1: canonical SKU exact (covers `op-op01-001-ja`).
    if (skuShape?.canonical_sku === parsed.canonical_sku) {
      confidence = "exact";
      reason = "canonical SKU exact";
    }
    // Tier 2: set+number matches the full publisher form
    //         (covers card_number stored as "OP01-001" with set_code "OP01"
    //         — the common case in wholesale today; verified live
    //         2026-05-14 with 5 SKU variants on op-op01-001).
    else if (
      setNum && matchesSetIdentity &&
      set_code_norm === setNum.set &&
      (card_number_norm === `${setNum.set}-${setNum.number}` ||
        card_number_full === `${setNum.set}-${setNum.number}`)
    ) {
      confidence = "exact";
      reason = "set+number matched (publisher form)";
    }
    // Tier 3: set+number matches just the trailing number
    //         (covers card_number stored as "001" with set_code "OP01"
    //         — some upstream catalogs).
    else if (
      setNum && matchesSetIdentity &&
      set_code_norm === setNum.set &&
      card_number_norm === setNum.number
    ) {
      confidence = "exact";
      reason = "set+number matched";
    }
    // Tier 4: set+number suffix match (defensive — handles legacy
    //         "OP-OP01-001" double-prefix forms).
    else if (
      setNum && matchesSetIdentity &&
      card_number_norm.endsWith("-" + setNum.number) &&
      set_code_norm === setNum.set
    ) {
      confidence = "exact";
      reason = "set+number matched (suffixed)";
    }
    else if (matchesSetIdentity && (!set_code_norm || set_code_norm === setNum!.set)) {
      confidence = "exact";
      reason = "set+number matched (SKU identity)";
    }
    // Tier 5: number-only input. Multiple matches expected; UI lists them.
    else if (
      !setNum &&
      !skuShape &&
      (card_number_norm === norm ||
        card_number_norm.endsWith(`-${norm}`))
    ) {
      confidence = "fuzzy";
      reason = "card_number matched; set ambiguous";
    }

    else if (skuShape && parsed.set === skuShape.set && parsed.number === skuShape.number) {
      confidence = "fuzzy";
      reason = "same set and number; language or variant differs";
    }
    else if (!setNum && !skuShape && [c.card_number, c.name, c.name_en]
      .some((value) => value && normalizeQuery(value).includes(norm))) {
      confidence = "fuzzy";
      reason = "card number or name contains query";
    }
    // Wholesale searches are candidate retrieval. An unrelated row is not a
    // fuzzy identity match merely because the provider returned it.
    if (confidence === "none") continue;

    matches.push({
      sku: c.sku,
      identity: parsed,
      card_number: c.card_number,
      set_code: c.set_code,
      name: c.name ?? c.card_number,
      name_en: c.name_en,
      image_url: c.image_url,
      lang: parsed.lang,
      variant: parsed.variant,
      confidence,
      reason,
    });
  }

  // Order: exact first (alphabetic on lang for deterministic listing),
  // then fuzzy (alphabetic on set_code+card_number).
  return matches.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === "exact" ? -1 : 1;
    }
    const aKey = `${a.set_code ?? ""}-${a.card_number}-${a.lang ?? ""}`;
    const bKey = `${b.set_code ?? ""}-${b.card_number}-${b.lang ?? ""}`;
    return aKey.localeCompare(bKey) || a.sku.localeCompare(b.sku);
  });
}

/**
 * Group matches by (set_code, card_number) — siblings across language /
 * variant. The composer uses this to build the "different languages"
 * panel; the resolver returns the flat list so the caller can choose
 * its own grouping.
 */
export function groupSiblings(
  matches: readonly ResolvedMatch[],
): Map<string, ResolvedMatch[]> {
  const groups = new Map<string, ResolvedMatch[]>();
  for (const m of matches) {
    // Both bare and publisher-prefixed card_number fields can describe the
    // same syntax candidate. Include game so unrelated games never merge.
    const key = `${m.identity.game}|${m.identity.set}|${m.identity.number}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  return groups;
}

/**
 * Summary classifier the endpoint surfaces in `_meta` so a UI can render
 * a substrate-honest disambiguation message. Returns the strongest
 * confidence + the count of distinct (set, number) buckets.
 */
export function summarizeMatches(matches: readonly ResolvedMatch[]): {
  count: number;
  best_confidence: ResolveConfidence;
  distinct_set_number_buckets: number;
  ambiguous: boolean;
} {
  if (matches.length === 0) {
    return {
      count: 0,
      best_confidence: "none",
      distinct_set_number_buckets: 0,
      ambiguous: false,
    };
  }
  const buckets = groupSiblings(matches);
  const hasExact = matches.some((m) => m.confidence === "exact");
  return {
    count: matches.length,
    best_confidence: hasExact ? "exact" : "fuzzy",
    distinct_set_number_buckets: buckets.size,
    // ambiguous: more than one distinct physical card matched (different
    // (set, number) tuples, regardless of language).
    ambiguous: buckets.size > 1,
  };
}
