/**
 * Language detector — pull an ISO 639-1 code from an eBay title.
 *
 * Most titles are written in English regardless of the *card's* language.
 * That means absence of a marker means *default English print*, except
 * for games whose default-language is *not* English (Bandai's Asian
 * releases — DBS, DBF, OPTCG-JP — are JP-default when sold in Japan).
 *
 * Three layers:
 *
 *   1. Explicit marker — "Japanese", "日本語", "Korean", "한국어", etc.
 *   2. Card-number language hint — Yu-Gi-Oh embeds the language in the
 *      collector code itself ("LOB-EN001" → en; "LOB-JP001" → ja).
 *   3. Default — fall back to the game's primary publisher language.
 *
 * Substrate-honest: when nothing matches, return `lang: null` with
 * `inferred: false` and let the normalizer decide what to do (it can
 * fall back to the game default, with `confidence` reflecting the
 * uncertainty).
 */

import type { GameCode } from "@cambridge-tcg/sku";

const EXPLICIT_MARKERS: Array<[RegExp, string]> = [
  [/\b(japanese|nihongo)\b/i, "ja"],
  [/(日本語|日本版|日版)/, "ja"],
  [/\b(korean|hangul)\b/i, "ko"],
  [/(한국어|韓国)/, "ko"],
  [/\b(traditional\s+chinese|繁體中文|繁体中文)\b/i, "zh-Hant"],
  [/\b(simplified\s+chinese|簡體中文|简体中文)\b/i, "zh-Hans"],
  [/\b(chinese|中文)\b/i, "zh"],
  [/\b(french|fran[cç]ais(?:e)?)\b/i, "fr"],
  [/\b(german|deutsch(?:e)?|de\s+ger)\b/i, "de"],
  [/\b(italian|italian[ao])\b/i, "it"],
  [/\b(spanish|espa[ñn]ol[ao]?)\b/i, "es"],
  [/\b(portuguese|portugu[eê]s(?:a)?)\b/i, "pt"],
  [/\b(russian|русский)\b/i, "ru"],
  [/\b(thai|ภาษาไทย)\b/i, "th"],
  [/\benglish\b/i, "en"],
];

/**
 * Yu-Gi-Oh card numbers embed language as the middle pair:
 *   LOB-EN001 → en
 *   LOB-JP001 → ja
 *   LOB-KR001 → ko
 *   LOB-FR001 → fr
 *   LOB-DE001 → de
 *   LOB-IT001 → it
 *   LOB-PT001 → pt
 *   LOB-SP001 → es
 *   LOB-AE001 → en (English Asian export)
 *   LOB-TC001 → zh-Hant
 *   LOB-SC001 → zh-Hans
 */
const YGO_LANG_MAP: Record<string, string> = {
  EN: "en",
  JP: "ja",
  KR: "ko",
  FR: "fr",
  DE: "de",
  IT: "it",
  PT: "pt",
  SP: "es",
  AE: "en",
  TC: "zh-Hant",
  SC: "zh-Hans",
};

const YGO_PATTERN = /\b[A-Z]{2,4}-([A-Z]{2})\d{3}\b/i;

const GAME_DEFAULT_LANG: Record<GameCode, string> = {
  op: "en",   // OP-TCG sold globally; JP is marked explicitly
  pkm: "en",
  mtg: "en",
  ygo: "en",
  dbs: "en",
  dbf: "en",
  wei: "ja",  // Weiß Schwarz is JP-default in most listings
  vng: "ja",
  dmw: "en",
  bsr: "en",
  lcg: "en",
  fab: "en",
  lgr: "en",
  swu: "en",
  sor: "en",
  alt: "en",
  rft: "en",
  rsh: "ja",
  pkp: "en",
  gen: "en",
  tst: "en",
};

export interface LanguageDetection {
  /** ISO 639-1 code (or BCP-47 sub-tag for zh-Hant/zh-Hans). Null when no signal. */
  lang: string | null;
  /** How we picked it. */
  source: "explicit" | "card-number-hint" | "game-default" | "unknown";
  /** Confidence delta — explicit beats hint beats default. */
  confidence: number;
}

export function detectLanguage(title: string, game: GameCode | null): LanguageDetection {
  if (typeof title !== "string" || title.length === 0) {
    return { lang: null, source: "unknown", confidence: 0 };
  }

  for (const [pattern, lang] of EXPLICIT_MARKERS) {
    if (pattern.test(title)) {
      return { lang, source: "explicit", confidence: 0.15 };
    }
  }

  if (game === "ygo") {
    const m = title.match(YGO_PATTERN);
    if (m && YGO_LANG_MAP[m[1].toUpperCase()]) {
      return { lang: YGO_LANG_MAP[m[1].toUpperCase()], source: "card-number-hint", confidence: 0.1 };
    }
  }

  if (game !== null && game in GAME_DEFAULT_LANG) {
    return { lang: GAME_DEFAULT_LANG[game], source: "game-default", confidence: 0.03 };
  }

  return { lang: null, source: "unknown", confidence: 0 };
}
