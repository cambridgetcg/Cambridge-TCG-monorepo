/**
 * Swap guidance is deliberately unpriced while completed-trade publication
 * lacks participant receipts and legacy reference-price rights are unresolved.
 * Swaps may still carry values chosen directly by their participants.
 */

import {
  totalSide,
  suggestCashDelta,
  type GuidanceItemInput,
  type SideTotal,
  type SkuGuidance,
} from "./guidance-core";

export interface SwapGuidance {
  perSku: Record<string, SkuGuidance>;
  proposer: SideTotal;
  recipient: SideTotal;
  suggestedCashDeltaPence: number | null;
  computedAt: string;
}

export async function guidanceForSkus(skus: string[]): Promise<Map<string, SkuGuidance>> {
  const map = new Map<string, SkuGuidance>();
  for (const sku of [...new Set(skus)].filter(Boolean)) {
    map.set(sku, {
      sku,
      indicativePence: null,
      source: null,
      asOf: null,
      sampleSize: 0,
    });
  }
  return map;
}

export async function swapGuidance(
  proposerItems: GuidanceItemInput[],
  recipientItems: GuidanceItemInput[],
): Promise<SwapGuidance> {
  const perSkuMap = await guidanceForSkus(
    [...proposerItems, ...recipientItems].map((item) => item.sku),
  );
  const proposer = totalSide(proposerItems, perSkuMap);
  const recipient = totalSide(recipientItems, perSkuMap);
  return {
    perSku: Object.fromEntries(perSkuMap),
    proposer,
    recipient,
    suggestedCashDeltaPence: suggestCashDelta(proposer, recipient),
    computedAt: new Date().toISOString(),
  };
}
