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
 * matching, confidence scoring, fold ranking. The HTTP endpoints at
 * /api/v1/search/* compose these against the wholesale `cards` table
 * via Falcon (fetchPrices).
 *
 * ── Input shapes ───────────────────────────────────────────────────────
 *
 *   "OP01-001"        → exact, set+number (the common case)
 *   "op01 001" / "OP01/001" / "ＯＰ０１－００１" → same, after separator folding
 *   "001"             → fuzzy, number alone (requires game filter)
 *   "op-op01-001-ja"  → exact, full SKU
 *   "luffy" / "ルフィ" → fuzzy, name match (wholesale ILIKEs name + name_en)
 *
 * Cross-language siblings (op-op01-001-en, -zh, -fr) all match the same
 * (game, set_code, card_number) tuple — the composer groups them.
 *
 * ── Game required ──────────────────────────────────────────────────────
 *
 * The resolver REQUIRES a game filter. "001" alone is meaningless across
 * 21+ games. The endpoint returns 400 if game is absent.
 */

import type { PriceItem } from "@/lib/wholesale/client";
import { normalizeLangCode, normalizeSku } from "@cambridge-tcg/sku";
import { nameHasVariantMarkers } from "./variants";

/** Query length bounds shared by the API routes, the page's server-side
 *  pre-validation, and the form's minLength/maxLength — one constant so
 *  the three surfaces cannot drift. */
export const MIN_Q_LENGTH = 2;
export const MAX_Q_LENGTH = 100;
/** Pagination offset ceiling shared by the routes and the page so the
 *  "showing X–Y" arithmetic can never disagree with what was served. */
export const MAX_SEARCH_OFFSET = 500;

export type ResolveConfidence =
  /** Exact match: input string normalized maps 1:1 to a canonical SKU or set+number. */
  | "exact"
  /** Fuzzy match: the row matched on partial number or name; set/print context is ambiguous. */
  | "fuzzy"
  /** No match found. */
  | "none";

export interface ResolvedMatch {
  sku: string;
  card_number: string;
  set_code: string | null;
  set_name: string | null;
  name: string;
  name_en: string | null;
  image_url: string | null;
  /** Parsed language tail from the SKU, raw + lowercased (legacy rows
   *  carry "jp"/"cn" — partner-visible value domain, kept stable). */
  lang: string | null;
  /** Parsed variant tail (foil / alt-art / parallel / ...) when present. */
  variant: string | null;
  /** Card rarity per wholesale; null when unset. */
  rarity: string | null;
  /** Cambridge TCG sell price when listed; null when unpriced. */
  price_gbp: number | null;
  /** Whether Cambridge TCG has sellable stock right now. */
  in_stock: boolean;
  confidence: ResolveConfidence;
  /**
   * Why this match scored this confidence. Stable string for UI display
   * + audit. e.g. "set+number matched", "name matched",
   * "card number contains query", "canonical SKU exact".
   */
  reason: string;
}

export interface ResolverInput {
  game: string;
  /** Raw user input. Will be normalized internally. */
  q: string;
  /** How the wholesale row set was matched upstream. "substring" is the
   *  ILIKE default; "similarity" means the typo-tolerant pg_trgm retry
   *  produced these rows — reason strings must say so honestly. */
  matchMode?: "substring" | "similarity";
}

/**
 * Normalize a user input for matching. NFKC-folds full-width characters
 * (Japanese keyboards produce ＯＰ０１－００１), strips whitespace,
 * uppercases letters, collapses internal whitespace runs.
 */
