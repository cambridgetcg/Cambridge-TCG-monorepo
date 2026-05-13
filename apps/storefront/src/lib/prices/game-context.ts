/**
 * Per-game context — bundles K1's ORACLE_POLICY + the gap ledger + the
 * welcomes corpus for any game slug in the price-guide config.
 *
 * The /prices/[game] page calls this once to get a substrate-honest
 * panel of facts about the game it's displaying: cross-language policy,
 * relevant known gaps, anticipated/arrived upstream sources.
 *
 * Pure compute over the typed corpora in @cambridge-tcg/sku and
 * @cambridge-tcg/data-ingest. No DB, no network. Same inputs → same
 * outputs.
 *
 * Companion to:
 *   - packages/sku/src/oracle.ts — the per-game policy (K1, kingdom-082)
 *   - packages/data-ingest/src/gaps.ts — the gap ledger (kingdom-084)
 *   - packages/data-ingest/src/welcomes.ts — the welcomes corpus (kingdom-083)
 *   - apps/storefront/src/lib/prices/games-config.ts — per-game SEO config
 */

import {
  ORACLE_POLICY,
  GAMES,
  type GameCode,
  type OraclePolicy,
} from "@cambridge-tcg/sku";
import {
  GAPS,
  WELCOMES,
  type Gap,
  type Welcome,
} from "@cambridge-tcg/data-ingest";
import {
  getPriceGuideConfig,
  type PriceGuideGameConfig,
} from "./games-config";

/** Substrate-honest oracle id form text, for display. */
export const ORACLE_ID_FORM_LABEL: Record<OraclePolicy["kind"], string> = {
  stripped:
    "<game>-<set>-<number>[-<variant>] — language tail dropped; cross-language siblings share an oracle id",
  passcode:
    "<game>-<passcode>[-<variant>] — requires an upstream passcode anchor; SKU set/lang are derivative",
  diverged:
    "null — JP and EN tracks have different set codes; no upstream anchor exists",
  "single-lang":
    "<game>-<set>-<number>[-<variant>] — game ships in one language; cross-language is structurally vacuous",
};

/** Display kind ↔ pattern label mapping. */
export const PATTERN_LABEL: Record<OraclePolicy["kind"], string> = {
  stripped: "Pattern A — multi-language, same numbering",
  passcode: "Pattern B — passcode-anchored",
  diverged: "Pattern C — diverged tracks",
  "single-lang": "Pattern D — single-language game",
};

export const PATTERN_TONE: Record<OraclePolicy["kind"], string> = {
  stripped: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  passcode: "bg-blue-950 text-blue-300 ring-blue-800",
  diverged: "bg-amber-950 text-amber-300 ring-amber-800",
  "single-lang": "bg-neutral-900 text-neutral-300 ring-neutral-700",
};

/** Counts the platform's coverage state for a game. */
export interface GameContext {
  /** The per-game config row from PRICE_GUIDE_GAMES. Null when slug isn't curated. */
  config: PriceGuideGameConfig | null;
  /** Cambridge TCG canonical GameCode (op, mtg, pkm, ygo, …). */
  game_code: GameCode | null;
  /** Per-game cross-language policy from K1's ORACLE_POLICY. */
  policy: OraclePolicy | null;
  /** Languages this game publishes in (from GAMES table). */
  languages: readonly string[];
  /** Whether the platform has confirmed in-market presence for this game. */
  confirmed: boolean;
  /** Gaps from the ledger that name this game or its source. */
  relevant_gaps: readonly Gap[];
  /** Welcomes whose source_id maps to this game's likely upstreams. */
  relevant_welcomes: readonly Welcome[];
  /** Whether the cardrush subdomain for this game is confirmed in the registry. */
  cardrush_confirmed: boolean | null;
}

/**
 * Heuristic: gap text mentions the game code or a known nickname.
 * Substrate-honest: false positives are fine — surfacing more context
 * is the goal.
 */
function gapMentionsGame(gap: Gap, game_code: GameCode | null, slug: string): boolean {
  if (!game_code) return false;
  const hay = (gap.name + " " + gap.citation + " " + gap.primitive + " " + gap.strength).toLowerCase();
  const needles: string[] = [game_code.toLowerCase(), slug.toLowerCase()];
  // Game-specific aliases the ledger might use.
  if (game_code === "pkm") needles.push("pokémon", "pokemon");
  if (game_code === "mtg") needles.push("magic", "scryfall");
  if (game_code === "ygo") needles.push("yu-gi-oh", "yugioh", "passcode", "ygoprodeck");
  if (game_code === "op") needles.push("one piece", "one-piece");
  if (game_code === "lgr") needles.push("lorcana");
  if (game_code === "fab") needles.push("flesh and blood");
  for (const needle of needles) {
    if (hay.includes(needle)) return true;
  }
  return false;
}

