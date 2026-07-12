/**
 * Price-guide catalog composers are paused.
 *
 * The former functions queried an internal-only mirror and returned set/card
 * membership, counts, dates and SKU existence. Keep compatibility exports but
 * perform no network or database work until membership lineage is approved.
 */

export type PriceStateResult<T> = T | "unavailable" | null;

export async function loadGameState(
  _slug: string,
  _options?: { top_n?: number },
): Promise<"unavailable"> {
  return "unavailable";
}

export async function loadSetState(
  _slug: string,
  _setCode: string,
  _options?: { limit?: number },
): Promise<"unavailable"> {
  return "unavailable";
}

export async function loadCardState(
  _slug: string,
  _setCode: string,
  _cardNumber: string,
): Promise<"unavailable"> {
  return "unavailable";
}