export function normalizeQuery(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Fold the separator characters humans actually type between a set code
 * and a card number — space, slash, en/em dash, minus, full-width forms —
 * into the canonical ASCII hyphen, collapsing runs. " OP01 - 001 ",
 * "OP01/001", "OP01–001" all become "OP01-001".
 */
function foldSeparators(norm: string): string {
  return norm
    .replace(/\s*[/\\–—−‐‑]\s*/g, "-") // slashes + unicode dashes (NFKC already folded －)
    .replace(/\s*-\s*/g, "-") // spaces hugging an ASCII hyphen
    .replace(/\s+/g, "-") // bare spaces as separators
    .replace(/-{2,}/g, "-");
}

/**
 * Fold a card NAME for substring comparison: publishers and catalogs
 * disagree on separators ("Monkey D Luffy" vs "Monkey.D.Luffy"). Strips
 * dots, interpuncts, hyphens and whitespace, lowercases. NFKC first so
 * full-width Latin matches too.
 */
export function foldNameForCompare(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().replace(/[\s.·・'’\-]/g, "");
}

/**
 * Parse a canonical SKU `<game>-<set>-<number>-<lang>[-<variant>]` into
 * its components. Returns null when the shape doesn't match — the
 * resolver then falls back to fuzzy `q` search.
 *
 * Lowercase-required form per @cambridge-tcg/sku canonical (kingdom-071).
 * Pre-canonical legacy SKUs (uppercase, JP/CN lang tails) are accepted
 * too for transition. The lang tail is returned RAW (lowercased) — it
 * feeds partner-visible payload fields whose value domain ("jp"/"cn" on
 * legacy rows) must not change silently. Comparisons that need ISO
 * codes (the ?lang= fold preference) normalize at the comparison site
 * via normalizeLangCode.
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

/**
 * Parse a `SET-NUMBER` shaped input like "OP01-001" or "EB04-061".
 * Returns null when the separator position doesn't yield two non-empty
 * tokens with the second containing digits.
 *
 * Tolerant by design: matches "OP01-001", "op01-001", " OP01 - 001 ",
 * "op01 001", "OP01/001", "OP01–001" (en-dash), "ＯＰ０１－００１"
 * (full-width), and alphanumeric numbers like "SV01-TG12". Collector
 * denominators are stripped ("025/202" style "001/281" → "001").
 */
export function parseSetNumberShape(raw: string): {
  set: string;
  number: string;
} | null {
  const norm = normalizeQuery(raw);
  // Bare collector number "025/202" — number + denominator with no set
  // token. Not parseable as set+number; the raw-q path matches it
  // against catalogs that store the full collector string.
  if (/^\d+\/\d+$/.test(norm)) return null;
  // Strip a "/total" denominator when it follows a separated number
  // ("OP01-001/281" → "OP01-001") BEFORE slash-folding — otherwise the
  // denominator would fold into a fake extra segment.
  const deDenominated = norm.replace(/([-\s]\s*\d+)\/\d+$/, "$1");
  const folded = foldSeparators(deDenominated);
  // A 4+-segment token that parses as a SKU IS a SKU — "op-op01-001-ja"
  // or "OP-OP01-001-JP-V11DZ" must not parse as set+number (the variant
  // grid links pass full SKUs as q). parseSkuShape owns that shape.
  if (parseSkuShape(folded)) return null;
  // Capture on the LAST dash so set codes with internal dashes ("ST-1",
  // "D-BT01") keep their shape. The number token must contain at least
  // one digit; a short letter prefix/suffix is allowed (TG12, E001, 06b).
  const m = folded.match(/^([A-Z0-9-]+)-([A-Z]{0,3}\d+[A-Z0-9]*)$/);
  if (!m) return null;
  return {
    set: m[1]!,
    number: m[2]!,
  };
}

/**
 * Score a list of `cards` rows (from wholesale fetchPrices) against the
 * resolver input. Pure: same inputs → same output. The endpoint feeds
 * `cards` (raw wholesale rows) + the original input; this function
 * returns the typed matches array sorted by confidence, then stock,
 * then price presence, then alphabetic key.
 *
 * Rows that match NO tier (possible because wholesale's ILIKE also runs
 * over columns/forms this scorer rechecks more strictly) are dropped —
 * surfacing them with a fabricated reason would be substrate-dishonest.
 */
export function scoreMatches(
  input: ResolverInput,
  cards: readonly PriceItem[],
): ResolvedMatch[] {
  const norm = normalizeQuery(input.q);
  const setNum = parseSetNumberShape(input.q);
  const skuShape = setNum ? null : parseSkuShape(input.q);
  const foldedName = foldNameForCompare(input.q);
  const similarityMode = input.matchMode === "similarity";

  // Pre-compute the canonical forms of the input for SKU-exact matching.
  // normalizeSku bridges the legacy/canonical divide: the documented
  // canonical shape "op-op01-001-ja" must match a catalog row stored as
  // legacy "OP-OP01-001-JP" (kingdom-071 migration still in drafts).
  const inputSkuLower = input.q.trim().toLowerCase();
  const inputSkuCanonical = normalizeSku(input.q.trim());

  const matches: ResolvedMatch[] = cards.map((c) => {
    const parsed = parseSkuShape(c.sku);
    const card_number_norm = c.card_number.toUpperCase();
    const set_code_norm = (c.set_code ?? "").toUpperCase();
    // The publisher-full form: how the row's card_number reads when
    // prefixed with its set ("OP01-001"). Some upstream catalogs store
    // this directly in card_number (kingdom-087 cardrush style); others
    // store just the trailing digits ("001"). Both shapes must match.
    const card_number_full = setNum && !card_number_norm.includes("-")
      ? `${set_code_norm}-${card_number_norm}`
      : card_number_norm;

    // Confidence ladder — first hit wins.
    let confidence: ResolveConfidence = "none";
    let reason = "no field matched";

    // Tier 1: canonical SKU exact (covers `op-op01-001-ja`), bridged
    //         across SKU generations via normalizeSku so the documented
    //         canonical form finds its legacy-cased row and vice versa.
    if (
      c.sku.toLowerCase() === inputSkuLower ||
      (inputSkuCanonical !== null && normalizeSku(c.sku) === inputSkuCanonical)
    ) {
      confidence = "exact";
      reason = "canonical SKU exact";
    }
    // Tier 2: set+number matches the full publisher form
    //         (covers card_number stored as "OP01-001" with set_code "OP01"
    //         — the common case in wholesale today; verified live
    //         2026-05-14 with 5 SKU variants on op-op01-001).
    else if (
      setNum &&
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
      setNum &&
      set_code_norm === setNum.set &&
      card_number_norm === setNum.number
    ) {
      confidence = "exact";
      reason = "set+number matched";
    }
    // Tier 4: set+number suffix match (defensive — handles legacy
    //         "OP-OP01-001" double-prefix forms).
    else if (
      setNum &&
      card_number_norm.endsWith("-" + setNum.number) &&
      set_code_norm === setNum.set
    ) {
      confidence = "exact";
      reason = "set+number matched (suffixed)";
    }
    // Tier 5: number-only input. Multiple matches expected; UI lists them.
    else if (
      !setNum &&
      (card_number_norm === norm ||
        card_number_norm.endsWith(`-${norm}`))
    ) {
      confidence = "fuzzy";
      reason = "card number matched; set ambiguous";
    }
    // Tier 6: the query appears inside the card number (e.g. "OP01-001"
    //         also surfaces "OP01-0010" via wholesale's substring ILIKE).
    else if (card_number_norm.includes(setNum ? `${setNum.set}-${setNum.number}` : norm)) {
      confidence = "fuzzy";
      reason = "card number contains query";
    }
    // Tier 6b: SKU-shaped input — same physical card (set + number),
    //          different print/lang tail. The old scorer kept these as
    //          generic fuzzy rows; without this tier a canonical-SKU
    //          query whose exact print isn't in the catalog would drop
    //          its siblings and render "No cards matched".
    else if (
      skuShape &&
      set_code_norm === skuShape.set.toUpperCase() &&
      (card_number_norm === `${skuShape.set.toUpperCase()}-${skuShape.number.toUpperCase()}` ||
        card_number_norm === skuShape.number.toUpperCase() ||
        card_number_norm.endsWith(`-${skuShape.number.toUpperCase()}`))
    ) {
      confidence = "fuzzy";
      reason = "same card, different print";
    }
    // Tier 7: name match (separator-insensitive — "Monkey D Luffy"
    //         matches catalog "Monkey.D.Luffy").
    else if (
      foldedName.length > 0 &&
      (foldNameForCompare(c.name ?? "").includes(foldedName) ||
        foldNameForCompare(c.name_en ?? "").includes(foldedName))
    ) {
      confidence = "fuzzy";
      reason = "name matched";
    }
    // Tier 8: rows from the wholesale similarity retry matched on trigram
    //         closeness, not substring — say exactly that.
    else if (similarityMode) {
      confidence = "fuzzy";
      reason = "name similar (typo-tolerant match)";
    }

    return {
      sku: c.sku,
      card_number: c.card_number,
      set_code: c.set_code,
      set_name: c.set_name ?? null,
      name: c.name ?? c.card_number,
      name_en: c.name_en,
      image_url: c.image_url,
      lang: parsed?.lang ?? null,
      variant: parsed?.variant ?? null,
      rarity: c.rarity ?? null,
      // 0 means "no current price" platform-wide (see SiblingRow's
      // has_current_price) — fold it to null so list UIs don't show £0.00.
      price_gbp:
        typeof c.price_gbp === "number" && c.price_gbp > 0 ? c.price_gbp : null,
      in_stock: (c.stock ?? 0) > 0,
      confidence,
      reason,
    };
  });

  const kept = matches.filter((m) => m.confidence !== "none");

  // Order: exact first; within a confidence band, sellable cards first
  // (in stock, then priced), then alphabetic key for stability.
  return kept.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === "exact" ? -1 : 1;
    }
    if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
    const aPriced = a.price_gbp !== null;
    const bPriced = b.price_gbp !== null;
    if (aPriced !== bPriced) return aPriced ? -1 : 1;
    const aKey = `${a.set_code ?? ""}-${a.card_number}-${a.lang ?? ""}`;
    const bKey = `${b.set_code ?? ""}-${b.card_number}-${b.lang ?? ""}`;
    return aKey.localeCompare(bKey);
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
    const key = `${m.set_code ?? "_"}-${m.card_number}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  return groups;
}

/**
 * Rank the prints inside a single (set, number) bucket to decide which
 * one the fold should open. The old behavior took candidates[0] in
 * alphabetic order — which for OP01-001 landed on a Japanese manga-art
 * parallel instead of the base print. Preference order:
 *
 *   1. Requested language (when ?lang= given; ISO-normalized both sides)
 *   2. Base print (card name carries no variant/promo/parallel markers)
 *   3. In stock at Cambridge TCG
 *   4. Has a current price
 *   5. Alphabetic SKU (stability)
 *
 * Returns the winner plus a human-readable reason — the page renders it
 * so the choice is transparent rather than silent.
 */
export function rankFoldCandidates(
  candidates: readonly ResolvedMatch[],
  requestedLang?: string,
): { winner: ResolvedMatch; fold_reason: string } {
  const langNorm = requestedLang
    ? (normalizeLangCode(requestedLang) ?? requestedLang.toLowerCase())
    : null;

  const scored = candidates.map((m) => {
    const mLangIso = m.lang ? (normalizeLangCode(m.lang) ?? m.lang) : null;
    const langMatch = langNorm !== null && mLangIso === langNorm;
    const basePrint = !nameHasVariantMarkers(m.name ?? "");
    const score =
      (langMatch ? 8 : 0) +
      (basePrint ? 4 : 0) +
      (m.in_stock ? 2 : 0) +
      (m.price_gbp !== null ? 1 : 0);
    return { m, langMatch, basePrint, score };
  });

  scored.sort((a, b) => b.score - a.score || a.m.sku.localeCompare(b.m.sku));
  const top = scored[0]!;

  const parts: string[] = [];
  if (top.langMatch && langNorm) parts.push(`requested language (${langNorm})`);
  if (top.basePrint) parts.push("base print");
  if (top.m.in_stock) parts.push("in stock");
  else if (top.m.price_gbp !== null) parts.push("priced");
  if (parts.length === 0) parts.push("first print alphabetically");

  // Transparency: a requested language that no print satisfies must be
  // named, not silently dropped.
  const langMiss = langNorm !== null && !top.langMatch;

  return {
    winner: top.m,
    fold_reason:
      candidates.length > 1
        ? `${langMiss ? `no ${langNorm} print available — ` : ""}chose ${parts.join(" · ")} of ${candidates.length} prints`
        : langMiss
          ? `only print (no ${langNorm} print available)`
          : "only print",
  };
}

/**
 * Summary classifier the endpoint surfaces so a UI can render a
 * substrate-honest disambiguation message. `ambiguous` means the user
 * still has a choice to make at the strongest confidence we found —
 * fuzzy noise below an exact match no longer flags the result ambiguous.
 */
export function summarizeMatches(
  matches: readonly ResolvedMatch[],
  opts?: {
    /** Wholesale's total row count for the query, when it exceeds what
     *  was fetched — lets the UI say "showing N of T". */
    upstream_total?: number;
  },
): {
  count: number;
  best_confidence: ResolveConfidence;
  distinct_set_number_buckets: number;
  ambiguous: boolean;
  /** Total matching rows upstream (≥ count when the fetch was capped). */
  upstream_total: number;
  truncated: boolean;
} {
  if (matches.length === 0) {
    return {
      count: 0,
      best_confidence: "none",
      distinct_set_number_buckets: 0,
      ambiguous: false,
      upstream_total: opts?.upstream_total ?? 0,
      truncated: false,
    };
  }
  const buckets = groupSiblings(matches);
  const hasExact = matches.some((m) => m.confidence === "exact");
  const best: ResolveConfidence = hasExact ? "exact" : "fuzzy";
  // Ambiguity is judged at the best confidence tier: if an exact match
  // exists, only exact buckets count (fuzzy extras are listed, not
  // blocking); otherwise all fuzzy buckets count.
  const bestBuckets = groupSiblings(matches.filter((m) => m.confidence === best));
  const upstream_total = Math.max(opts?.upstream_total ?? 0, matches.length);
  return {
    count: matches.length,
    best_confidence: best,
    distinct_set_number_buckets: buckets.size,
    ambiguous: bestBuckets.size > 1,
    upstream_total,
    truncated: upstream_total > matches.length,
  };
}
