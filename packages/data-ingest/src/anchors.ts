/**
 * Cross-language anchor extraction — Kingdom 2 of the substrate-honest aggregator.
 *
 * Pure-compute layer between source normalizers (which produce typed
 * `CanonicalCard` records) and storefront/wholesale writers (which need
 * the column values to land in K2's migration 0100 schema).
 *
 * ── Why this lives here ──────────────────────────────────────────────
 *
 * `packages/data-ingest` already knows the canonical record shape and
 * depends on `@cambridge-tcg/sku` for the resolver. Putting the helper
 * here means storefront and wholesale writers can both `import {
 * extractAnchorRow } from "@cambridge-tcg/data-ingest"` without
 * re-implementing the per-source extraction logic.
 *
 * ── Anchor inventory ─────────────────────────────────────────────────
 *
 *   - oracle_id              — Cambridge TCG canonical cross-language id
 *                              (derived via resolveOracle from @cambridge-tcg/sku)
 *   - oracle_source          — how oracle_id was derived
 *   - oracle_resolved_at     — when (the writer fills this at write time)
 *
 *   - scryfall_oracle_id     — Scryfall's per-oracle UUID (MTG only)
 *   - scryfall_card_id       — Scryfall's per-printing-per-language UUID
 *   - cardmarket_id_metacard — Cardmarket's cross-language anchor (MTG only in practice)
 *   - cardmarket_id_product  — Cardmarket's per-printing-per-language id
 *   - cardmarket_id_language — Cardmarket's idLanguage (1..11)
 *   - tcgplayer_product_id   — TCGplayer's per-printing-per-language id
 *   - tcgplayer_group_id     — TCGplayer's set-level grouping
 *   - ygo_passcode           — Konami's 8-digit global anchor (Pattern B)
 *   - pokemon_tcg_api_id     — pokemontcg.io's per-printing id (EN-track)
 *
 * Each per-source extractor reads from a `CanonicalCard`'s `extra` +
 * `upstream_id` fields. The shape of `extra` is convention per source;
 * this module names the contract.
 *
 * ── Substrate-honesty ────────────────────────────────────────────────
 *
 * Every field is independently nullable. Absence is first-class: an
 * MTG card ingested only via Scryfall has `scryfall_*` populated and
 * `cardmarket_id_metacard = null` until Cardmarket Phase B lands.
 *
 * The oracle resolver runs at extraction time so the writer can write
 * `oracle_id` + `oracle_source` in one upsert. Per K1's policy:
 *
 *   - Pattern A (stripped) games: oracle_id = "<game>-<set>-<number>[-<variant>]"
 *   - Pattern B (passcode) games: oracle_id = "<game>-<passcode>[-<variant>]"
 *                                 requires ygo_passcode anchor
 *   - Pattern C (diverged) games: oracle_id = null (pkm_equivalence required)
 *   - Pattern D (single-lang):    oracle_id = "<game>-<set>-<number>[-<variant>]"
 *
 * The writer reads `AnchorRow.oracle_id` and writes it to
 * `card_set_cards.oracle_id`; null is preserved as NULL in PG.
 *
 * Spec citation: K2 schema migration at
 * `apps/storefront/drizzle/drafts/0100_cross_language_anchors.sql.draft`.
 */

import {
  resolveOracle,
  type GameCode,
  type OracleResolutionSource,
} from "@cambridge-tcg/sku";
import type { CanonicalCard } from "./canonical";

// ── Shapes ───────────────────────────────────────────────────────────

/**
 * One row's worth of anchor columns. Every field optional + nullable;
 * the writer composes the UPDATE with only the present fields.
 *
 * Field names match the column names in `apps/storefront/drizzle/drafts/
 * 0100_cross_language_anchors.sql.draft` so the writer can spread the
 * object directly into a parameterised query.
 */
export interface AnchorRow {
  /** Cambridge TCG canonical oracle id. Always set (may be null). */
  oracle_id: string | null;
  /** How the oracle was derived. Null iff oracle_id is null. */
  oracle_source: OracleResolutionSource;
  /** When the writer applied this (writer-supplied). */
  oracle_resolved_at?: Date;

  // Per-source upstream anchors (each independently nullable).
  scryfall_oracle_id?: string | null;
  scryfall_card_id?: string | null;
  cardmarket_id_metacard?: number | null;
  cardmarket_id_product?: number | null;
  cardmarket_id_language?: number | null;
  tcgplayer_product_id?: number | null;
  tcgplayer_group_id?: number | null;
  ygo_passcode?: string | null;
  pokemon_tcg_api_id?: string | null;
}

/**
 * Additional context the extractor can consume when the canonical card
 * doesn't carry every anchor by itself (e.g. cross-ingest joins).
 */
export interface AnchorContext {
  /** Operator-known passcode for a YGO card; overrides any value in `extra`. */
  ygo_passcode?: string | null;
}

// ── Per-source extractors ────────────────────────────────────────────

