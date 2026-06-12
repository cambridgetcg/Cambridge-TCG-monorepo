/**
 * GET /api/v1/search/everything?game=<code|slug>&q=<input>&lang?=<iso>&offset?=N
 *
 * The convenience endpoint of kingdom-090. Combines the resolver
 * (/api/v1/search/cards) and the composer
 * (/api/v1/cards/[sku]/everything) into one round-trip for the common
 * case: caller has (game, card_number) and wants everything immediately.
 *
 * Response semantics:
 *   - **best_confidence === "exact"** + one distinct exact bucket →
 *     fold the best print's composer payload into `data.everything`.
 *     The print is RANKED, not arbitrary: requested lang > base print >
 *     in stock > priced; `data.fold_reason` says which rule won.
 *   - **best_confidence === "exact"** + multiple exact buckets →
 *     return `data.everything = null` + `data.matches` so the caller
 *     can disambiguate.
 *   - **best_confidence === "fuzzy"** → return `data.matches` only.
 *   - **count === 0** → 200 with empty matches + null everything
 *     (substrate-honest empty; not 404 — the question itself was valid).
 *
 * Substrate-honest extras the envelope carries:
 *   - `data.resolved_game` — how the game token resolved (set-registry /
 *     games-registry / as-given) and the display name; `game_known:
 *     false` when we don't recognise the game at all (previously
 *     indistinguishable from "card not found").
 *   - `data.upstream` — "ok" | "degraded": a Falcon outage is not an
 *     empty catalog and is labelled as such.
 *   - composer `_meta` (sources / source_license / upstream_proxy) is
 *     merged into this envelope when folded — license tiers and proxy
 *     declarations no longer vanish on the convenience path.
 *
 * ── Inputs ─────────────────────────────────────────────────────────
 *
 * Required: `?game=<code-or-slug>` + `?q=<input>` (2–100 chars; same
 * shapes as /search/cards — set-number in any separator style, bare
 * number, canonical SKU, or card name).
 *
 * Optional: `?lang=<iso>` — prefer that language's print when folding
 * (legacy jp/cn tails are ISO-normalized before comparing).
 * Optional: `?offset=N` — pagination through fuzzy match lists.
 */

import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  scoreMatches,
  summarizeMatches,
  groupSiblings,
  rankFoldCandidates,
  MIN_Q_LENGTH,
  MAX_Q_LENGTH,
  MAX_SEARCH_OFFSET,
  type ResolvedMatch,
} from "@/lib/search/resolver";
import { searchWholesale } from "@/lib/search/wholesale-query";
import { composeEverything } from "@/lib/search/composer";

export const runtime = "nodejs";

const LIMIT = 50;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const game = (url.searchParams.get("game") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const lang = (url.searchParams.get("lang") ?? "").trim().toLowerCase();
  const offset = Math.min(
    Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0),
    MAX_SEARCH_OFFSET,
  );

  if (!game || !q) {
    return errorResponse({
      code: "MISSING_PARAM",
      message: "?game and ?q are both required (e.g. ?game=op&q=OP01-001).",
      details: { game, q },
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
    limit: LIMIT,
    offset,
  });

  const matches: ResolvedMatch[] = scoreMatches(
    { game, q, matchMode: wholesaleResp.match_mode },
    wholesaleResp.items,
  );
  const summary = summarizeMatches(matches, {
    upstream_total: wholesaleResp.total || undefined,
  });

  // ── Decide: fold composer payload, or return matches only? ────────
  //
  // Fold conditions (all must hold):
  //   1. At least one exact match exists.
  //   2. Exactly one distinct (set, number) bucket among the EXACT
  //      matches — multiple prints/languages of the same physical card
  //      is OK; the ranker picks the best one and says why.
  let foldedSku: string | null = null;
  let fold_reason: string | null = null;
  if (summary.count > 0 && summary.best_confidence === "exact") {
    const exactMatches = matches.filter((m) => m.confidence === "exact");
    const groups = groupSiblings(exactMatches);
    if (groups.size === 1) {
      const candidates = Array.from(groups.values())[0]!;
      const ranked = rankFoldCandidates(candidates, lang || undefined);
      foldedSku = ranked.winner.sku;
      fold_reason = ranked.fold_reason;
    }
  }

  // ── Fold the composer when we can — in-process, no HTTP self-hop. ──
  let everything: unknown = null;
  let composer_call: "ok" | "absent" | "error" = "absent";
  let composerSources: string[] | null = null;
  let composerLicense: string[] | null = null;
  let composerProxy: string[] | undefined;
  let as_of: string | undefined;
  if (foldedSku) {
    try {
      const composed = await composeEverything(foldedSku, {
        gameHint: resolved.token ?? undefined,
      });
      if (composed.ok) {
        everything = composed.data;
        composerSources = composed.sources;
        composerLicense = composed.source_license;
        composerProxy = composed.upstream_proxy;
        as_of = composed.as_of;
        composer_call = "ok";
      } else {
        composer_call = "error";
      }
    } catch {
      composer_call = "error";
    }
  }

  // Merge composer provenance into this envelope (parallel arrays).
  // Pre-composer behavior dropped license + proxy on the folded path —
  // the page's "Door" column always read "direct". No longer.
  const sources = composerSources ?? ["wholesale-rds.cards"];
  const source_license = composerLicense ?? ["cc0"];
  if (foldedSku && !sources.includes("ctcg-storefront")) {
    sources.push("ctcg-storefront");
    source_license.push("cc0");
    if (composerProxy) composerProxy = [...composerProxy, "none"];
  }

  return jsonResponse({
    endpoint: "/api/v1/search/everything",
    data: {
      input: { game, q, lang: lang || null, offset },
      resolved_game: {
        token: resolved.token,
        name: resolved.game_name,
        via: resolved.via,
        game_known: resolved.game_known,
      },
      upstream: wholesaleResp.degraded ? "degraded" : "ok",
      match_mode: sent.mode === "exact-number" ? "exact-number" : (wholesaleResp.match_mode ?? "substring"),
      matches,
      summary,
      folded_sku: foldedSku,
      fold_reason,
      everything,
      composition: {
        composer_call,
      },
    },
    sources,
    source_license,
    ...(composerProxy ? { upstream_proxy: composerProxy } : {}),
    freshness: "market_signal",
    ...(as_of ? { as_of } : {}),
  });
}
