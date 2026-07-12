/**
 * @module @/lib/http/params — dynamic-segment decoding, one truth.
 *
 * Next.js App Router hands route handlers their dynamic params
 * PERCENT-ENCODED (a request for `/api/v1/universal/card/pkm-sv8a-089%2F080-en`
 * yields `sku === "pkm-sv8a-089%2F080-en"`). Card numbers in several games
 * legitimately contain `/` (Vanguard `DZ-BT14/018`, Pokémon `089/080`), so
 * their SKUs and card-number URL segments arrive encoded and MUST be
 * decoded before touching the database — otherwise the lookup misses and
 * the platform 404s on a card it actually stocks (defect: slash-links,
 * 2026-07).
 *
 * `decodeURIComponent` throws `URIError` on malformed input (a stray `%`
 * a caller typed by hand). A malformed segment is the caller's literal
 * intent as far as we can tell — return it unchanged and let the catalog
 * lookup answer honestly (404 with guidance), rather than 500ing.
 */

/** Decode one dynamic path segment; malformed escapes fall back to raw. */
export function decodePathParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