/**
 * Read Scryfall-shaped anchor fields from a normalized CanonicalCard.
 *
 * Conventions (see `packages/data-ingest/src/scryfall/normalize.ts`):
 *   - `upstream_id`         = Scryfall's per-printing-per-language card UUID
 *   - `extra.oracle_id`     = Scryfall's per-oracle UUID
 *
 * Returns `null` for any field the record doesn't carry.
 */
export function extractScryfallAnchors(record: CanonicalCard): {
  scryfall_card_id: string | null;
  scryfall_oracle_id: string | null;
} {
  const extra = record.extra ?? {};
  const scryfallOracleRaw = extra["oracle_id"];
  const scryfallOracle =
    typeof scryfallOracleRaw === "string" && scryfallOracleRaw.length > 0
      ? scryfallOracleRaw
      : null;
  const upstreamId = record.upstream_id;
  const scryfallCard =
    typeof upstreamId === "string" && upstreamId.length > 0 ? upstreamId : null;

  return {
    scryfall_card_id: scryfallCard,
    scryfall_oracle_id: scryfallOracle,
  };
}

/**
 * Read Cardmarket-shaped anchor fields from a normalized CanonicalCard.
 *
 * Conventions (see future `packages/data-ingest/src/cardmarket/normalize-catalog.ts`):
 *   - `upstream_id`                  = Cardmarket's idProduct
 *   - `extra.cardmarket_id_metacard` = Cardmarket's idMetacard (MTG only)
 *   - `extra.cardmarket_id_language` = Cardmarket's idLanguage (1..11)
 *
 * Returns `null` for any field the record doesn't carry.
 */
export function extractCardmarketAnchors(record: CanonicalCard): {
  cardmarket_id_product: number | null;
  cardmarket_id_metacard: number | null;
  cardmarket_id_language: number | null;
} {
  const extra = record.extra ?? {};
  const productIdRaw = record.upstream_id;
  const productId =
    typeof productIdRaw === "string" && /^\d+$/.test(productIdRaw)
      ? parseInt(productIdRaw, 10)
      : null;
  const metacardRaw = extra["cardmarket_id_metacard"];
  const metacard =
    typeof metacardRaw === "number" && Number.isFinite(metacardRaw)
      ? metacardRaw
      : null;
  const languageRaw = extra["cardmarket_id_language"];
  const language =
    typeof languageRaw === "number" && Number.isFinite(languageRaw)
      ? languageRaw
      : null;

  return {
    cardmarket_id_product: productId,
    cardmarket_id_metacard: metacard,
    cardmarket_id_language: language,
  };
}

/**
 * Read TCGplayer-shaped anchor fields from a normalized CanonicalCard.
 *
 * Conventions (see `packages/data-ingest/src/tcgplayer/normalize.ts`):
 *   - `upstream_id` is not used at the catalog level; per-SKU productIds
 *     arrive via `extra.tcgplayer_product_id` populated by the writer
 *     after leaf-id resolution
 *   - `extra.tcgplayer_group_id` = TCGplayer's set-level grouping
 *
 * Returns `null` for any field the record doesn't carry.
 */
export function extractTcgplayerAnchors(record: CanonicalCard): {
  tcgplayer_product_id: number | null;
  tcgplayer_group_id: number | null;
} {
  const extra = record.extra ?? {};
  const productIdRaw = extra["tcgplayer_product_id"];
  const productId =
    typeof productIdRaw === "number" && Number.isFinite(productIdRaw)
      ? productIdRaw
      : null;
  const groupIdRaw = extra["tcgplayer_group_id"];
  const groupId =
    typeof groupIdRaw === "number" && Number.isFinite(groupIdRaw)
      ? groupIdRaw
      : null;

  return {
    tcgplayer_product_id: productId,
    tcgplayer_group_id: groupId,
  };
}

/**
 * Read YGOPRODeck-shaped anchor fields from a normalized CanonicalCard.
 *
 * Conventions (see `packages/data-ingest/src/ygoprodeck/`):
 *   - `extra.passcode` = Konami's 8-digit passcode (the Pattern B anchor)
 *
 * Returns `null` if not present.
 */
export function extractYgoprodeckAnchors(record: CanonicalCard): {
  ygo_passcode: string | null;
} {
  const extra = record.extra ?? {};
  const passcodeRaw = extra["passcode"];
  if (typeof passcodeRaw === "string" && /^\d+$/.test(passcodeRaw)) {
    return { ygo_passcode: passcodeRaw };
  }
  if (typeof passcodeRaw === "number" && Number.isFinite(passcodeRaw)) {
    return { ygo_passcode: String(passcodeRaw) };
  }
  return { ygo_passcode: null };
}

/**
 * Read pokemontcg.io-shaped anchor fields from a normalized CanonicalCard.
 *
 * Conventions (see `packages/data-ingest/src/pokemon-tcg-api/`):
 *   - `upstream_id` = pokemontcg.io's per-printing id (e.g. "swsh4-25")
 *
 * Returns `null` if not present.
 */
