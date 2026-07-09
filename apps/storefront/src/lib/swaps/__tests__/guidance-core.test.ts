import { describe, expect, it } from "vitest";
import {
  gateValueGbp,
  median,
  suggestCashDelta,
  totalSide,
  type SkuGuidance,
} from "../guidance-core";

function g(sku: string, pence: number | null): SkuGuidance {
  return {
    sku,
    indicativePence: pence,
    source: pence == null ? null : "recent_trades",
    asOf: pence == null ? null : "2026-07-01T00:00:00.000Z",
    sampleSize: pence == null ? 0 : 3,
  };
}

describe("median", () => {
  it("returns the middle value for odd counts", () => {
    expect(median([300, 100, 200])).toBe(200);
  });
  it("rounds the mean of the middle pair for even counts", () => {
    expect(median([100, 201, 300, 400])).toBe(251); // (201+300)/2 = 250.5 → 251
  });
  it("handles a single value", () => {
    expect(median([750])).toBe(750);
  });
});

describe("totalSide", () => {
  const guidance = new Map<string, SkuGuidance>([
    ["A", g("A", 500)],
    ["B", g("B", 250)],
    ["C", g("C", null)],
  ]);

  it("multiplies unit price by quantity and sums priced items", () => {
    const total = totalSide(
      [
        { sku: "A", quantity: 2 },
        { sku: "B", quantity: 1 },
      ],
      guidance,
    );
    expect(total).toEqual({ totalPence: 1250, pricedItems: 2, unpricedItems: 0 });
  });

  it("counts unpriced items separately, never zeroing them into the total", () => {
    const total = totalSide(
      [
        { sku: "A", quantity: 1 },
        { sku: "C", quantity: 4 },
        { sku: "unknown-sku", quantity: 1 },
      ],
      guidance,
    );
    expect(total.totalPence).toBe(500);
    expect(total.pricedItems).toBe(1);
    expect(total.unpricedItems).toBe(2);
  });
});

describe("suggestCashDelta", () => {
  it("is positive when the proposer's side is lighter (proposer pays)", () => {
    expect(
      suggestCashDelta(
        { totalPence: 1000, pricedItems: 1, unpricedItems: 0 },
        { totalPence: 1500, pricedItems: 1, unpricedItems: 0 },
      ),
    ).toBe(500);
  });

  it("is negative when the recipient's side is lighter", () => {
    expect(
      suggestCashDelta(
        { totalPence: 2000, pricedItems: 2, unpricedItems: 0 },
        { totalPence: 500, pricedItems: 1, unpricedItems: 0 },
      ),
    ).toBe(-1500);
  });

  it("returns null when either side has zero priced items — no fabricated suggestions", () => {
    expect(
      suggestCashDelta(
        { totalPence: 0, pricedItems: 0, unpricedItems: 3 },
        { totalPence: 500, pricedItems: 1, unpricedItems: 0 },
      ),
    ).toBeNull();
  });
});

describe("gateValueGbp", () => {
  it("gates at the larger side plus the cash delta magnitude, in GBP", () => {
    expect(
      gateValueGbp(
        { totalPence: 1000, pricedItems: 1, unpricedItems: 0 },
        { totalPence: 2500, pricedItems: 1, unpricedItems: 0 },
        -300,
      ),
    ).toBe(28);
  });

  it("is zero when nothing is priced and no cash is recorded", () => {
    expect(
      gateValueGbp(
        { totalPence: 0, pricedItems: 0, unpricedItems: 2 },
        { totalPence: 0, pricedItems: 0, unpricedItems: 2 },
        0,
      ),
    ).toBe(0);
  });
});
