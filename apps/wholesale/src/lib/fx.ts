/**
 * Fetch live GBP/<currency> exchange rate.
 *
 * Primary:  open.er-api.com/v6/latest/GBP
 * Fallback: api.exchangerate.host/latest?base=GBP
 *
 * `fetchGbpJpyRate()` and `fetchGbpUsdRate()` are typed wrappers; the
 * underlying `fetchGbpRate(code)` is generalized so TCGplayer (USD),
 * Cardmarket (EUR), and future sources slot in without per-currency
 * boilerplate. Closes Leak #8 of the-archive.md when used with the
 * `fx_rate_source` column.
 *
 * Returns the rate (units of `code` per 1 GBP, e.g. 211.26 for JPY,
 * 1.27 for USD). Throws if both sources fail.
 */

interface ErApiResponse {
  rates: Record<string, number>;
}

interface ExchangeRateHostResponse {
  rates: Record<string, number>;
}

/**
 * Fetch GBP/<currency> exchange rate. `code` is the target currency
 * (USD / JPY / EUR / ...). Returns units of `code` per 1 GBP.
 */
export async function fetchGbpRate(code: string): Promise<number> {
  const upper = code.toUpperCase();

  // ── Primary: open.er-api.com ───────────────────────────────────────────────
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/GBP", {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data: ErApiResponse = (await res.json()) as ErApiResponse;
      const rate = data?.rates?.[upper];
      if (typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    // fall through to backup
  }

  // ── Fallback: exchangerate.host ────────────────────────────────────────────
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=GBP", {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data: ExchangeRateHostResponse = (await res.json()) as ExchangeRateHostResponse;
      const rate = data?.rates?.[upper];
      if (typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    // fall through
  }

  throw new Error(`Failed to fetch GBP/${upper} rate from all sources`);
}

export async function fetchGbpJpyRate(): Promise<number> {
  return fetchGbpRate("JPY");
}

export async function fetchGbpUsdRate(): Promise<number> {
  return fetchGbpRate("USD");
}
