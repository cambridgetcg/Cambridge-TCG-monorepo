/**
 * Fetch live GBP/JPY exchange rate.
 *
 * Primary:  open.er-api.com/v6/latest/GBP
 * Fallback: api.exchangerate.host/latest?base=GBP
 *
 * Returns the JPY rate as a number (e.g. 211.26).
 * Throws if both sources fail.
 */

interface ErApiResponse {
  rates: Record<string, number>;
}

interface ExchangeRateHostResponse {
  rates: Record<string, number>;
}

export async function fetchGbpJpyRate(): Promise<number> {
  // ── Primary: open.er-api.com ───────────────────────────────────────────────
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/GBP", {
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data: ErApiResponse = await res.json() as ErApiResponse;
      const jpy = data?.rates?.JPY;
      if (typeof jpy === "number" && jpy > 0) {
        return jpy;
      }
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
      const data: ExchangeRateHostResponse = await res.json() as ExchangeRateHostResponse;
      const jpy = data?.rates?.JPY;
      if (typeof jpy === "number" && jpy > 0) {
        return jpy;
      }
    }
  } catch {
    // fall through
  }

  throw new Error("Failed to fetch GBP/JPY rate from all sources");
}
