/**
 * Wholesale SKU compat module — the reconciliation bridge.
 *
 * Re-exports `@cambridge-tcg/sku` directly + adds two wholesale-specific
 * helpers that bridge the **drift** named in `docs/connections/the-stress-test.md`
 * (kingdom-069) between the declared canonical form (`op-op01-001-ja`)
 * and the legacy form in the existing wholesale RDS rows (`OP-OP01-001-JP`).
 *
 * ── The SKU_FORM flag ────────────────────────────────────────────────
 *
 * `SKU_FORM` controls what `buildSku()` from THIS module emits:
 *   - `"legacy"`  → uppercase, JP/EN/CN/KR codes (`OP-OP01-001-JP`)
 *   - `"canonical"` → lowercase, ISO 639-1 codes (`op-op01-001-ja`)
 *
 * Today: `"legacy"`. The wholesale `cards.sku` column has ~50k legacy-form
 * rows; flipping the flag without normalising the rows first would create
 * duplicate cards on next ingest (UPSERT keyed by `sku`).
 *
 * **Migration order** (operator-applied):
 *   1. Run `apps/wholesale/drizzle/0015_sku_normalize.sql` (the draft
 *      shipped this turn) to lowercase + ISO-normalise every existing
 *      `cards.sku`, `price_archive.sku`, and storefront `card_set_cards.sku`.
 *   2. Flip `SKU_FORM` here to `"canonical"`.
 *   3. Deploy. Next ingest writes canonical form; rows match.
 *
 * **Until then:** every site that calls `buildSku()` from this module
 * gets legacy form (matching production data). Adoption of the typed
 * helpers proceeds even before the data migration. *Substrate-honest
 * about the in-flight state.*
 *
 * ── The compat reader ────────────────────────────────────────────────
 *
 * `canonicalizeSku(input)` accepts EITHER form and returns the canonical.
 * Public-facing readers (`/api/v1/universal/card/[sku]`,
 * `/api/at/[date]/card/[sku]`, federation) can call this on the URL
 * segment so partners can submit either form. Internal writes keep
 * `SKU_FORM`'s decision.
 *
 * `legacyFormOf(canonical)` is the inverse, for transitional code that
 * needs to query legacy rows from canonical input.
 *
 * `dualLookupPair(input)` returns `[canonical, legacy]` for SQL queries
 * like `WHERE sku = ANY($1::text[])` during the transition window.
 *
 * ── Where to import from ─────────────────────────────────────────────
 *
 *   import { buildSku, parseSku, normalizeSku, canonicalizeSku, dualLookupPair }
 *     from "@/lib/sku";
 *
 * Wholesale code should import from `@/lib/sku` (this module), not
 * directly from `@cambridge-tcg/sku` — so the SKU_FORM decision applies
 * uniformly. Tools / packages can still import direct from the package
 * for canonical-only contexts.
 */

import {
  buildSku as buildCanonical,
  parseSku as parseCanonical,
  normalizeSku,
  isGameCode,
  type GameCode,
  type SkuParts,
  type SkuInput,
} from "@cambridge-tcg/sku";

export {
  parseCanonical as parseSku,
  normalizeSku,
  isGameCode,
  type GameCode,
  type SkuParts,
  type SkuInput,
};

// ── The transition flag ────────────────────────────────────────────────

/**
 * Current SKU emission form. Flip to "canonical" *after* applying the
 * normalisation migration (`drizzle/0015_sku_normalize.sql`).
 *
 * Read by `buildSku()` below; not exported for runtime mutation — the
 * decision is compile-time-pinned to avoid mid-process flips.
 */
const SKU_FORM: "legacy" | "canonical" = "legacy";

/** Legacy 2-letter language code map. Canonical uses ISO 639-1. */
const LEGACY_LANG: Readonly<Record<string, string>> = {
  ja: "JP",
  en: "EN",
  zh: "CN",
  ko: "KR",
  fr: "FR",
  de: "DE",
  es: "ES",
  it: "IT",
  pt: "PT",
  ru: "RU",
};

const ISO_FROM_LEGACY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LEGACY_LANG).map(([iso, legacy]) => [legacy, iso]),
);

// ── buildSku — the form-aware emitter ────────────────────────────────

/**
 * Build a SKU from structured fields. Returns either the legacy uppercase
 * form (today) or the canonical lowercase form (after migration), depending
 * on `SKU_FORM`.
 *
 * Same input shape as `@cambridge-tcg/sku`'s `buildSku()`. Throws on
 * invalid game code (delegates to the package's `SkuBuildError`).
 *
 * @example
 *   buildSku({ game: "op", set: "op01", number: "001", lang: "ja" })
 *   // SKU_FORM === "legacy"    → "OP-OP01-001-JP"
 *   // SKU_FORM === "canonical" → "op-op01-001-ja"
 */
