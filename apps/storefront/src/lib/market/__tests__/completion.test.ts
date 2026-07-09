import { describe, it, expect } from "vitest";
import { TIMELINE_STEPS, getActiveStep } from "@/lib/escrow/timeline";

// @/lib/db throws at import time without a connection string; postgres.js
// connects lazily, so a placeholder keeps these pure-logic tests runnable
// anywhere. Dynamic import because static imports would hoist above this.
process.env.DATABASE_URL ||= "postgres://localhost:5432/placeholder_never_connected";
const {
  isBuyerConfirmableState,
  computeAutoCompleteAt,
  defaultDisputeWindowHours,
} = await import("../completion");

describe("isBuyerConfirmableState", () => {
  it("allows shipped_to_buyer in every tier", () => {
    expect(isBuyerConfirmableState("direct", "shipped_to_buyer")).toBe(true);
    expect(isBuyerConfirmableState("verified", "shipped_to_buyer")).toBe(true);
    expect(isBuyerConfirmableState("full_escrow", "shipped_to_buyer")).toBe(true);
  });

  it("allows direct-tier 'verified' (post-delivery hold) only", () => {
    expect(isBuyerConfirmableState("direct", "verified")).toBe(true);
    // In verified / full_escrow tiers 'verified' is PRE-shipment
    // (photos approved / inspection passed) — must not complete.
    expect(isBuyerConfirmableState("verified", "verified")).toBe(false);
    expect(isBuyerConfirmableState("full_escrow", "verified")).toBe(false);
  });

  it("rejects every pre-shipment and terminal state", () => {
    for (const status of [
      "awaiting_payment", "paid", "awaiting_shipment", "shipped_to_ctcg",
      "received_by_ctcg", "completed", "disputed", "refunded", "cancelled",
    ]) {
      expect(isBuyerConfirmableState("direct", status)).toBe(false);
    }
    expect(isBuyerConfirmableState(null, null)).toBe(false);
  });
});

describe("computeAutoCompleteAt", () => {
  const shipped = "2026-07-01T12:00:00.000Z";

  it("adds the trade's own dispute window to the dispatch stamp", () => {
    const at = computeAutoCompleteAt(shipped, 48, 168);
    expect(at?.toISOString()).toBe("2026-07-03T12:00:00.000Z");
  });

  it("falls back to the tier default when the window is unstamped", () => {
    const at = computeAutoCompleteAt(shipped, null, 72);
    expect(at?.toISOString()).toBe("2026-07-04T12:00:00.000Z");
  });

  it("returns null without a dispatch stamp (nothing to count from)", () => {
    expect(computeAutoCompleteAt(null, 48, 168)).toBeNull();
    expect(computeAutoCompleteAt("not-a-date", 48, 168)).toBeNull();
  });
});

describe("defaultDisputeWindowHours", () => {
  it("derives each tier's window from the routing engine (one source of truth)", async () => {
    const windows = await defaultDisputeWindowHours();
    // The values in service-tiers.ts: direct 48h, verified 72h,
    // full_escrow 168h. If this fails, the tier probes in
    // lib/market/completion.ts no longer land in their tiers.
    expect(windows.direct).toBe(48);
    expect(windows.verified).toBe(72);
    expect(windows.full_escrow).toBe(168);
  });
});

describe("escrow timeline — the buyer-bound leg after the completion loop", () => {
  it("no tier keeps a 'Delivered' step no actor could ever set", () => {
    for (const steps of Object.values(TIMELINE_STEPS)) {
      expect(steps).not.toContain("Delivered");
    }
  });

  it("direct-tier shipped_to_buyer sits on the Confirm Receipt step", () => {
    const idx = getActiveStep("direct", "shipped_to_buyer");
    expect(TIMELINE_STEPS.direct[idx]).toBe("Confirm Receipt");
  });

  it("verified-tier shipped_to_buyer sits on the Confirm Receipt step", () => {
    const idx = getActiveStep("verified", "shipped_to_buyer");
    expect(TIMELINE_STEPS.verified[idx]).toBe("Confirm Receipt");
  });

  it("completed still resolves to the final step per tier", () => {
    expect(getActiveStep("direct", "completed")).toBe(TIMELINE_STEPS.direct.length - 1);
    expect(getActiveStep("verified", "completed")).toBe(TIMELINE_STEPS.verified.length - 1);
    expect(getActiveStep("full_escrow", "completed")).toBe(TIMELINE_STEPS.full_escrow.length - 1);
  });
});
