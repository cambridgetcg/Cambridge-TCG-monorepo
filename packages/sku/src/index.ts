/**
 * @module @cambridge-tcg/sku
 *
 * Cambridge TCG SKU standard v1.
 *
 *   <game>-<set>-<number>-<lang>[-<variant>]
 *
 * All lowercase, hyphen-separated. `game` is a registered code (see
 * `GAMES`); `set` and `number` are publisher-defined; `lang` is ISO
 * 639-1; `variant` is optional (e.g. "rev", "1st", "alt-art").
 *
 * See `docs/methodology/sku-standard.md` for the public spec.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   import { parseSku, buildSku, normalizeSku } from "@cambridge-tcg/sku";
 *
 *   parseSku("op-op01-001-ja");
 *   //=> { game: "op", set: "op01", number: "001", lang: "ja", canonical: "op-op01-001-ja" }
 *
 *   buildSku({ game: "pkm", set: "svobf", number: "006", lang: "en", variant: "rev" });
 *   //=> "pkm-svobf-006-en-rev"
 *
 *   normalizeSku("OP-OP01-001-JP");
 *   //=> "op-op01-001-ja"
 */

export {
  GAMES,
  GAME_CODES,
  CONFIRMED_GAME_CODES,
  ANTICIPATED_GAME_CODES,
  isGameCode,
  isConfirmedGameCode,
  type GameCode,
  type GameMeta,
} from "./games";

export {
  parseSku,
  isValidSku,
  type SkuParts,
} from "./parse";

export {
  buildSku,
  SkuBuildError,
  type SkuInput,
} from "./build";

export {
  normalizeSku,
  normalizeAndParse,
  normalizeLangCode,
} from "./normalize";

export {
  SET_FORMATS,
  SET_FROM_CONTEXT,
  parseCardNumber,
  knownSetPrefixes,
  listAllFormats,
  type SetFormat,
  type CardNumberParts,
} from "./sets";

export {
  ORACLE_POLICY,
  resolveOracle,
  strippedOracleId,
  groupByOracle,
  type OraclePolicy,
  type OraclePatternKind,
  type OracleAnchors,
  type OracleResolution,
  type OracleResolutionSource,
  type OracleConfidence,
} from "./oracle";

// kingdom-089: per-game rarity vocabulary + ordinal rank. Substrate-
// honest about per-game rarity meaning (no cross-game tier). Seed
// source-of-truth for the wholesale rarity_map table.
export {
  RARITIES,
  lookupRarity,
  rarityOrdinal,
  gameRarities,
  seededRarityGames,
  type RarityRow,
  type RarityMap,
} from "./rarities";
