import { describe, expect, it } from "vitest";
import { formatRetailPrice, retailPrice } from "./pricing";

describe("legacy GBP retail quote selection", () => {
  it("preserves an explicit valid channel quote without applying markup twice", () => {
    expect(retailPrice(100, 12.34)).toBe(12.34);
    expect(formatRetailPrice(100, 12.34)).toBe("£12.34");
  });
  it.each([0, -1, NaN, Infinity, -Infinity])("does not invent a fallback for explicit invalid channel quote %s", value => {
    expect(retailPrice(100, value)).toBeNull();
    expect(formatRetailPrice(100, value)).toBe("Unavailable");
  });
  it.each([undefined, null])("uses the existing ceil rule only when a channel quote is missing (%s)", value => {
    expect(retailPrice(3, value)).toBe(3.5);
    expect(retailPrice(2, value)).toBe(2.3);
    expect(retailPrice(0.2, value)).toBe(0.3);
  });
  it.each([null, undefined, 0, -1, NaN, Infinity, Number.MAX_VALUE])("does not format missing/invalid wholesale amount %s as a free price", value => {
    expect(retailPrice(value)).toBeNull();
  });
});
