/** Public sold-comps policy. No transaction rows are queried while paused. */

export const SOLD_COMPS_PUBLICATION = Object.freeze({
  status: "paused" as const,
  reason:
    "Completed trades and settled auctions have no versioned sold-data publication choice. The former K=5 aggregate could also reveal exact observed prices and did not require distinct people.",
  resumes_when: [
    "Every included transaction has a current, purpose-specific publication receipt.",
    "A delayed coarse projector prevents exact-value reconstruction and time differencing.",
    "The public-domain license is confirmed for the projected output.",
  ] as const,
});

export function soldCompsPausedData(sku?: string) {
  return {
    "@kind": sku ? "sold-comps-sku" : "sold-comps",
    ...(sku ? { sku } : {}),
    ...SOLD_COMPS_PUBLICATION,
    buckets: [],
    published_bucket_count: 0,
  };
}
