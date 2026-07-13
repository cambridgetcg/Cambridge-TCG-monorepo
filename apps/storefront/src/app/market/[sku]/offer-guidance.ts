// Pure pricing-anchor helpers for the offer composer. No DB, no fetch —
// unit-tested in offer-guidance.test.ts.
//
// Anchor policy: open bid/ask terms remain the primary market facts. The
// optional secondary anchor is a labelled catalogue reference observation,
// never a completed-trade statistic and never anyone's offer.

export type OfferAnchor =
  | { kind: "catalogue-reference"; value: number }
  | null;

/** Pick the labelled catalogue reference, or null when none exists. */
export function pickOfferAnchor(referencePrice: number | null): OfferAnchor {
  if (referencePrice !== null && referencePrice > 0) {
    return { kind: "catalogue-reference", value: referencePrice };
  }
  return null;
}

/** Signed percentage delta of `offer` vs `anchor`, rounded to 0.1%.
 *  Negative = offer is below the anchor. Null when the anchor can't
 *  divide. */
export function pctDelta(offer: number, anchor: number): number | null {
  if (!Number.isFinite(offer) || !Number.isFinite(anchor) || anchor <= 0) return null;
  return Math.round(((offer - anchor) / anchor) * 1000) / 10;
}

/** Human phrasing for a delta: "12.5% below", "3% above", "at". */
export function describeDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return "at";
  const abs = Math.abs(delta);
  const n = Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1);
  return `${n}% ${delta < 0 ? "below" : "above"}`;
}

/** Client-side pre-check against the caller's trust limits, so the 403
 *  the server would return is announced BEFORE submit. The server
 *  re-checks (canTrade) — this is a courtesy mirror, not the gate. */
export function tradeLimitWarning(
  value: number,
  limits: { tradeLimit: number | null; dailyLimit: number | null } | null,
): string | null {
  if (!limits || !Number.isFinite(value) || value <= 0) return null;
  if (limits.tradeLimit !== null && value > limits.tradeLimit) {
    return `£${value.toFixed(2)} exceeds your per-trade limit of £${limits.tradeLimit.toFixed(2)} — the platform will reject it. Build trust with smaller trades first.`;
  }
  if (limits.dailyLimit !== null && value > limits.dailyLimit) {
    return `£${value.toFixed(2)} exceeds your daily trading limit of £${limits.dailyLimit.toFixed(2)} — the platform will reject it.`;
  }
  return null;
}
