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
 * Public, aggregate rights NOASSERTION. SKU structure is Cambridge-authored,
 * but names and image references are upstream-derived fields. The composer at
 * /api/v1/cards/[sku]/everything is the next step.
 */

import { NextRequest } from "next/server";
import { resolveGameToken } from "@cambridge-tcg/sku";
import { fetchSearchCandidates } from "@/lib/search/catalog-lookup";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  scoreMatches,
  summarizeMatches,
  parseSetNumberShape,
  parseSearchSku,
  type ResolvedMatch,
} from "@/lib/search/resolver";

export const runtime = "nodejs";

const ENDPOINT = "/api/v1/search/cards";

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

  // Teaching hints are host-qualified full URLs pointing at doors that
  // actually open on that host. (The previous hint said "/api/v1/games",
  // which 404s on cambridgetcg.com and is auth-walled on the wholesale
  // host — verified live 2026-07-05. Misdirection is worse than silence.)
  if (!game) {
    return errorResponse({
      code: "MISSING_PARAM",
      message:
        "?game is required (e.g. ?game=op or ?game=pkm). " +
        "The catalog's game list is at https://cambridgetcg.com/api/v1/universal/games; " +
        "the human-browsable price guide at https://cambridgetcg.com/prices names each game's slug.",
      details: {
        param: "game",
        examples: ["op", "pkm"],
        list_games: "https://cambridgetcg.com/api/v1/universal/games",
      },
      endpoint: ENDPOINT,
    });
  }
  if (!q) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "?q is required (e.g. ?q=OP01-001 or ?q=001).",
      details: { param: "q" },
      endpoint: ENDPOINT,
    });
  }

  // Pre-parse the query so we can pass the most specific filter to the
  // wholesale prices route. When the input is `SET-NUM`, the `q=` filter
  // matches the cardNumber column (ilike); the wholesale route already
  // returns one row per language variant. When the input is the full
  // canonical SKU, we use it directly. Otherwise pass the raw token.
  const setNum = parseSetNumberShape(q);
  const skuShape = parseSearchSku(q);
  const gameCode = resolveGameToken(game);
  if (!gameCode || gameCode === "tst" || (skuShape && skuShape.game !== gameCode)) {
    return errorResponse({ code: "INVALID_INPUT", message: "Choose a registered public game that agrees with the supplied SKU.", details: { param: "game" }, endpoint: ENDPOINT });
  }
  if (q.length > 256) {
    return errorResponse({ code: "INVALID_INPUT", message: "Search query must be at most 256 characters.", details: { param: "q" }, endpoint: ENDPOINT });
  }

  // Decide what to send to the wholesale prices route. The wholesale
  // route's `q=` does an ILIKE on cardNumber + name + name_en, so any of
  // these forms will surface the candidate rows; the resolver scores them.
  const wholesaleQ = skuShape
    ? `${skuShape.set}-${skuShape.number}`
    : setNum ? `${setNum.set}-${setNum.number}` : q;

  const wholesaleResp = await fetchSearchCandidates({
    game: gameCode,
    q: wholesaleQ,
    limit,
  });

  if (wholesaleResp.source === "unavailable") {
    return errorResponse({ code: "SOURCE_UNAVAILABLE", message: "Card search could not reach its catalog source. Try again later.", endpoint: ENDPOINT });
  }

  if (wholesaleResp.items.length === 0) {
    // Substrate-honest empty: don't pretend an error occurred. Empty
    // matches array + summary.count=0 + ambiguous=false.
    return jsonResponse({
      endpoint: ENDPOINT,
      data: {
        input: { game, q },
        lookup: { limit, truncated: wholesaleResp.truncated },
        matches: [] as ResolvedMatch[],
        summary: summarizeMatches([]),
      },
      sources: ["wholesale-rds.cards"],
      source_license: ["proprietary"],
      freshness: "market_signal",
      license: "NOASSERTION",
    });
  }

  const matches = scoreMatches({ game: gameCode, q }, wholesaleResp.items);
  const summary = summarizeMatches(matches);

  return jsonResponse({
    endpoint: ENDPOINT,
    data: {
      input: { game, q },
      lookup: { limit, truncated: wholesaleResp.truncated },
      matches,
      summary,
      next_step: matches.length > 0
        ? `/api/v1/cards/${encodeURIComponent(matches[0]!.sku)}/everything`
        : null,
    },
    sources: ["wholesale-rds.cards"],
    source_license: ["proprietary"],
    freshness: "market_signal",
    license: "NOASSERTION",
  });
}
