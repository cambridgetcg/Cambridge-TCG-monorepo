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
 * See `docs/methodology/sku-standard.md` for the public spec. Card names
 * (CTCG-NAMES-v1, draft) live in `./names`; see
 * `docs/methodology/card-names.md`.
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
  GAME_SLUGS,
  CONFIRMED_GAME_SLUGS,
  isGameCode,
  isConfirmedGameCode,
  isGameSlug,
  gameBySlug,
  slugForCode,
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
  normalizeLanguageCode,
} from "./normalize";

export {
  SKU_IDENTITY_CONTRACT,
  SKU_IDENTITY_SCHEMA,
  skuIdentity,
  resolveGameToken,
  type SkuIdentity,
} from "./identity";

// CTCG-NAMES-v1 (draft): one name per card key and language, with its
// status and source. See docs/methodology/card-names.md.
export {
  CARD_NAME_SPEC_VERSION,
  CARD_NAME_STATUSES,
  CARD_NAME_RULES,
  CARD_NAME_MARKERS,
  CARD_NAME_SCHEMA,
  CardNameError,
  cardKey,
  isCardKey,
  cardNameText,
  cardNameKey,
  sameCardName,
  cardName,
  chooseCardName,
  printingName,
  cardRushName,
  tcgplayerName,
  cardmarketName,
  type CardName,
  type CardNameInput,
  type CardNameStatus,
  type CardNameQuery,
  type CardNameChoice,
  type CardNameExtraction,
  type CardNameRefusal,
  type CardNameRefusalReason,
} from "./names";

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
