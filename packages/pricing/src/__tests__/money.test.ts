import { describe, expect, it } from "vitest";
import { money, parseMajorAmount, positivePrice, roundGbp } from "../index";

describe("major-unit money representation", () => {
  it("preserves currency and decimal precision without converting to pennies", () => {
    expect(money("12.3400", "EUR")).toEqual({ amount: "12.3400", currency: "EUR", unit: "major" });
    expect(money("600", "JPY")).toEqual({ amount: "600", currency: "JPY", unit: "major" });
    expect(money(0, "GBP")).toEqual({ amount: "0", currency: "GBP", unit: "major" });
    expect(money(null, "USD")).toBeNull();
    expect(parseMajorAmount(undefined)).toBeNull();
  });
  it.each([-1, NaN, Infinity, -Infinity, true, "", " 1", "+1", "1e2", "1,000", "1.1234567", "1000000000000"])(
    "rejects invalid or unsupported precision %s", value => expect(() => parseMajorAmount(value)).toThrow(RangeError),
  );
  it("does not coerce unsupported currencies", () => {
    expect(() => money("1", "gbp" as "GBP")).toThrow(RangeError);
  });
  it("separates a generic zero amount from a positive source price", () => {
    expect(parseMajorAmount("0.00")).toBe("0.00");
    expect(positivePrice(0)).toBeNull();
    expect(positivePrice("1.20")).toBeNull();
    expect(positivePrice(Infinity)).toBeNull();
    expect(positivePrice(1.2)).toBe(1.2);
  });
  it("rounds decimal half-pennies and removes binary residue", () => {
    expect(roundGbp(1.005)).toBe(1.01);
    expect(roundGbp(2.675)).toBe(2.68);
    expect(roundGbp(0.1 + 0.2)).toBe(0.3);
    for (const value of [Infinity, NaN, -1, Number.MAX_VALUE]) expect(() => roundGbp(value)).toThrow(RangeError);
  });
});
