import { describe, expect, it } from "vitest";
import { formatMoney } from "~/admin/format";
import { Money } from "~/lib/money";

/**
 * Every amount the admin shows goes through formatMoney: the currency's own
 * minor unit, never two decimals by habit (Review Focus 3).
 */
describe("formatMoney", () => {
  it("shows yen in whole yen", () => {
    expect(formatMoney(62, "JPY")).toBe("¥62");
  });

  it("shows a stored numeric(19,4) amount with the currency's decimals", () => {
    expect(formatMoney(new Money("1.5000"), "GBP")).toBe("£1.50");
    expect(formatMoney("62.0000", "JPY")).toBe("¥62");
  });

  it("shows three decimals for a three-decimal currency", () => {
    expect(formatMoney("1.25", "KWD").replace(/\s/g, " ")).toBe("KWD 1.250");
  });

  it("keeps every digit of a large amount and the sign of a take-back", () => {
    expect(formatMoney("123456789012345.6789", "GBP")).toBe("£123,456,789,012,345.68");
    expect(formatMoney(new Money("-0.40"), "GBP")).toBe("-£0.40");
  });

  it("follows the locale it is given", () => {
    expect(formatMoney("1234.5", "EUR", "de-DE").replace(/\s/g, " ")).toBe("1.234,50 €");
  });

  it("refuses a code that is not a currency", () => {
    expect(() => formatMoney(1, "gbp")).toThrow(/Unknown currency code/);
  });
});
