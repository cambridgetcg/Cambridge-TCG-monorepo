/**
 * GET /api/v1/search/cards?game=<code|slug>&q=<input>&limit?=N
 *
 * The resolver half of kingdom-090 — turn (game, query) into one or
 * more canonical SKU candidates with confidence labels. Pure-compute
 * over `apps/storefront/src/lib/search/resolver.ts` + the wholesale
 * `cards` table (via Falcon's `fetchPrices` with q=).
 *
 * Yu's directive 2026-05-14: *"IDEALLY I WOULD ONLY NEED TO PUT IN THE
 * CARD NUMBER AND FILTER FOR CARD GAME THEN POOF!!!! PRICE,
 * TRANSACTION HISTORIES, AVAILABLE SOURCES, DIFFERENT LANGUAGE ALL
 * POPS UP!"*
 *
 * ── Inputs ─────────────────────────────────────────────────────────
 *
 * Required: `?game=<code-or-slug>` — `op`, `pkm`, `mtg`, etc. (Codes
 * AND slugs both accepted; the wholesale prices route resolves either.)
 *
 * Required: `?q=<input>` — one of:
 *   - `OP01-001`            (set + number; exact match expected)
 *   - `001`                 (number alone; fuzzy match; UI shows list)
 *   - `op-op01-001-ja`      (full canonical SKU; exact match expected)
 *
 * Optional: `?limit=N` (default 20, max 100).
 *
 * ── Output ─────────────────────────────────────────────────────────
 *
 * `data.matches: ResolvedMatch[]` — array sorted exact-first.
 * `data.summary: { count, best_confidence, distinct_set_number_buckets, ambiguous }`.
 *
 * Substrate-honest fields per match:
 *   - confidence: "exact" | "fuzzy"
 *   - reason: stable string explaining the score
 *   - lang / variant: parsed from SKU tail when present
 *
 * ── License ────────────────────────────────────────────────────────
 *
 * Public CC0. The resolver returns identity information only (SKU,
 * names, image URL) — no price data. The composer at
 * /api/v1/cards/[sku]/everything is the next step.
 */

import { NextRequest } from "next/server";
import { fetchPrices, fetchGames, fetchSets } from "@/lib/wholesale/client";
import { jsonResponse, errorResponse, invalidSkuError } from "@/lib/data-pantry";
import {
  scoreMatches,
  summarizeMatches,
  parseSetNumberShape,
  parseSkuShape,
  type ResolvedMatch,
} from "@/lib/search/resolver";

export const runtime = "nodejs";

const ENDPOINT = "/api/v1/search/cards";

/**
 * Try the caller's game token against the wholesale prices route,
 * with progressive fallback variants. The wholesale route's
 * `or(eq(games.code, X), eq(games.slug, X))` filter is case-sensitive
 * — so `game=op` may return nothing when the registry stores
 * `code='onepiece'`/`slug='one-piece'`, and there's no character
 * relationship between the SKU prefix and the wholesale code/slug.
 *
 * Resolution order (most reliable first):
 *
 *   0. Set-based lookup — if the caller's input parses to a known set,
 *      look the set up in wholesale (`fetchSets`) and use its declared
 *      `game_code`. Every set knows its own game; this bypasses any
 *      game-token translation. Mirrors the composer's `fetchSiblings`
 *      pattern at /api/v1/cards/[sku]/everything.
 *   1. Input as-given (preserves callers who pass the exact form).
 *   2. Registry-canonical via `fetchGames()` — exact then case-insensitive.
 *   3. Case variants of the input.
 *
 * Returns the first variant that yields at least one card row, or the
 * empty fetch result if all fail. The caller surfaces a 0-match
 * response with the original input echoed back (substrate-honest).
 */
