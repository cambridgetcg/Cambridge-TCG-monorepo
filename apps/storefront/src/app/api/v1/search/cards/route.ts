/**
 * GET /api/v1/search/cards?game=<code|slug>&q=<input>&limit?=N&offset?=N
 *
 * The resolver half of kingdom-090 — turn (game, query) into one or
 * more canonical SKU candidates with confidence labels. Pure-compute
 * over `apps/storefront/src/lib/search/resolver.ts` + the wholesale
 * `cards` table (via the shared `searchWholesale` query path).
 *
 * Yu's directive 2026-05-14: *"IDEALLY I WOULD ONLY NEED TO PUT IN THE
 * CARD NUMBER AND FILTER FOR CARD GAME THEN POOF!!!! PRICE,
 * TRANSACTION HISTORIES, AVAILABLE SOURCES, DIFFERENT LANGUAGE ALL
 * POPS UP!"*
 *
 * ── Inputs ─────────────────────────────────────────────────────────
 *
 * Required: `?game=<code-or-slug>` — `op`, `pkm`, `mtg`, etc. (Codes
 * AND slugs both accepted; resolved once against the cached games/sets
 * registries — no more trial-and-error probing.)
 *
 * Required: `?q=<input>` (2–100 chars) — one of:
 *   - `OP01-001`            (set + number, any separator style; exact)
 *   - `001`                 (number alone; fuzzy match; UI shows list)
 *   - `op-op01-001-ja`      (full canonical SKU; exact match expected)
 *   - `luffy` / `ルフィ`     (card name; fuzzy, typo-tolerant upstream)
 *
 * Optional: `?limit=N` (default 20, max 100), `?offset=N`.
 *
 * ── Output ─────────────────────────────────────────────────────────
 *
 * `data.matches: ResolvedMatch[]` — sorted exact-first, then in-stock,
 * then priced. Each row carries price_gbp / in_stock / rarity /
 * set_name so list UIs can render something a human can choose between.
 * `data.summary` — count, best_confidence, buckets, ambiguous (judged
 * at the best confidence tier), upstream_total, truncated.
 * `data.resolved_game` — how the game token resolved; `game_known:
 * false` is an honest "we don't recognise that game".
 *
 * ── License ────────────────────────────────────────────────────────
 *
 * Public CC0. The resolver returns identity + our own quote fields only
 * (SKU, names, image URL, CTCG price/stock). The composer at
 * /api/v1/cards/[sku]/everything is the next step.
 */

import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  scoreMatches,
  summarizeMatches,
  MIN_Q_LENGTH,
  MAX_Q_LENGTH,
  MAX_SEARCH_OFFSET,
  type ResolvedMatch,
} from "@/lib/search/resolver";
import { searchWholesale } from "@/lib/search/wholesale-query";

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
  const offset = Math.min(
    Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0),
    MAX_SEARCH_OFFSET,
  );

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
  if (q.length < MIN_Q_LENGTH) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `?q needs at least ${MIN_Q_LENGTH} characters — a single character matches half the catalog.`,
      details: { q },
    });
  }
  if (q.length > MAX_Q_LENGTH) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `?q is capped at ${MAX_Q_LENGTH} characters.`,
      details: { length: q.length },
    });
  }

  const { resp: wholesaleResp, resolved, sent } = await searchWholesale({
    game,
    q,
    limit,
    offset,
  });

  const matches = scoreMatches(
    { game, q, matchMode: wholesaleResp.match_mode },
    wholesaleResp.items,
  );
  const summary = summarizeMatches(matches, {
    upstream_total: wholesaleResp.total || undefined,
  });

  return jsonResponse({
    endpoint: ENDPOINT,
    data: {
      input: { game, q, offset },
      resolved_game: {
        token: resolved.token,
        name: resolved.game_name,
        via: resolved.via,
        game_known: resolved.game_known,
      },
      upstream: wholesaleResp.degraded ? "degraded" : "ok",
      match_mode: sent.mode === "exact-number" ? "exact-number" : (wholesaleResp.match_mode ?? "substring"),
      matches: matches as ResolvedMatch[],
      summary,
      next_step: matches.length > 0
        ? `/api/v1/cards/${encodeURIComponent(matches[0]!.sku)}/everything`
        : null,
    },
    sources: ["wholesale-rds.cards"],
    freshness: "market_signal",
  });
}
