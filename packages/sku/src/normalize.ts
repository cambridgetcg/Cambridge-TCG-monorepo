/**
 * Legacy SKU normalization.
 *
 * The platform shipped before this spec existed. Two non-canonical forms
 * are in use today:
 *
 *   - `OP-OP01-001-JP`   (uppercase, JP/EN/CN-style language codes)
 *   - `pkm-svobf-en-006` (lowercase, but language and number swapped)
 *
 * `normalizeSku()` accepts either, plus any other form that can be
 * unambiguously coerced into canonical v1 (`<game>-<set>-<number>-<lang>`).
 * Returns null when the input doesn't match a recognised legacy pattern.
 *
 * After normalization, the output is guaranteed to round-trip through
 * `parseSku()`.
 */

import { parseSku, type SkuParts } from "./parse";
import { GAME_CODES, GAMES, isGameCode, type GameCode } from "./games";

/**
 * Legacy language codes → ISO 639-1.
 *   JP / JA / jpn → ja
 *   CN / ZH / chn → zh
 *   KR / KO / kor → ko
 *   EN remains en, FR fr, DE de, ES es, IT it, PT pt, RU ru
 */
const LANG_NORMALIZE: Readonly<Record<string, string>> = {
  jp: "ja", ja: "ja", jpn: "ja",
  cn: "zh", zh: "zh", chn: "zh",
  kr: "ko", ko: "ko", kor: "ko",
  en: "en", eng: "en",
  fr: "fr", fra: "fr",
  de: "de", ger: "de", deu: "de",
  es: "es", spa: "es",
  it: "it", ita: "it",
  pt: "pt", por: "pt",
  ru: "ru", rus: "ru",
};

/** Frozen pre-v1 prefixes point at a game, not necessarily its canonical
 * game code (`EB`/`ST` → `op`, `PK` → `pkm`, `FB` → `dbf`). Keep the map
 * derived from the Atlas so every reader accepts the same production shapes. */
const LEGACY_PREFIX_TO_GAME: Readonly<Record<string, GameCode>> =
  Object.fromEntries(
    GAME_CODES.flatMap((code) =>
      (GAMES[code].legacyPrefixes ?? []).map((prefix) => [
        prefix.toLowerCase(),
        code,
      ]),
    ),
  ) as Record<string, GameCode>;

function normalizeLang(raw: string): string | null {
  const lower = raw.toLowerCase();
  return LANG_NORMALIZE[lower] ?? null;
}

/** `parseSku` validates the two-letter shape, not the ISO registry. Country
 * codes used by the legacy catalog (`jp`, `cn`, `kr`) therefore parse even
 * though the SKU standard names languages (`ja`, `zh`, `ko`). Repair those
 * values after parsing instead of letting the fast path freeze them. */
function normalizeParsed(parts: SkuParts): string {
  const lang = normalizeLang(parts.lang) ?? parts.lang;
  return [parts.game, parts.set, parts.number, lang, parts.variant]
    .filter((part): part is string => Boolean(part))
    .join("-");
}

/**
 * Normalize a SKU to canonical form. Returns null if it can't be
 * unambiguously canonicalised.
 *
 * Handles:
 *   - Already-canonical SKUs (returned as-is, validated)
 *   - Uppercase forms (`OP-OP01-001-JP` → `op-op01-001-ja`)
 *   - Lang/number swap (`pkm-svobf-en-006` → `pkm-svobf-006-en`)
 *   - 3-letter language codes (jpn, eng, etc.)
 *
 * @example
 *   normalizeSku("OP-OP01-001-JP")    //=> "op-op01-001-ja"
 *   normalizeSku("pkm-svobf-en-006")  //=> "pkm-svobf-006-en"
 *   normalizeSku("op-op01-001-ja")    //=> "op-op01-001-ja" (unchanged)
 *   normalizeSku("nonsense")           //=> null
 */
export function normalizeSku(sku: string): string | null {
  if (typeof sku !== "string" || sku.length === 0) return null;

  // Fast path: already canonical?
  const direct = parseSku(sku);
  if (direct) return normalizeParsed(direct);

  // Try lowercasing + reparsing.
  const lower = sku.toLowerCase();
  const lowered = parseSku(lower);
  if (lowered) return normalizeParsed(lowered);

  // Split and try to recover. A frozen legacy prefix names the owning game,
  // while the next segment remains the set (`EB-EB01-...`). Prefix-only
  // shapes such as `P-001-JP` identify a game but not a canonical set; do not
  // invent that missing identity here.
  let parts = lower.split("-");
  const legacyGame = parts[0]
    ? LEGACY_PREFIX_TO_GAME[parts[0]]
    : undefined;
  if (legacyGame) {
    const [, ...tail] = parts;
    if (tail.length < 3) return null;
    parts = [legacyGame, ...tail];
  }
  if (parts.length < 4) return null;

  const [game, set, third, fourth, ...rest] = parts;
  if (!game || !set || !third || !fourth) return null;
  if (!isGameCode(game)) return null;

  // Heuristic 1: <game>-<set>-<number>-<lang>[-variant]
  //   third = number (alphanumeric), fourth = lang
  const fourthAsLang = normalizeLang(fourth);
  if (fourthAsLang) {
    const candidate = [game, set, third, fourthAsLang, ...rest].join("-");
    const reparsed = parseSku(candidate);
    if (reparsed) return reparsed.canonical;
  }

  // Heuristic 2: <game>-<set>-<lang>-<number>[-variant]
  //   third = lang, fourth = number
  const thirdAsLang = normalizeLang(third);
  if (thirdAsLang) {
    // Swap third and fourth.
    const candidate = [game, set, fourth, thirdAsLang, ...rest].join("-");
    const reparsed = parseSku(candidate);
    if (reparsed) return reparsed.canonical;
  }

  return null;
}

/** Normalize and parse in one step. */
export function normalizeAndParse(sku: string): SkuParts | null {
  const canonical = normalizeSku(sku);
  return canonical ? parseSku(canonical) : null;
}
