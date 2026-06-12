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
import { isGameCode } from "./games";

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

function normalizeLang(raw: string): string | null {
  const lower = raw.toLowerCase();
  return LANG_NORMALIZE[lower] ?? null;
}

/**
 * Normalize a bare language token to ISO 639-1 (jp→ja, cn→zh, kr→ko,
 * 3-letter forms folded). Returns null when the token isn't a known
 * language code. Exported for resolvers that compare lang segments
 * from mixed legacy/canonical SKUs without round-tripping a full SKU.
 */
export function normalizeLangCode(raw: string): string | null {
  return normalizeLang(raw);
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

  // The lang regex in parseSku accepts ANY two lowercase letters, so a
  // legacy code like "jp" parses as "valid" and used to short-circuit
  // here un-remapped (normalizeSku("OP-OP01-001-JP") → "op-op01-001-jp",
  // contradicting the documented contract above). Re-emit with the
  // ISO-normalized lang whenever the parsed lang maps to a different code.
  const withNormalizedLang = (p: SkuParts): string => {
    const lang = normalizeLang(p.lang);
    if (!lang || lang === p.lang) return p.canonical;
    return [p.game, p.set, p.number, lang, ...(p.variant ? [p.variant] : [])].join("-");
  };

  // Fast path: already canonical?
  const direct = parseSku(sku.trim());
  if (direct) return withNormalizedLang(direct);

  // Try lowercasing + reparsing.
  const lower = sku.trim().toLowerCase();
  const lowered = parseSku(lower);
  if (lowered) return withNormalizedLang(lowered);

  // Split and try to recover.
  const parts = lower.split("-");
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
