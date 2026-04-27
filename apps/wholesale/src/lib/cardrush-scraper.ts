/**
 * CardRush scraper — fetches a product page and extracts the A- condition price.
 *
 * Supported domains:
 *   https://www.cardrush-op.jp/product/{id}       — One Piece
 *   https://www.cardrush-pokemon.jp/product/{id}   — Pokémon
 *   https://www.cardrush-db.jp/product/{id}        — Dragon Ball
 *
 * Price extraction:
 *   1. Look for the 状態A- (A-minus condition) row and return its price.
 *   2. Fallback: return the first ¥ price visible on the page.
 *   3. If nothing found, return { priceJpy: null, source: null }.
 */

export interface ScraperResult {
  priceJpy: number | null;
  source: "a-minus" | "base" | null;
}

/**
 * Fetch the CardRush product page at `url` and return the A- condition price.
 * Uses a browser-like User-Agent to avoid simple bot blocks.
 */
export async function scrapeCardrushPrice(url: string): Promise<ScraperResult> {
  let html: string;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.5",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { priceJpy: null, source: null };
    }

    html = await res.text();
  } catch {
    return { priceJpy: null, source: null };
  }

  // ── 1. Try to find A- condition price ──────────────────────────────────────
  // CardRush renders condition rows in a table or list. Look for the text
  // "状態A-" (or "A-" near a price) followed by a ¥ amount.
  //
  // Patterns seen in the wild:
  //   <td>状態A-</td><td>¥1,200</td>
  //   <span class="condition">A-</span>...¥1,200
  //   data-condition="A-" ... ¥1,200
  //   "A-" within a few hundred chars of a ¥ figure

  const aMinusPrice = extractConditionPrice(html, "状態A-") ?? extractConditionPrice(html, "A-");
  if (aMinusPrice !== null) {
    return { priceJpy: aMinusPrice, source: "a-minus" };
  }

  // ── 2. Fallback: first visible ¥ price ─────────────────────────────────────
  const basePrice = extractFirstPrice(html);
  if (basePrice !== null) {
    return { priceJpy: basePrice, source: "base" };
  }

  return { priceJpy: null, source: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Find the ¥ price that appears within ~400 characters after `conditionText`.
 */
function extractConditionPrice(html: string, conditionText: string): number | null {
  const idx = html.indexOf(conditionText);
  if (idx === -1) return null;

  // Search forward up to 400 chars for a ¥ price
  const window = html.slice(idx, idx + 400);
  return extractFirstPrice(window);
}

/**
 * Extract the first ¥ price (integer yen) from an HTML fragment.
 * Handles: ¥1,200  ¥1200  &yen;1,200  ￥1,200
 */
function extractFirstPrice(fragment: string): number | null {
  // Match ¥ / ￥ / &yen; followed by digits (with optional commas)
  const match = fragment.match(/[¥￥][\s]*([0-9][0-9,]*)|&yen;[\s]*([0-9][0-9,]*)/);
  if (!match) return null;

  const raw = (match[1] ?? match[2]).replace(/,/g, "");
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

/**
 * Decode a CardRush product ID from a SKU suffix.
 * product_id = CONSTANT - parseInt(suffix, 36)
 *
 * Not needed when using cardrush_url directly, but exposed for reference / testing.
 */
export const CARDRUSH_CONSTANTS = [
  1495215, 1495247, 1495727, 1495759,
  52116975, 52117007, 52117487, 52117519,
] as const;

export function decodeProductId(skuSuffix: string): number | null {
  const suffix36 = parseInt(skuSuffix, 36);
  if (isNaN(suffix36)) return null;

  for (const c of CARDRUSH_CONSTANTS) {
    const id = c - suffix36;
    if (id > 0) return id;
  }
  return null;
}