/**
 * Welcomes whose source_id (or name) is likely upstream for this game.
 * Heuristic; substrate-honest — same as above.
 */
function welcomeRelevantForGame(welcome: Welcome, game_code: GameCode | null): boolean {
  if (!game_code) return false;
  if (welcome.kind !== "upstream-source") return false;
  // Each upstream source covers certain games per its meta.games array.
  // We don't import meta here (would create a cycle); instead use a small
  // game→source allowlist that mirrors the catalog.
  const sourcesByGame: Record<string, readonly string[]> = {
    mtg: ["scryfall", "cardmarket", "tcgplayer", "cardtrader"],
    pkm: ["pokemon-tcg-api", "cardmarket", "tcgplayer", "cardrush", "psa-registry"],
    ygo: ["ygoprodeck", "cardmarket", "tcgplayer"],
    op: ["cardrush", "cardmarket", "tcgplayer", "bandai-tcg"],
    dbs: ["cardrush", "cardmarket", "tcgplayer"],
    dbf: ["cardrush", "cardmarket", "tcgplayer", "bandai-tcg"],
    dmw: ["cardrush", "cardmarket", "tcgplayer", "bandai-tcg"],
    bsr: ["cardrush", "cardmarket", "tcgplayer", "bandai-tcg"],
    lgr: ["cardmarket", "tcgplayer", "cardtrader"],
    fab: ["cardmarket", "tcgplayer", "cardtrader"],
    swu: ["cardmarket", "tcgplayer"],
    wei: ["cardrush", "cardmarket"],
    vng: ["cardrush", "cardmarket"],
  };
  const relevant = sourcesByGame[game_code] ?? [];
  return welcome.source_id ? relevant.includes(welcome.source_id) : false;
}

/**
 * Map a price-guide slug to its full game context. Returns a
 * substrate-honest empty when the slug isn't recognised.
 */
export function getGameContext(slug: string): GameContext {
  const config = getPriceGuideConfig(slug) ?? null;
  if (!config) {
    return {
      config: null,
      game_code: null,
      policy: null,
      languages: [],
      confirmed: false,
      relevant_gaps: [],
      relevant_welcomes: [],
      cardrush_confirmed: null,
    };
  }
  const game_code = config.game_code as GameCode;
  const policy = ORACLE_POLICY[game_code] ?? null;
  const gameMeta = GAMES[game_code];
  const relevant_gaps = GAPS.filter((g) => gapMentionsGame(g, game_code, slug));
  const relevant_welcomes = WELCOMES.filter((w) =>
    welcomeRelevantForGame(w, game_code),
  );
  return {
    config,
    game_code,
    policy,
    languages: gameMeta?.languages ?? [],
    confirmed: gameMeta?.confirmed ?? false,
    relevant_gaps,
    relevant_welcomes,
    cardrush_confirmed: config.cardrush?.confirmed ?? null,
  };
}

/**
 * For each game in PRICE_GUIDE_GAMES, return a short coverage summary
 * suitable for the /prices index page sidebar. Pure compute.
 */
export interface GameCoverageSummary {
  slug: string;
  pattern_kind: OraclePolicy["kind"] | null;
  confirmed: boolean;
  open_gap_count: number;
  anticipated_upstream_count: number;
  arrived_upstream_count: number;
}

export function summarizeGameCoverage(slug: string): GameCoverageSummary {
  const ctx = getGameContext(slug);
  return {
    slug,
    pattern_kind: ctx.policy?.kind ?? null,
    confirmed: ctx.confirmed,
    open_gap_count: ctx.relevant_gaps.filter(
      (g) => g.status === "named" || g.status === "wired" || g.status === "partial",
    ).length,
    anticipated_upstream_count: ctx.relevant_welcomes.filter(
      (w) => w.status === "anticipated",
    ).length,
    arrived_upstream_count: ctx.relevant_welcomes.filter(
      (w) => w.status === "arrived",
    ).length,
  };
}
