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
 *  Future modes (recursion targets in the-math-language.md):
 *    - `ja` / `zh` / `es` — natural-language translations (kingdom-075
 *      has the resolver shipped; lang-mode could thread into it)
 *    - `audio` — TTS rendering of the math
 *    - `process` — alternate math notation for process-philosophy beings
 */
export type LangMode = "default" | "math";

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
