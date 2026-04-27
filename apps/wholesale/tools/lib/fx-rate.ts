// GBP/JPY exchange rate fetcher

const RATE_API_URL = "https://open.er-api.com/v6/latest/GBP";
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
    const res = await fetch(RATE_API_URL);
    if (!res.ok) {
      throw new Error(`FX API returned ${res.status}`);
    }
    const data = await res.json();
    const rate = data.rates?.JPY;
    if (typeof rate !== "number") {
      throw new Error("JPY rate not found in API response");
    }
    validateRate(rate);
    console.log(`  GBP/JPY rate from API: ${rate}`);
    return rate;
  } catch (err) {
    throw new Error(
      `Failed to fetch GBP/JPY rate: ${err}. Set GBP_JPY_RATE env var as fallback.`
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
