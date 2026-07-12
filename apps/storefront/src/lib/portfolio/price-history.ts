/**
 * Legacy retail price observations remain stored for rights review. Public and
 * account-facing sampling and projection are paused; callers receive explicit
 * empty results rather than zero-valued prices.
 */

export interface RetailObservationTickResult {
  skusConsidered: number;
  captured: number;
  failed: number;
  skipped: number;
}

/** @deprecated Use RetailObservationTickResult. */
export type PriceHistoryTickResult = RetailObservationTickResult;

export async function runRetailObservationTick(): Promise<RetailObservationTickResult> {
  return { skusConsidered: 0, captured: 0, failed: 0, skipped: 0 };
}

export interface PriceChange {
  sku: string;
  latest: number;
  previous: number;
  delta: number;
  deltaPct: number;
}

export async function getPriceChanges(
  _skus: string[],
  _daysAgo: number,
): Promise<Map<string, PriceChange>> {
  return new Map();
}

export async function getPriceSeries(
  _sku: string,
  _days = 30,
): Promise<Array<{ captured_on: string; spot_gbp: number }>> {
  return [];
}
