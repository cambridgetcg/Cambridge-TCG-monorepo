// GBP/JPY exchange rate fetcher. The live path uses ECB statistics.

import { fetchGbpJpyRate as fetchEcbGbpJpyRate } from "../../src/lib/fx";
const MIN_RATE = 100;
const MAX_RATE = 300;

export async function fetchGbpJpyRate(): Promise<number> {
  // Try env var fallback first if set
  const envRate = process.env.GBP_JPY_RATE;
  if (envRate) {
    const rate = parseFloat(envRate);
    validateRate(rate);
    console.log(`  Using GBP_JPY_RATE from env: ${rate}`);
    return rate;
  }

  try {
    const rate = await fetchEcbGbpJpyRate();
    validateRate(rate);
    console.log(`  GBP/JPY rate from ECB statistics: ${rate}`);
    return rate;
  } catch (err) {
    throw new Error(
      `Failed to fetch ECB GBP/JPY rate: ${err}. Set GBP_JPY_RATE env var as an explicit operator fallback.`
    );
  }
}

function validateRate(rate: number): void {
  if (rate < MIN_RATE || rate > MAX_RATE) {
    throw new Error(
      `GBP/JPY rate ${rate} outside sanity range (${MIN_RATE}–${MAX_RATE})`
    );
  }
}
