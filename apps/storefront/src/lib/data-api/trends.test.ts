import { describe, expect, it } from "vitest";
import { CHANGE_PERCENT_SCALE, TREND_BASE_GRACE_DAYS, TREND_DAYS, percentChange } from "./trends";

describe("index changes computed on read", () => {
  it("are 7, 30 and 90 days with a week's grace, to two decimal places", () => {
    expect(TREND_DAYS).toEqual([7, 30, 90]);
    expect(TREND_BASE_GRACE_DAYS).toBe(7);
    expect(CHANGE_PERCENT_SCALE).toBe(2);
  });

  it.each([
    ["110", "100", "10"], ["100", "110", "-9.09"], ["110", "110", "0"], ["100", "121", "-17.36"],
    ["100.000001", "100", "0"], ["100.005", "100", "0.01"], ["99.995", "100", "-0.01"], ["99.996", "100", "0"],
    ["250", "100", "150"], ["0.000001", "999999999999", "-100"], ["123.456789", "98.765432", "25"],
  ])("percentChange(%s, %s) = %s, exact and canonical", (current, base, expected) => {
    expect(percentChange(current, base)).toBe(expected);
  });

  it("never prints negative zero", () => {
    expect(percentChange("99.999", "100")).toBe("0");
  });

  it.each([["0", "100"], ["100", "0"], ["-1", "100"], ["1e2", "100"], ["", "100"]])("refuses %j ÷ %j", (current, base) => {
    expect(() => percentChange(current, base)).toThrow();
  });

  it("refuses numbers, so no binary float enters a change", () => {
    expect(() => percentChange(110 as unknown as string, "100")).toThrow(TypeError);
  });
});