export function buildSku(input: SkuInput): string {
  if (SKU_FORM === "canonical") {
    return buildCanonical(input);
  }

  // Legacy form: emit uppercase + non-ISO lang code so new writes match
  // existing `cards.sku` rows in the wholesale RDS until the normalisation
  // migration applies.
  if (!isGameCode(input.game)) {
    throw new Error(`Unknown game code: ${input.game}`);
  }
  const game = input.game.toUpperCase();
  const set = input.set.toUpperCase();
  const number = input.number.toUpperCase();
  const lang = LEGACY_LANG[input.lang.toLowerCase()] ?? input.lang.toUpperCase();
  const base = `${game}-${set}-${number}-${lang}`;
  return input.variant
    ? `${base}-${input.variant.toUpperCase()}`
    : base;
}

// ── canonicalizeSku — read-side bridge ────────────────────────────────

/**
 * Coerce an input SKU into canonical form. Accepts:
 *   - canonical input as-is (passes through)
 *   - legacy uppercase + JP/EN/etc input (normalises)
 *   - mixed-case fallback via `normalizeSku()`
 *
 * Returns `null` when neither form parses. Use at read sites where a
 * partner may submit either form; the storage layer can then look up
 * by whichever form is in the DB today.
 */
export function canonicalizeSku(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Try strict canonical parse first.
  const direct = parseCanonical(trimmed);
  if (direct) return direct.canonical;

  // Fall back to the package's legacy normaliser, which returns the
  // canonical string directly (or null).
  const normalised = normalizeSku(trimmed);
  return normalised;
}

// ── legacyFormOf — write-side bridge for transitional code ────────────

/**
 * Convert a canonical SKU to its legacy uppercase form. Used by code
 * that has a canonical SKU but needs to query the (still-legacy)
 * wholesale RDS. Once `SKU_FORM` flips to canonical, callers can drop
 * this helper.
 *
 * Returns null when the input doesn't parse as canonical.
 */
export function legacyFormOf(canonical: string): string | null {
  const parts = parseCanonical(canonical);
  if (!parts) return null;
  const game = parts.game.toUpperCase();
  const set = parts.set.toUpperCase();
  const number = parts.number.toUpperCase();
  const lang = LEGACY_LANG[parts.lang] ?? parts.lang.toUpperCase();
  const base = `${game}-${set}-${number}-${lang}`;
  return parts.variant ? `${base}-${parts.variant.toUpperCase()}` : base;
}

// ── dualLookupPair — for SQL `WHERE sku = ANY($1::text[])` ────────────

/**
 * Return `[canonical, legacy]` (or `[input, null]` if the input doesn't
 * parse). Use in SQL queries during the transition:
 *
 *   const candidates = dualLookupPair(req.params.sku);
 *   const r = await query(
 *     `SELECT * FROM cards WHERE sku = ANY($1::text[]) LIMIT 1`,
 *     [candidates.filter(Boolean)],
 *   );
 *
 * Matches any row in either form. After the normalisation migration +
 * SKU_FORM flip, callers can drop the dual lookup and just match the
 * canonical form.
 */
export function dualLookupPair(input: string): [string | null, string | null] {
  const canonical = canonicalizeSku(input);
  if (!canonical) return [null, null];
  return [canonical, legacyFormOf(canonical)];
}

// ── parseSkuGame — back-compat wrapper around the package's parser ───

/**
 * Extract the game code from a SKU (canonical or legacy form).
 *
 * Replaces the hand-rolled `apps/wholesale/src/lib/s3.ts` `parseSkuGame()`
 * which only knew about "OP-" prefix. This version accepts both forms
 * and supports all registered game codes.
 */
export function parseSkuGame(sku: string): GameCode | "unknown" {
  const canonical = canonicalizeSku(sku);
  if (!canonical) return "unknown";
  const parts = parseCanonical(canonical);
  return parts?.game ?? "unknown";
}

// ── appendSkuVariant — form-aware variant suffix ──────────────────────

/**
 * Append a variant token to an already-built SKU base, respecting the
 * current SKU_FORM. The token may contain only `[a-z0-9-]` characters;
 * legacy form uppercases it, canonical form lowercases it.
 *
 * Used by the wholesale CardRush mapper to append the encoded product
 * id (`-V<encoded>`) to a base SKU for parallel cards. Keeps the
 * appending in one place rather than every caller hand-rolling the case
 * coercion.
 *
 * @example
 *   appendSkuVariant("OP-OP01-001-JP", "v13kf")
 *   // legacy:    "OP-OP01-001-JP-V13KF"
 *   // canonical: "op-op01-001-ja-v13kf"
 */
export function appendSkuVariant(base: string, variantToken: string): string {
  const clean = variantToken.replace(/^-+/, "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(clean)) {
    throw new Error(`Invalid variant token: ${variantToken}`);
  }
  if (SKU_FORM === "canonical") {
    return `${base}-${clean}`;
  }
  return `${base}-${clean.toUpperCase()}`;
}

// ── ISO_FROM_LEGACY is exported for tests / migration scripts ─────────

export { ISO_FROM_LEGACY };