export function extractPokemonTcgApiAnchors(record: CanonicalCard): {
  pokemon_tcg_api_id: string | null;
} {
  const id = record.upstream_id;
  return {
    pokemon_tcg_api_id: typeof id === "string" && id.length > 0 ? id : null,
  };
}

// ── Dispatch: source → anchor extractor ──────────────────────────────

/**
 * Per-source-id extraction. Source ids match `SourceId` from `./types.ts`;
 * unknown ids return an empty object so a future source ships without
 * breaking the dispatcher.
 *
 * The function does NOT call `resolveOracle()`; that's the next layer.
 * Use `buildAnchorRow()` for the full anchor + oracle composition.
 */
export function extractAnchorsForSource(
  source: string,
  record: CanonicalCard,
): Partial<AnchorRow> {
  switch (source) {
    case "scryfall":
      return extractScryfallAnchors(record);
    case "cardmarket":
      return extractCardmarketAnchors(record);
    case "tcgplayer":
      return extractTcgplayerAnchors(record);
    case "ygoprodeck":
      return extractYgoprodeckAnchors(record);
    case "pokemon-tcg-api":
      return extractPokemonTcgApiAnchors(record);
    default:
      // Substrate-honest: a source we don't have a special-case extractor
      // for produces no upstream-anchor fields; the oracle layer still
      // derives a Pattern A oracle_id from the SKU.
      return {};
  }
}

// ── The composer ─────────────────────────────────────────────────────

/**
 * Build the full anchor row for a writer to upsert into card_set_cards.
 *
 * Combines:
 *   - Per-source anchor extraction (extractAnchorsForSource)
 *   - K1's resolveOracle() to derive oracle_id + oracle_source
 *   - Caller-supplied AnchorContext (e.g. a passcode lookup the writer
 *     already did against ygoprodeck even if the current source is
 *     scryfall or cardmarket)
 *
 * Pure: same inputs → same outputs. No DB, no clock (the writer
 * supplies `oracle_resolved_at` separately if needed).
 *
 * @example
 *   // After Scryfall ingest:
 *   const row = buildAnchorRow("scryfall", scryfallNormalizedRecord);
 *   // row.scryfall_oracle_id and row.scryfall_card_id populated;
 *   // row.oracle_id = "mtg-otj-001" (Pattern A derived-stripped);
 *   // row.cardmarket_*, row.ygo_passcode, etc. all undefined (writer
 *   // skips them in the UPDATE so existing values aren't clobbered).
 *
 *   // YGO normalizer with a passcode hint:
 *   const row = buildAnchorRow("ygoprodeck", ygoNormalized);
 *   // row.ygo_passcode = "89631139";
 *   // row.oracle_id = "ygo-89631139";
 *   // row.oracle_source = "ygo-passcode".
 *
 *   // Cross-ingest passcode injection (writer supplies passcode the
 *   // record didn't carry, e.g. from prior YGOPRODeck ingest):
 *   const row = buildAnchorRow("scryfall", mtgRecord, { ygo_passcode: null });
 *   // (no-op for MTG; ygo_passcode ignored unless GameCode is Pattern B)
 */
export function buildAnchorRow(
  source: string,
  record: CanonicalCard,
  context: AnchorContext = {},
): AnchorRow {
  const sourceAnchors = extractAnchorsForSource(source, record);

  // Passcode precedence:
  //   1. explicit context.ygo_passcode (writer-side override / cross-ingest)
  //   2. extracted from the record (e.g. YGOPRODeck source)
  //   3. null (not provided)
  const ygoPasscode =
    context.ygo_passcode !== undefined
      ? context.ygo_passcode
      : (sourceAnchors.ygo_passcode ?? null);

  const resolution = resolveOracle(record.sku, {
    ygo_passcode: ygoPasscode,
  });

  return {
    // Oracle + provenance
    oracle_id: resolution.oracle_id,
    oracle_source: resolution.source,

    // Per-source anchors (preserving null vs undefined distinction —
    // undefined means "don't touch this column", null means "set to NULL")
    ...sourceAnchors,

    // Passcode comes through dispatched extractor OR context; ensure it's
    // on the row when context provided.
    ...(context.ygo_passcode !== undefined
      ? { ygo_passcode: context.ygo_passcode }
      : {}),
  };
}

// ── Game-aware helper ────────────────────────────────────────────────

/**
 * Convenience predicate: does this game require an external anchor (passcode)
 * to produce a non-null oracle_id?
 *
 * Used by writers to decide whether to skip oracle computation when the
 * anchor isn't yet available (Pattern B without passcode → defer).
 */
export function requiresExternalAnchor(game: GameCode): boolean {
  // Pattern B games need ygo_passcode; everyone else can derive without it.
  return game === "ygo" || game === "rsh";
}
