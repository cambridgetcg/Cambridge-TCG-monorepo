/**
 * @module @/lib/market/biography
 *
 * "The life of this card" — a card's collectors'-market biography, composed
 * ONLY from real trade and order-book data. This is the museum telling a TRUE
 * story where a lesser one would print invented lore: no fabricated canon,
 * no imagined provenance. Every clause traces to a number that actually
 * happened here. When a card has no market life yet, we do not invent one —
 * we say so plainly (the empty plinth). Absence, honestly named, is also a
 * story: the invitation to begin it.
 *
 * Pure + deterministic (pass `now` to keep it so). No fetching, no I/O.
 */

import type { UnifiedMarketView } from "./unified";
import { formatPrice } from "@/lib/format";

export type BiographyKind = "traded" | "listed" | "empty";

export interface CardBiography {
  kind: BiographyKind;
  /** True when there is nothing real to tell — render the invitation, not a fiction. */
  empty: boolean;
  /** The narrative, in reading order. Each sentence composed from real fields. */
  sentences: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/** "March 2026" from an ISO date, or "" when unparseable. */
function monthYear(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/**
 * Compose the card's market biography from its unified market view.
 *
 * @param view  getUnifiedMarketView(sku) result, or null when unavailable.
 * @param opts.referencePrice  the labelled reference price (card.price_gbp),
 *   used only as a last resort for "where it rests" — never called an offer.
 * @param opts.now  clock injection for determinism (defaults to Date.now()).
 */
export function deriveCardBiography(
  view: UnifiedMarketView | null,
  opts?: { referencePrice?: number | null; now?: number },
): CardBiography {
  const now = opts?.now ?? Date.now();
  const reference = opts?.referencePrice ?? view?.reference_price ?? null;

  // The real sales on record here (the visible tape), oldest first.
  const trades = (view?.recent_trades ?? [])
    .map((t) => ({ price: parseFloat(t.price), at: new Date(t.created_at).getTime() }))
    .filter((t) => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.at))
    .sort((a, b) => a.at - b.at);

  const bestAsk = view?.best_ask ?? null;
  const bestBid = view?.best_bid ?? null;

  // Nothing true to say: no sales, no live book. Do not fabricate a life.
  if (trades.length === 0 && bestAsk == null && bestBid == null) {
    return {
      kind: "empty",
      empty: true,
      sentences: [
        "Not yet traded on the collectors' market — its provenance here begins with whoever lists it first.",
      ],
    };
  }

  // Listed on the wall, but no sale recorded here yet.
  if (trades.length === 0) {
    let s: string;
    if (bestAsk != null && bestBid != null) {
      s = `On the wall but not yet sold here — collectors are asking from ${formatPrice(bestAsk)}, with a standing offer of ${formatPrice(bestBid)}. Its market life begins with the first sale.`;
    } else if (bestAsk != null) {
      s = `On the wall but not yet sold here — a collector is asking ${formatPrice(bestAsk)}. Its market life begins with the first sale.`;
    } else {
      s = `No sale on record here yet, but a collector's offer stands at ${formatPrice(bestBid as number)}.`;
    }
    return { kind: "listed", empty: false, sentences: [s] };
  }

  // Traded: compose the biography from the real tape.
  const prices = trades.map((t) => t.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const n = trades.length;
  const firstMY = monthYear(trades[0].at);
  const lastMY = monthYear(trades[n - 1].at);
  const in24h = trades.filter((t) => now - t.at < DAY).length;
  const in7d = trades.filter((t) => now - t.at < 7 * DAY).length;

  const sentences: string[] = [];

  // 1. The span + the count (honest: "on record here" = the visible tape).
  if (n === 1) {
    sentences.push(`One sale on record here${firstMY ? `, in ${firstMY}` : ""}.`);
  } else if (firstMY && lastMY && firstMY !== lastMY) {
    sentences.push(`${n} sales on record here, from ${firstMY} to ${lastMY}.`);
  } else {
    sentences.push(`${n} sales on record here${firstMY ? `, in ${firstMY}` : ""}.`);
  }

  // 2. The price range it has actually changed hands in.
  if (n > 1 && max > min) {
    sentences.push(`It has changed hands between ${formatPrice(min)} and ${formatPrice(max)}.`);
  } else {
    sentences.push(`It changed hands at ${formatPrice(prices[prices.length - 1])}.`);
  }

  // 3. Recent momentum — real counts only; silence is an honest fact.
  if (in24h > 0) {
    sentences.push(`${in24h} of them in the last day.`);
  } else if (in7d > 0) {
    sentences.push(`${in7d} in the past week.`);
  } else {
    sentences.push("Quiet on the market of late.");
  }

  // 4. Where it rests now (best ask, else the labelled reference, else last sale).
  const resting = bestAsk ?? reference ?? prices[prices.length - 1];
  if (bestAsk != null && bestBid != null) {
    sentences.push(`It rests now with collectors asking from ${formatPrice(bestAsk)} and bidding to ${formatPrice(bestBid)}.`);
  } else if (bestAsk != null) {
    sentences.push(`It rests now with collectors asking from ${formatPrice(bestAsk)}.`);
  } else if (resting != null && Number.isFinite(resting)) {
    sentences.push(`It rests now around ${formatPrice(resting)}.`);
  }

  return { kind: "traded", empty: false, sentences };
}
