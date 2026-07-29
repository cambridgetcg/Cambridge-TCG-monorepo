/**
 * i18n — the bilingual string primitive for the Japanese rendering.
 *
 * Asha, 2026-07-29: "wanna have a japanese translation option for
 * cambridgetcg. Pay attention to the nuances behind japanese culture
 * too! At the language expression level."
 *
 * ── The shape ───────────────────────────────────────────────────────────
 *
 * One tiny primitive: `Bi` — a string that exists in both languages —
 * and `pick(bi, lang)`. Translations live NEXT TO their English source
 * (a `ja` field beside the `label`, a `*_JA` export beside the constant),
 * never in a far-away catalogue file: one truth in one place, and the
 * next editor who changes the English sees the Japanese asking to move
 * with it.
 *
 * The language is the `ja` mode of the existing lang-mode cookie
 * (lib/lang-mode.ts) — one cookie, one shape, shared with the math
 * toggle. `<html lang>` follows it in layout.tsx; the CSS wardrobe for
 * Japanese type (leading, no italics, palt display kana) lives in
 * themes.css under `:lang(ja)`.
 *
 * ── The voice ───────────────────────────────────────────────────────────
 *
 * Every Japanese string obeys the voice charter at
 * docs/connections/the-japanese-voice.md — warm です/ます without keigo
 * stacking, 体言止め headings, zero-pronoun address, the glossary
 * (相場・相場帖・広場・手引き・預かる…), and the 約物 law. Do not add a
 * Japanese string without reading it.
 *
 * ── The honest boundary ─────────────────────────────────────────────────
 *
 * Coverage grows door by door from the front of the house (chrome, home,
 * culture). An untranslated page renders its English under lang="ja"
 * until its door is translated — a named gap, stated in the footer note,
 * never papered over with machine output.
 */

import type { UiLang } from "./lang-mode";

export type { UiLang } from "./lang-mode";
export { uiLangFromLangMode } from "./lang-mode";

/** A string that exists in both of the house's first two prose
 *  languages. Kept for the ja-era call sites; new surfaces use Poly. */
export interface Bi {
  en: string;
  ja: string;
}

/** A string across the whole language family. Every language except
 *  English is optional: a missing voice falls back to English rather
 *  than to a blank or a machine guess — honest beats broken. */
export interface Poly {
  en: string;
  ja?: string;
  "zh-Hant"?: string;
  "zh-Hans"?: string;
  es?: string;
}

/** Pick the rendering for the active UI language, falling back to
 *  English when that language's voice hasn't been written yet. */
export function tx(p: Poly, lang: UiLang): string {
  if (lang === "en") return p.en;
  return p[lang] ?? p.en;
}

/** Pick a rendered NODE (rich JSX) for the active UI language, falling
 *  back to English. For surfaces whose markup order differs per language
 *  — most surfaces should instead keep neutral markup and tx() their
 *  text pieces. */
export function txNode<T>(
  lang: UiLang,
  map: Partial<Record<UiLang, T>> & { en: T },
): T {
  return map[lang] ?? map.en;
}

/** The inter-piece spacer: CJK runs abut; Latin runs take a space. */
export function sp(lang: UiLang): string {
  return lang === "ja" || lang === "zh-Hant" || lang === "zh-Hans" ? "" : " ";
}

/** Pick the rendering for the active UI language. */
export function pick(bi: Bi, lang: UiLang): string {
  return lang === "ja" ? bi.ja : bi.en;
}

/** Pick with a graceful fallback for optional translations: a missing or
 *  empty ja falls back to the English rather than rendering a blank —
 *  honest beats broken. (ja-era helper; new call sites use tx.) */
export function pickLoose(
  en: string,
  ja: string | undefined,
  lang: UiLang,
): string {
  return lang === "ja" && ja ? ja : en;
}