async function fetchPricesWithGameFallback(args: {
  game: string;
  q: string;
  limit: number;
  /** When the input parses to a SET-NUMBER or canonical SKU, pass the
   *  set code here. We'll use wholesale's own sets→game_code mapping
   *  to bypass game-token translation entirely. */
  set?: string;
}): Promise<Awaited<ReturnType<typeof fetchPrices>>> {
  const seen = new Set<string>();
  const tried: string[] = [];

  async function tryGame(g: string) {
    if (!g || seen.has(g)) return null;
    seen.add(g);
    tried.push(g);
    const r = await fetchPrices({ game: g, q: args.q, limit: args.limit });
    if (r.items.length > 0) return r;
    return null;
  }

  // 0. Set-based lookup — most reliable; uses wholesale's own data to
  //    translate. Covers the case where the caller's game token doesn't
  //    correspond to any wholesale code/slug (e.g. SKU prefix `op` vs
  //    wholesale `onepiece`/`one-piece` — no character relationship).
  if (args.set) {
    const setLower = args.set.toLowerCase();
    const sets = await fetchSets().catch(() => []);
    const matchedSet = sets.find((s) => s.code.toLowerCase() === setLower);
    if (matchedSet) {
      const r0 = await tryGame(matchedSet.game_code);
      if (r0) return r0;
    }
  }

  // 1. Input as-given.
  const r1 = await tryGame(args.game);
  if (r1) return r1;

  // 2. Registry-canonical (when fetchGames() returns). Two passes:
  //      a. Exact equality on raw input (preserves case-sensitive callers).
  //      b. Case-insensitive equality.
  const games = await fetchGames().catch(() => []);
  const norm = args.game.trim().toLowerCase();
  const match =
    games.find(
      (g) => g.code === args.game || g.slug === args.game || g.name === args.game,
    ) ??
    games.find(
      (g) =>
        g.code.toLowerCase() === norm ||
        g.slug.toLowerCase() === norm ||
        g.name.toLowerCase() === norm,
    );
  if (match) {
    const r2 = await tryGame(match.code);
    if (r2) return r2;
    const r3 = await tryGame(match.slug);
    if (r3) return r3;
  }

  // 3 / 4. Case variants of the input.
  const r4 = await tryGame(args.game.toLowerCase());
  if (r4) return r4;
  const r5 = await tryGame(args.game.toUpperCase());
  if (r5) return r5;

  // All fallbacks exhausted — return the last attempt's empty body.
  // The Falcon already returns a non-null { items: [] } envelope on
  // zero matches, so we synthesize one here too.
  return { count: 0, total: 0, channel: "", items: [] };
}

function parseLimit(raw: string | null): number {
  const n = parseInt(raw ?? "20", 10);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const game = (url.searchParams.get("game") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));

  if (!game) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "?game is required (e.g. ?game=op or ?game=pkm). List games at /api/v1/games or browse /prices.",
      details: { param: "game" },
    });
  }
  if (!q) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "?q is required (e.g. ?q=OP01-001 or ?q=001).",
      details: { param: "q" },
    });
  }

  // Pre-parse the query so we can pass the most specific filter to the
  // wholesale prices route. When the input is `SET-NUM`, the `q=` filter
  // matches the cardNumber column (ilike); the wholesale route already
  // returns one row per language variant. When the input is the full
  // canonical SKU, we use it directly. Otherwise pass the raw token.
  const setNum = parseSetNumberShape(q);
  const skuShape = parseSkuShape(q);

  // Decide what to send to the wholesale prices route. The wholesale
  // route's `q=` does an ILIKE on cardNumber + name + name_en, so any of
  // these forms will surface the candidate rows; the resolver scores them.
  const wholesaleQ = setNum
    ? `${setNum.set}-${setNum.number}`
    : skuShape
      ? `${skuShape.set}-${skuShape.number}`
      : q;

  const wholesaleResp = await fetchPricesWithGameFallback({
    game,
    q: wholesaleQ,
    limit,
    set: setNum?.set ?? skuShape?.set,
  });

  if (wholesaleResp.items.length === 0) {
    // Substrate-honest empty: don't pretend an error occurred. Empty
    // matches array + summary.count=0 + ambiguous=false.
    return jsonResponse({
      endpoint: ENDPOINT,
      data: {
        input: { game, q },
        matches: [] as ResolvedMatch[],
        summary: summarizeMatches([]),
      },
      sources: ["wholesale-rds.cards"],
      freshness: "market_signal",
    });
  }

  const matches = scoreMatches({ game, q }, wholesaleResp.items);
  const summary = summarizeMatches(matches);

  return jsonResponse({
    endpoint: ENDPOINT,
    data: {
      input: { game, q },
      matches,
      summary,
      next_step: matches.length > 0
        ? `/api/v1/cards/${encodeURIComponent(matches[0]!.sku)}/everything`
        : null,
    },
    sources: ["wholesale-rds.cards"],
    freshness: "market_signal",
  });
}

// `invalidSkuError` is referenced from the convenience endpoint that
// shares this module's helpers; keep the import alive so a future
// refactor can call it without re-adding the import.
void invalidSkuError;
