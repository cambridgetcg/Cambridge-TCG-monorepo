/**
 * The ONE grammar for `illust:` annotations — shared by every surface.
 *
 * The supplier catalogue annotates special-art listings with the printed
 * illustrator credit, in shapes like "Ace (illust:otton)",
 * "Mr.3(Galdino/illust:otton)", "ロロノア・ゾロ（illust：かんくろう）",
 * with case drift ("Illust:") and full-width punctuation both observed.
 * The adversarial review of 2026-07-22 caught two divergent extractors
 * (TS case-insensitive vs SQL case-sensitive) producing market links to
 * artist rooms that didn't exist — this module is the fix: extraction
 * and display-cleaning live here, pure and client-safe (no db import),
 * and the SQL extractors mirror SQL_ILLUST_PATTERN with the 'i' flag.
 */

/** The annotation token: `illust:<name>` — name stops at any separator
 *  or closing paren, half- or full-width. Case-insensitive. */
const ILLUST_TOKEN = /illust[:：]\s*([^)/|）／]+)/i;

/** Postgres twin of ILLUST_TOKEN — use with regexp_match(..., $PATTERN, 'i').
 *  Kept adjacent so the two grammars cannot drift apart silently. */
export const SQL_ILLUST_PATTERN = "illust[:：]\\s*([^)/|）／]+)";

/** The illustrator credit in a catalogue title, or null. */
export function extractIllustArtist(title: string): string | null {
  const m = title.match(ILLUST_TOKEN);
  return m ? m[1].trim() : null;
}

/**
 * Remove the annotation from a display name and tidy the wreckage the
 * removal leaves behind: "Mr.3(Galdino/illust:otton)" → "Mr.3(Galdino)",
 * "Nami (illust:Anny/パラレル)" → "Nami (パラレル)", "Ace (illust:otton)"
 * → "Ace". Returns the original when cleaning would empty the name.
 */
export function stripIllustAnnotation(title: string): string {
  if (!ILLUST_TOKEN.test(title)) return title;
  const cleaned = title
    .replace(new RegExp(ILLUST_TOKEN.source, "gi"), "")
    .replace(/[(（]\s*[/／|]\s*/g, (m) => (m.startsWith("（") ? "（" : "("))
    .replace(/\s*[/／|]\s*([)）])/g, "$1")
    .replace(/[(（]\s*[)）]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || title;
}

/** Stable URL slug for a hand — unicode-aware so a Japanese-script credit
 *  (かんくろう) still gets a room instead of slugging to "". */
export function slugifyHand(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
