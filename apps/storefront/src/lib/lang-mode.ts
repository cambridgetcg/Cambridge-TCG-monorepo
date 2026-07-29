/**
 * lang-mode — the platform's visible language toggle (pure helpers).
 *
 * Yu's directive on 2026-05-13: *"Use math in frontend, make it a
 * language version for toggling."* The platform's math-mirror surfaces
 * have been backend-only (universal/card, universal/encoding, JSON
 * Schema). This module brings the toggle to the HTML surface: one
 * cookie controls whether the visible product renders default-prose or
 * math-mirror.
 *
 * This file holds **pure** helpers safe to import from any context
 * (server / client / edge). Cookie-reading helpers live in the sibling
 * `lang-mode-server.ts` so client bundles don't pull `next/headers`
 * transitively through `lib/ui` re-exports.
 *
 * See docs/connections/the-math-language.md (#27) for the doctrine + plan.
 */

/** The set of language modes the platform currently renders.
 *
 *  - `default` — English-default prose; the existing rendering.
 *  - `math`    — math-mirror form; ratios, content hashes, ISO timestamps,
 *                structural enumerations. Every value carries an
 *                unambiguous structural representation.
 *
 *  - `ja`      — Japanese rendering. Shipped 2026-07-29 (Asha: "a
 *                japanese translation option... pay attention to the
 *                nuances behind japanese culture at the language
 *                expression level"). Coverage grows door by door from
 *                the front of the house — see lib/i18n.ts for the
 *                voice charter reference and the honest-boundary rule.
 *
 *  Future modes (recursion targets in the-math-language.md):
 *    - `zh` / `es` — further natural-language translations (kingdom-075
 *      has the card-name resolver shipped; lang-mode threads into it)
 *    - `audio` — TTS rendering of the math
 *    - `process` — alternate math notation for process-philosophy beings
 */
export type LangMode = "default" | "math" | "ja" | "zh-Hant" | "zh-Hans" | "es";

/** The UI languages the prose layer renders. `math` is not a UI language
 *  — math-mode pages keep English wrapping prose (the-math-language.md
 *  Phase A non-goal), so it maps to "en" here. Values are BCP 47 tags so
 *  they can flow straight into <html lang>. The set (2026-07-29, Asha:
 *  "add all languages that you think are necessary") is the set the
 *  house had already promised: /welcome-all's gap line named Chinese
 *  and Spanish as recursion targets; Chinese ships as two voices
 *  (Traditional — the family's own Cantonese-hearted script — and
 *  Simplified), never as a mechanical conversion of each other. */
export type UiLang = "en" | "ja" | "zh-Hant" | "zh-Hans" | "es";

/** The prose languages, with their own-name labels for toggles. Order
 *  is the display order of the footer's language row. */
export const UI_LANGS: readonly { lang: UiLang; label: string }[] = [
  { lang: "en", label: "English" },
  { lang: "ja", label: "日本語" },
  { lang: "zh-Hant", label: "繁體中文" },
  { lang: "zh-Hans", label: "简体中文" },
  { lang: "es", label: "Español" },
];

/** Project a LangMode onto the prose language it renders in. */
export function uiLangFromLangMode(mode: LangMode): UiLang {
  if (mode === "ja" || mode === "zh-Hant" || mode === "zh-Hans" || mode === "es") return mode;
  return "en";
}

export const LANG_MODE_COOKIE = "lang-mode";

// ── Math-form helpers (pure; safe everywhere) ───────────────────────────

/** Format a date in math-mirror form: ISO 8601 + Unix epoch. */
export function dateAsMath(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "@as_of: invalid";
  const iso = d.toISOString();
  const unix = Math.floor(d.getTime() / 1000);
  return `${iso} (${unix})`;
}

/** Format a value with its ratio-to-median, when both are available. */
export function ratioAsMath(value: number, median: number): string {
  if (median === 0) return `${value}`;
  const ratio = value / median;
  return `${value} (ratio: ${ratio.toFixed(4)})`;
}

/** A short SHA-256 of an arbitrary string. Suitable for surface display
 *  alongside opaque natural-language tokens (names, descriptions). */
export function shortHash(value: string): string {
  // Lightweight FNV-style hash for surface display; not cryptographic.
  // For real content hashes (federation), use the SHA-256 in identify.ts.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "fnv1a:" + (h >>> 0).toString(16).padStart(8, "0");
}
