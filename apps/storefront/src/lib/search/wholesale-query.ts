/**
 * Shared wholesale query path for the search endpoints — kingdom-090.
 *
 * Both /api/v1/search/cards and /api/v1/search/everything previously
 * carried their own copy of a "game-token fallback ladder" that probed
 * wholesale with up to ~6 sequential fetchPrices calls until one
 * returned rows. This module replaces the ladder with a single
 * resolution step against the (cached) games + sets registries, then
 * ONE prices call — with an indexed exact-number fast path when the
 * input parses as SET-NUMBER.
 *
 * Substrate honesty gains:
 *   - "unknown game" becomes a nameable fact (`game_known: false`)
 *     instead of an indistinguishable empty result;
 *   - Falcon outages surface as `degraded: true` instead of masquerading
 *     as "no cards matched".
 */

import { fetchGames, fetchPrices, fetchSets, type PricesResponse } from "@/lib/wholesale/client";
import { parseSetNumberShape, parseSkuShape } from "./resolver";

export interface ResolvedGameToken {
  /** The token to send to wholesale, or null when nothing resolved. */
  token: string | null;
  /** How it resolved — surfaced in _meta for transparency. */
  via: "set-registry" | "games-registry" | "as-given" | null;
  /** Whether the caller's game token matched anything we know. False
   *  means "we don't recognise that game" — render it honestly. */
  game_known: boolean;
  /** Canonical display name when the registry knows it ("One Piece"). */
  game_name: string | null;
}

/**
 * Resolve the caller's game token (code | slug | name, any case) to the
 * token wholesale's /api/v1/prices accepts. Set-based lookup wins when
 * the query carries a set code — every set knows its own game, which
 * bypasses token translation entirely (e.g. SKU prefix `op` vs registry
 * `onepiece`/`one-piece`).
 *
 * Costs at most two CACHED registry fetches (games 600s, sets 600s) and
 * zero prices probes.
 */
export async function resolveGameToken(args: {
  game: string;
  set?: string;
}): Promise<ResolvedGameToken> {
  const [games, sets] = await Promise.all([
    fetchGames().catch(() => []),
    args.set ? fetchSets().catch(() => []) : Promise.resolve([]),
  ]);

  const norm = args.game.trim().toLowerCase();
  const registryMatch = games.find(
    (g) =>
      g.code.toLowerCase() === norm ||
      g.slug.toLowerCase() === norm ||
      g.name.toLowerCase() === norm,
  );

  if (args.set) {
    const setLower = args.set.toLowerCase();
    const matchedSet = sets.find((s) => s.code.toLowerCase() === setLower);
    if (matchedSet) {
      const setGame = games.find((g) => g.code === matchedSet.game_code);
      return {
        token: matchedSet.game_code,
        via: "set-registry",
        // The set resolved regardless; but tell the truth about whether
        // the CALLER's token also matched something.
        game_known: Boolean(registryMatch) || games.length === 0,
        game_name: setGame?.name ?? null,
      };
    }
  }

  if (registryMatch) {
    return {
      token: registryMatch.code,
      via: "games-registry",
      game_known: true,
      game_name: registryMatch.name,
    };
  }

  // Registry unavailable (degraded fetchGames) — pass the token through
  // rather than failing the search outright.
  if (games.length === 0) {
    return { token: args.game, via: "as-given", game_known: true, game_name: null };
  }

  return { token: null, via: null, game_known: false, game_name: null };
}

export interface WholesaleSearchResult {
  resp: PricesResponse;
  resolved: ResolvedGameToken;
  /** The q/number actually sent to wholesale (for _meta echo). */
  sent: { mode: "exact-number" | "substring"; set?: string; number?: string; q?: string };
}

/**
 * One search → one (occasionally two) wholesale calls.
 *
 *   SET-NUMBER input → exact-number mode on indexed columns, with a
 *   single substring fallback when exact returns empty (covers catalogs
 *   that store the number in a shape the exact arms don't cover yet).
 *
 *   Anything else → substring q with relevance ordering; wholesale runs
 *   its own typo-tolerant similarity retry on zero hits and reports
 *   `match_mode` so reasons stay honest.
 */
export async function searchWholesale(args: {
  game: string;
  q: string;
  limit: number;
  offset?: number;
}): Promise<WholesaleSearchResult> {
  const setNum = parseSetNumberShape(args.q);
  const skuShape = setNum ? null : parseSkuShape(args.q);
  const set = setNum?.set ?? skuShape?.set;

  const resolved = await resolveGameToken({ game: args.game, set });

  if (!resolved.token) {
    return {
      resp: { count: 0, total: 0, channel: "", items: [] },
      resolved,
      sent: { mode: "substring", q: args.q },
    };
  }

  const exact = setNum ?? skuShape;
  if (exact) {
    const sent = { mode: "exact-number" as const, set: exact.set, number: exact.number };
    const joined = `${exact.set}-${exact.number}`;
    // Send number= AND q= together: a wholesale deploy that already
    // understands ?number takes the indexed exact path and ignores q;
    // an older deploy ignores ?number and answers the q substring —
    // either way one call returns usable rows (deploy-order safe; the
    // scorer downgrades substring noise honestly). A deploy that
    // honored number= echoes match_mode; its absence means the rows
    // came from the substring path.
    const resp = await fetchPrices({
      game: resolved.token,
      number: joined,
      q: joined,
      limit: args.limit,
      offset: args.offset,
    });
    if (resp.items.length > 0 || resp.degraded) {
      const honored = resp.match_mode !== undefined;
      return {
        resp,
        resolved,
        sent: honored ? sent : { mode: "substring", q: joined },
      };
    }
    // Exact arms missed — one substring fallback with the joined token.
    const fallback = await fetchPrices({
      game: resolved.token,
      q: joined,
      limit: args.limit,
      offset: args.offset,
    });
    if (fallback.items.length > 0 || fallback.degraded) {
      return { resp: fallback, resolved, sent: { mode: "substring", q: joined } };
    }
    // Still nothing, and folding separators changed the input ("Gear 5"
    // became "GEAR-5"): the input may have been a NAME with a trailing
    // number, not a set+number at all. One last try with the user's raw
    // text so wholesale's name ILIKE (+ typo retry) finally sees it —
    // this preserves the pre-overhaul guarantee that raw q always
    // reaches the catalog before we answer "no matches".
    const rawNorm = args.q.trim();
    if (rawNorm.toUpperCase() !== joined.toUpperCase()) {
      const rawResp = await fetchPrices({
        game: resolved.token,
        q: rawNorm,
        sort: "relevance",
        fuzzy: true,
        limit: args.limit,
        offset: args.offset,
      });
      return { resp: rawResp, resolved, sent: { mode: "substring", q: rawNorm } };
    }
    return { resp: fallback, resolved, sent: { mode: "substring", q: joined } };
  }

  const resp = await fetchPrices({
    game: resolved.token,
    q: args.q,
    sort: "relevance",
    fuzzy: true,
    limit: args.limit,
    offset: args.offset,
  });
  return { resp, resolved, sent: { mode: "substring", q: args.q } };
}
