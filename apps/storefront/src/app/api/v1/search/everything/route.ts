/**
 * GET /api/v1/search/everything?game=<code|slug>&q=<input>&lang?=<iso>
 *
 * The convenience endpoint of kingdom-090. Combines the resolver
 * (/api/v1/search/cards) and the composer
 * (/api/v1/cards/[sku]/everything) into one round-trip for the common
 * case: caller has (game, card_number) and wants everything immediately.
 *
 * Response semantics:
 *   - **best_confidence === "exact"** + ≤1 distinct sibling group →
 *     fold the matched SKU's composer payload into `data.everything`
 *     (optionally picking the requested lang variant).
 *   - **best_confidence === "exact"** + multiple sibling groups →
 *     return `data.everything = null` + `data.matches` so the caller
 *     can disambiguate.
 *   - **best_confidence === "fuzzy"** → return `data.matches` only.
 *   - **count === 0** → 200 with empty matches + null everything
 *     (substrate-honest empty; not 404 — the question itself was valid).
 *
 * ── Why this exists alongside /search/cards + /cards/[sku]/everything
 *
 * Two-round-trip clients (typed partner integrations) call the two
 * endpoints separately and choose the SKU client-side. One-round-trip
 * clients (the storefront's own /prices/search page, agents wanting
 * the POOF in one fetch) call this convenience endpoint and let the
 * server decide whether the input was unambiguous enough to fold the
 * composer.
 *
 * ── Inputs ─────────────────────────────────────────────────────────
 *
 * Required: `?game=<code-or-slug>` + `?q=<input>` (same as
 * /search/cards — see that route for input shapes).
 *
 * Optional: `?lang=<iso>` — pick the language variant when multiple
 * exist. Without it, the resolver picks the first exact match in its
 * sorted order (alphabetic by lang).
 */

import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  scoreMatches,
  summarizeMatches,
  parseSetNumberShape,
  parseSkuShape,
  groupSiblings,
  type ResolvedMatch,
} from "@/lib/search/resolver";
import { fetchPrices, fetchGames } from "@/lib/wholesale/client";

export const runtime = "nodejs";

/** Mirror of /search/cards' game resolver — accepts code / slug / name
 *  in any case and returns the canonical `games.code` the wholesale
 *  prices route will match exactly. See that route for the longform
 *  rationale (case-sensitive postgres eq + multiple legacy forms). */
async function resolveGameToken(input: string): Promise<string> {
  const games = await fetchGames().catch(() => []);
  if (games.length === 0) return input;
  const norm = input.trim().toLowerCase();
  for (const g of games) {
    if (g.code === input || g.slug === input || g.name === input) return g.code;
  }
  for (const g of games) {
    if (
      g.code.toLowerCase() === norm ||
      g.slug.toLowerCase() === norm ||
      g.name.toLowerCase() === norm
    ) {
      return g.code;
    }
  }
  return input;
}

function originFromReq(req: NextRequest): string {
  // Prefer x-forwarded-host (Vercel sets it); fall back to req URL.
  const proto =
    req.headers.get("x-forwarded-proto") ??
    new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const game = (url.searchParams.get("game") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const lang = (url.searchParams.get("lang") ?? "").trim().toLowerCase();
  const limit = 50;

  if (!game || !q) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "?game and ?q are both required (e.g. ?game=op&q=OP01-001).",
      details: { game, q },
    });
  }

  // Same wholesale fetch logic as /search/cards (no shared helper since
  // each endpoint owns its envelope shape).
  const setNum = parseSetNumberShape(q);
  const skuShape = parseSkuShape(q);
  const wholesaleQ = setNum
    ? `${setNum.set}-${setNum.number}`
    : skuShape
      ? `${skuShape.set}-${skuShape.number}`
      : q;

  const resolvedGame = await resolveGameToken(game);
  const wholesaleResp = await fetchPrices({ game: resolvedGame, q: wholesaleQ, limit });
  const matches: ResolvedMatch[] = scoreMatches({ game, q }, wholesaleResp.items);
  const summary = summarizeMatches(matches);

  // ── Decide: fold composer payload, or return matches only? ────────
  //
  // Fold conditions (all must hold):
  //   1. At least one exact match exists.
  //   2. Exactly one distinct (set, number) bucket — multiple language
  //      variants of the same physical card is OK; lang= picks among them.
  let foldedSku: string | null = null;
  if (summary.count > 0 && summary.best_confidence === "exact") {
    const exactMatches = matches.filter((m) => m.confidence === "exact");
    const groups = groupSiblings(exactMatches);
    if (groups.size === 1) {
      // Pick lang= variant if specified, else the first exact match.
      const candidates = Array.from(groups.values())[0]!;
      const preferred =
        lang && candidates.find((m) => m.lang === lang);
      foldedSku = preferred ? preferred.sku : candidates[0]!.sku;
    }
  }

  // ── Fold the composer when we can ─────────────────────────────────
  // Call the local composer endpoint over HTTP. Cleaner than importing
  // the route's handler — keeps the composer's caching layer intact and
  // produces identical envelope shape whether the caller hit /everything
  // directly or via this convenience route.
  let everything: unknown = null;
  let composer_call: "ok" | "absent" | "error" = "absent";
  if (foldedSku) {
    try {
      const origin = originFromReq(req);
      const composerUrl = `${origin}/api/v1/cards/${encodeURIComponent(foldedSku)}/everything`;
      const composerRes = await fetch(composerUrl, {
        // Use Vercel's edge cache; freshness budget is in the composer.
        next: { revalidate: 300 },
        // Don't forward arbitrary headers — keep this server-to-server
        // call hygienic.
        headers: { Accept: "application/json" },
      });
      if (composerRes.ok) {
        const body = await composerRes.json();
        // Unwrap composer's envelope; this endpoint wraps in its own.
        everything = body?.data ?? null;
        composer_call = "ok";
      } else {
        composer_call = "error";
      }
    } catch {
      composer_call = "error";
    }
  }

  return jsonResponse({
    endpoint: "/api/v1/search/everything",
    data: {
      input: { game, q, lang: lang || null },
      matches,
      summary,
      folded_sku: foldedSku,
      everything,
      composition: {
        composer_call,
      },
    },
    sources: foldedSku
      ? ["wholesale-rds.cards", "ctcg-storefront"]
      : ["wholesale-rds.cards"],
    freshness: "market_signal",
  });
}
