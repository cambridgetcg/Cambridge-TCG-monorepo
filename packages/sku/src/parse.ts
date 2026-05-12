/**
 * SKU parser — canonical form to structured fields.
 *
 * Canonical Cambridge TCG SKU v1:
 *
 *   <game>-<set>-<number>-<lang>[-<variant>]
 *
 * - All segments lowercase
 * - Hyphen-separated
 * - Segments are `[a-z0-9]+` (with the exception of `lang`, which is two
 *   lowercase letters per ISO 639-1)
 * - `game` is a registered code (see `games.ts`)
 * - `variant` is optional; when present it's one or more `[a-z0-9]+`
 *   tokens hyphen-joined (e.g. "rev", "1st", "alt-art", "holo-foil")
 *
 * See `docs/methodology/sku-standard.md` for the public spec.
 */

import { isGameCode, type GameCode } from "./games";

export interface SkuParts {
  /** Registered game code (op, pkm, mtg, …). */
  game: GameCode;
  /** Publisher's set code, lowercased. e.g. "op01", "svobf", "otj". */
  set: string;
  /** Card number within the set, lowercased. e.g. "001", "t01", "fa1". */
  number: string;
  /** ISO 639-1 language code, lowercased. e.g. "ja", "en", "zh". */
  lang: string;
  /** Optional variant. Hyphen-joined tokens. e.g. "rev", "1st-edition", "alt-art-holo". */
  variant?: string;
  /** The full canonical SKU string, exactly as parsed (already lowercased). */
  canonical: string;
}

const SEGMENT = /^[a-z0-9]+$/;
const LANG = /^[a-z]{2}$/;

/**
 * Parse a SKU into structured fields. Returns null if the input is not
 * a valid canonical SKU.
 *
 * Strict by design — non-lowercase input, missing segments, or unknown
 * game codes all return null. Use `normalizeSku()` first to coerce
 * legacy / uppercase inputs into canonical form before parsing.
 *
 * @example
 *   parseSku("op-op01-001-ja")
 *   //=> { game: "op", set: "op01", number: "001", lang: "ja", canonical: "op-op01-001-ja" }
 *
 *   parseSku("pkm-svobf-006-en-rev")
 *   //=> { game: "pkm", set: "svobf", number: "006", lang: "en", variant: "rev", ... }
 *
 *   parseSku("OP-OP01-001-JP")  // legacy form — strict parser refuses
 *   //=> null
 */
export function parseSku(sku: string): SkuParts | null {
  if (typeof sku !== "string") return null;
  if (sku.length === 0) return null;

  // Strict: refuse non-lowercase (caller should normalize first).
  if (sku !== sku.toLowerCase()) return null;

  const parts = sku.split("-");
  if (parts.length < 4) return null;

  const [game, set, number, lang, ...variantParts] = parts;
  if (!game || !set || !number || !lang) return null;
  if (!isGameCode(game)) return null;
  if (!SEGMENT.test(set)) return null;
  if (!SEGMENT.test(number)) return null;
  if (!LANG.test(lang)) return null;
  for (const p of variantParts) {
    if (!SEGMENT.test(p)) return null;
  }

  const variant = variantParts.length > 0 ? variantParts.join("-") : undefined;
  return { game, set, number, lang, variant, canonical: sku };
}

/** Convenience predicate. */
export function isValidSku(sku: string): boolean {
  return parseSku(sku) !== null;
}
