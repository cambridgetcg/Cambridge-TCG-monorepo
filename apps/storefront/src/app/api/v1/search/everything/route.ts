/**
 * GET /api/v1/search/everything?game=<code|slug>&q=<input>&lang?=<iso>
 *
 * The convenience endpoint of kingdom-090. Combines the resolver
 * (/api/v1/search/cards) and the composer
 * (/api/v1/cards/[sku]/everything) into one round-trip for the common
 * case: caller has (game, card_number) and wants everything immediately.
 *
 * Response semantics:
 *   - **best_confidence === "exact"** + one printing candidate from a complete lookup →
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
 * Optional: `?lang=<two-letter-code-or-legacy-alias>` narrows candidates.
 * Multiple variants, missing requested languages and truncated candidate
 * pages require a choice; no arbitrary first printing is selected.
 */

import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  scoreMatches,
  summarizeMatches,
  parseSetNumberShape,
  parseSearchSku,
  groupSiblings,
  type ResolvedMatch,
} from "@/lib/search/resolver";
import { normalizeLanguageCode, resolveGameToken } from "@cambridge-tcg/sku";
import { fetchSearchCandidates } from "@/lib/search/catalog-lookup";
import { GET as composeCard } from "@/app/api/v1/cards/[sku]/everything/route";

export const runtime = "nodejs";

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

  // Shared candidate retrieval keeps the requested game fixed.
  const setNum = parseSetNumberShape(q);
  const skuShape = parseSearchSku(q);
  const gameCode = resolveGameToken(game);
  if (!gameCode || gameCode === "tst" || (skuShape && skuShape.game !== gameCode)) {
    return errorResponse({ code: "INVALID_INPUT", message: "Choose a registered public game that agrees with the supplied SKU.", details: { param: "game" }, endpoint: "/api/v1/search/everything" });
  }
  if (q.length > 256 || (lang && !normalizeLanguageCode(lang))) {
    return errorResponse({ code: "INVALID_INPUT", message: "Search query must be at most 256 characters; language must be a supported alias or two-letter code.", endpoint: "/api/v1/search/everything" });
  }
  const wholesaleQ = skuShape
    ? `${skuShape.set}-${skuShape.number}`
    : setNum ? `${setNum.set}-${setNum.number}` : q;

  const wholesaleResp = await fetchSearchCandidates({
    game: gameCode,
    q: wholesaleQ,
    limit,
  });
  if (wholesaleResp.source === "unavailable") {
    return errorResponse({ code: "SOURCE_UNAVAILABLE", message: "Card search could not reach its catalog source. Try again later.", endpoint: "/api/v1/search/everything" });
  }
  const matches: ResolvedMatch[] = scoreMatches({ game: gameCode, q }, wholesaleResp.items);
  const summary = summarizeMatches(matches);

  // ── Decide: fold composer payload, or return matches only? ────────
  //
  // Fold conditions (all must hold):
  //   1. At least one exact match exists.
  //   2. Exactly one eligible printing from a complete candidate page.
  //      Language filters narrow the choice; variants remain distinct.
  let foldedSku: string | null = null;
  if (!wholesaleResp.truncated && summary.count > 0 && summary.best_confidence === "exact") {
    const exactMatches = matches.filter((m) => m.confidence === "exact");
    const groups = groupSiblings(exactMatches);
    if (groups.size === 1) {
      // Apply a language preference without selecting an arbitrary variant.
      const candidates = Array.from(groups.values())[0]!;
      const preferred =
        lang && candidates.find((m) => m.lang === normalizeLanguageCode(lang));
      // A requested language must not silently fall back to another language.
      // Multiple variants need a choice, even when they share a set and number.
      const eligible = lang ? candidates.filter((m) => m.lang === normalizeLanguageCode(lang)) : candidates;
      if (eligible.length === 1) foldedSku = preferred ? preferred.sku : eligible[0]!.sku;
    }
  }

  // ── Fold the composer when we can ─────────────────────────────────
  // Delegate locally with a fresh public GET request. Caller-controlled host,
  // protocol and authorization headers never become an outbound HTTP target
  // or grant this public composition another access level.
  let everything: unknown = null;
  let composer_call: "ok" | "absent" | "error" = "absent";
  if (foldedSku) {
    try {
      const composerRequest = new NextRequest(
        `https://cambridgetcg.com/api/v1/cards/${encodeURIComponent(foldedSku)}/everything`,
        { headers: { Accept: "application/json" } },
      );
      const composerRes = await composeCard(composerRequest, {
        params: Promise.resolve({ sku: foldedSku }),
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
      lookup: { limit, truncated: wholesaleResp.truncated },
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
    source_license: foldedSku
      ? ["proprietary", "proprietary"]
      : ["proprietary"],
    freshness: "market_signal",
    license: "NOASSERTION",
  });
}
