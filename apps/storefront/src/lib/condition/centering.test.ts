import { describe, expect, it } from "vitest";
import { calculateCenteringRatio, formatBorderPercent } from "./centering";

describe("manual same-unit centering arithmetic", () => {
  it.each(["", " ", "-1", "-0.01", "NaN", "Infinity", "-Infinity", "1e309", "abc", "0xff", "0b10", "1,2", "1e-999", "-1e-999"])("rejects invalid border %j on either side", (input) => {
    expect(calculateCenteringRatio(input, "2").status).toBe("invalid");
    expect(calculateCenteringRatio("2", input).status).toBe("invalid");
  });

  it("has a separate empty state and identifies the invalid field", () => {
    expect(calculateCenteringRatio("", "2")).toEqual({ status: "invalid", firstError: "empty" });
    expect(calculateCenteringRatio("2", "-1")).toEqual({ status: "invalid", secondError: "negative" });
  });

  it("rejects a zero-total pair but allows a single zero", () => {
    expect(calculateCenteringRatio("0", "0")).toEqual({ status: "invalid", pairError: "zero-total" });
    expect(calculateCenteringRatio("0", "2")).toEqual({ status: "measured", firstPercent: 0, secondPercent: 100 });
    expect(calculateCenteringRatio("2", "0")).toEqual({ status: "measured", firstPercent: 100, secondPercent: 0 });
  });

  it("preserves directional order, decimals and independent axes", () => {
    expect(calculateCenteringRatio(" 1.5 ", "3.5")).toEqual({ status: "measured", firstPercent: 30, secondPercent: 70 });
    expect(calculateCenteringRatio("3.5", "1.5")).toEqual({ status: "measured", firstPercent: 70, secondPercent: 30 });
    expect(calculateCenteringRatio(".5", ".5")).toEqual({ status: "measured", firstPercent: 50, secondPercent: 50 });
  });

  it("normalizes before summing numbers whose sum would overflow", () => {
    const max = String(Number.MAX_VALUE);
    expect(calculateCenteringRatio(max, max)).toEqual({ status: "measured", firstPercent: 50, secondPercent: 50 });
    expect(calculateCenteringRatio("1e308", "5e307")).toEqual({ status: "measured", firstPercent: (1 / 1.5) * 100, secondPercent: (0.5 / 1.5) * 100 });
  });

  it("supports representable very small and mixed-magnitude numbers", () => {
    expect(calculateCenteringRatio("5e-324", "5e-324")).toEqual({ status: "measured", firstPercent: 50, secondPercent: 50 });
    const ratio = calculateCenteringRatio("5e-324", "1e308");
    expect(ratio.status).toBe("measured");
    if (ratio.status === "measured") {
      expect(Number.isFinite(ratio.firstPercent)).toBe(true);
      expect(Number.isFinite(ratio.secondPercent)).toBe(true);
    }
  });

  it("does not treat borderless geometry as a zero or an error", () => {
    expect(calculateCenteringRatio("", "-1", false)).toEqual({ status: "not-measurable" });
    expect(calculateCenteringRatio("2", "2", false)).toEqual({ status: "not-measurable" });
  });

  it("rounds only display, never returns a grade or aggregate score", () => {
    const ratio = calculateCenteringRatio("1", "2");
    expect(ratio).toEqual({ status: "measured", firstPercent: (0.5 / 1.5) * 100, secondPercent: (1 / 1.5) * 100 });
    if (ratio.status === "measured") expect(formatBorderPercent(ratio.firstPercent)).toBe("33.33");
    expect(formatBorderPercent(100)).toBe("100");
    expect(formatBorderPercent(0)).toBe("0");
  });
});
