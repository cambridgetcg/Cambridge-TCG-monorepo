import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  ISSUE_IN,
  Money,
  UnknownCurrencyError,
  cashbackFor,
  currencyDecimals,
  fitsNumeric,
  floorMoney,
  roundMoney,
  toShopifyAmount,
} from "~/lib/money";

describe("Money", () => {
  it("rounds half-up with 40 significant digits", () => {
    expect(Money.rounding).toBe(Decimal.ROUND_HALF_UP);
    expect(Money.precision).toBe(40);
  });

  it("is a clone, so the global Decimal settings are left alone", () => {
    expect(Money).not.toBe(Decimal);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
    expect(Decimal.precision).toBe(20);
  });

  it("adds tenths exactly, unlike floats", () => {
    expect(new Money("0.1").plus("0.2").toString()).toBe("0.3");
  });
});

describe("ISSUE_IN", () => {
  it("issues cashback in the buyer's presentment currency", () => {
    expect(ISSUE_IN).toBe("presentment");
  });
});

describe("currencyDecimals", () => {
  it("follows each currency's minor unit", () => {
    expect(currencyDecimals("GBP")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
    expect(currencyDecimals("EUR")).toBe(2);
  });

  it("refuses a code that is not three uppercase letters", () => {
    expect(() => currencyDecimals("usd")).toThrow(UnknownCurrencyError);
    expect(() => currencyDecimals("")).toThrow(UnknownCurrencyError);
    expect(() => currencyDecimals("GBPX")).toThrow(UnknownCurrencyError);
    expect(() => currencyDecimals("G1P")).toThrow(UnknownCurrencyError);
  });

  it("names the code it refused", () => {
    expect(() => currencyDecimals("usd")).toThrow(/usd/);
  });
});

describe("roundMoney", () => {
  it("rounds half-up to the currency's minor unit", () => {
    expect(roundMoney("4.995", "GBP").toFixed(2)).toBe("5.00");
    expect(roundMoney("4.994", "GBP").toFixed(2)).toBe("4.99");
    expect(roundMoney("61.5", "JPY").toFixed(0)).toBe("62");
    expect(roundMoney("0.1235", "KWD").toFixed(3)).toBe("0.124");
  });

  it("rounds a half up even where half-even would round down", () => {
    expect(roundMoney("4.985", "GBP").toFixed(2)).toBe("4.99");
    expect(roundMoney("62.5", "JPY").toFixed(0)).toBe("63");
    expect(roundMoney("0.1225", "KWD").toFixed(3)).toBe("0.123");
    expect(cashbackFor("16.50", 15, "GBP").toFixed(2)).toBe("2.48"); // 2.475
  });

  it("rounds a negative half away from zero, as Postgres numeric does", () => {
    expect(roundMoney("-4.995", "GBP").toFixed(2)).toBe("-5.00");
    expect(roundMoney("-4.985", "GBP").toFixed(2)).toBe("-4.99");
  });

  it("returns a Money value, even from a plain Decimal", () => {
    // Clones share Decimal's prototype, so instanceof can't tell them apart.
    expect(roundMoney(new Decimal(1), "GBP").constructor).toBe(Money);
    expect(floorMoney(new Decimal(1), "GBP").constructor).toBe(Money);
  });
});

describe("floorMoney", () => {
  it("rounds down to the currency's minor unit", () => {
    expect(floorMoney("0.809", "GBP").toFixed(2)).toBe("0.80");
    expect(floorMoney("61.99", "JPY").toFixed(0)).toBe("61");
    expect(floorMoney("0.1239", "KWD").toFixed(3)).toBe("0.123");
  });

  it("leaves an exact amount as it is", () => {
    expect(floorMoney("0.80", "GBP").toFixed(2)).toBe("0.80");
  });
});

describe("cashbackFor", () => {
  it("is base × percent / 100, rounded half-up to the minor unit", () => {
    expect(cashbackFor("33.30", 15, "GBP").toFixed(2)).toBe("5.00");
    expect(cashbackFor("4.10", 15, "GBP").toFixed(2)).toBe("0.62");
    expect(cashbackFor("16.90", 15, "GBP").toFixed(2)).toBe("2.54");
    expect(cashbackFor("1234", 5, "JPY").toFixed(0)).toBe("62");
    expect(cashbackFor("1.234", 10, "KWD").toFixed(3)).toBe("0.123");
  });

  it("takes a fractional percent from numeric(5,2)", () => {
    expect(cashbackFor("100.00", "2.55", "GBP").toFixed(2)).toBe("2.55");
  });

  it("is zero for a zero base", () => {
    expect(cashbackFor("0", 15, "GBP").toFixed(2)).toBe("0.00");
  });
});

describe("toShopifyAmount", () => {
  it("writes exactly the currency's decimals", () => {
    expect(toShopifyAmount(new Money(62), "JPY")).toBe("62");
    expect(toShopifyAmount(new Money(5), "GBP")).toBe("5.00");
    expect(toShopifyAmount(new Money("0.5"), "KWD")).toBe("0.500");
  });

  it("never writes exponent notation", () => {
    expect(toShopifyAmount(new Money("1e21"), "GBP")).toBe("1000000000000000000000.00");
    expect(toShopifyAmount(new Money("1e-7"), "GBP")).toBe("0.00");
  });

  it("rounds half-up when given more decimals than the currency has", () => {
    expect(toShopifyAmount(new Money("4.995"), "GBP")).toBe("5.00");
    expect(toShopifyAmount(new Money("0.125"), "GBP")).toBe("0.13");
    // A plain Decimal (ROUND_HALF_UP by default too) is rounded the same way.
    expect(toShopifyAmount(new Decimal("61.5"), "JPY")).toBe("62");
  });
});

describe("fitsNumeric", () => {
  it("accepts the largest numeric(19,4) value", () => {
    expect(fitsNumeric(new Money("999999999999999.9999"), 19, 4)).toBe(true);
    expect(fitsNumeric(new Money("-999999999999999.9999"), 19, 4)).toBe(true);
  });

  it("refuses a value with too many integer digits", () => {
    expect(fitsNumeric(new Money("1000000000000000"), 19, 4)).toBe(false);
    expect(fitsNumeric(new Money("-1000000000000000"), 19, 4)).toBe(false);
  });

  it("judges the value once rounded to the scale, as Postgres stores it", () => {
    expect(fitsNumeric(new Money("1.23456"), 19, 4)).toBe(true);
    expect(fitsNumeric(new Money("999999999999999.99995"), 19, 4)).toBe(false);
  });

  it("checks numeric(5,2) percentages", () => {
    expect(fitsNumeric(new Money("999.99"), 5, 2)).toBe(true);
    expect(fitsNumeric(new Money("1000"), 5, 2)).toBe(false);
  });

  it("refuses NaN and infinities", () => {
    expect(fitsNumeric(new Money(NaN), 19, 4)).toBe(false);
    expect(fitsNumeric(new Money(Infinity), 19, 4)).toBe(false);
    expect(fitsNumeric(new Money(-Infinity), 19, 4)).toBe(false);
  });
});
