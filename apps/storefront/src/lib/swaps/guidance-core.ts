// Pure price-guidance arithmetic for collector swaps. No DB, no React —
// unit-tested in __tests__/guidance-core.test.ts. The DB-facing wrapper
// lives in ./guidance.ts.
//
// Guidance is INDICATIVE, never enforced: the numbers exist so two
// collectors can see the shape of their swap, not so the platform can
// veto it. Every surfaced number is labelled with its source.

/** Where an indicative price came from — surfaced verbatim in the UI label. */
export type GuidanceSource = "recent_trades" | "ctcg_spot_snapshot";

export interface SkuGuidance {
  sku: string;
  /** Indicative unit price in pence, or null when neither source had data. */
  indicativePence: number | null;
  source: GuidanceSource | null;
  /** When the source value was last true (trade date / snapshot capture date). */
  asOf: string | null;
  /** Number of trades behind a recent_trades figure (0 for spot snapshot). */
  sampleSize: number;
}

export interface GuidanceItemInput {
  sku: string;
  quantity: number;
}

export interface SideTotal {
  /** Sum of indicative unit price × quantity over priced items, in pence. */
  totalPence: number;
  /** Items that had an indicative price. */
  pricedItems: number;
  /** Items where neither source had data — the total EXCLUDES these. */
  unpricedItems: number;
}

/** Median of a non-empty list. Even count → mean of the middle pair, rounded. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Total one side of the swap from a per-sku guidance map. Unpriced items
 * are counted separately, never silently zeroed into the total — the UI
 * must say "N items unpriced" rather than understate the side.
 */
export function totalSide(
  items: GuidanceItemInput[],
  guidance: Map<string, SkuGuidance>,
): SideTotal {
  let totalPence = 0;
  let pricedItems = 0;
  let unpricedItems = 0;
  for (const item of items) {
    const g = guidance.get(item.sku);
    if (g?.indicativePence != null) {
      totalPence += g.indicativePence * item.quantity;
      pricedItems += 1;
    } else {
      unpricedItems += 1;
    }
  }
  return { totalPence, pricedItems, unpricedItems };
}

/**
 * Suggested cash delta in pence, using this module's sign convention:
 * positive = PROPOSER pays the recipient. If the proposer's side is worth
 * less than the recipient's, the proposer tops up the difference.
 * Null when either side has no priced items at all — a suggestion built
 * on zero data would be a fabrication.
 */
export function suggestCashDelta(
  proposerTotal: SideTotal,
  recipientTotal: SideTotal,
): number | null {
  if (proposerTotal.pricedItems === 0 || recipientTotal.pricedItems === 0) return null;
  return recipientTotal.totalPence - proposerTotal.totalPence;
}

/**
 * The GBP value used for the canTrade() gate: the larger side's indicative
 * total plus the recorded cash delta's magnitude. Conservative on purpose —
 * both parties are gated at the full size of the exchange, matching how
 * placeOrder gates a buyer at the full order value.
 */
export function gateValueGbp(
  proposerTotal: SideTotal,
  recipientTotal: SideTotal,
  cashDeltaPence: number,
): number {
  const largerSidePence = Math.max(proposerTotal.totalPence, recipientTotal.totalPence);
  return (largerSidePence + Math.abs(cashDeltaPence)) / 100;
}
