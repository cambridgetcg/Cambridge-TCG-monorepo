import { Prisma } from "@prisma/client";
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
  fromDb,
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

  it("refuses a well formed code the runtime does not list", () => {
    // Intl.NumberFormat formats "ZZZ" with 2 decimals rather than throwing
    expect(Intl.supportedValuesOf("currency")).not.toContain("ZZZ");
    expect(() => currencyDecimals("ZZZ")).toThrow(UnknownCurrencyError);
    expect(() => currencyDecimals("ZZZ")).toThrow(/ZZZ/);
    expect(currencyDecimals("GBP")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
  });

  it("pins the runtime's minor units, including where ICU differs from ISO 4217", () => {
    // The decimals come from the runtime's ICU data, not from ISO 4217. They
    // differ for some codes: ISO 4217 gives HUF, IDR and TWD 2 decimals,
    // this Node's ICU gives HUF 0 and IDR 0 (TWD 2, though its cash rounding
    // in CLDR is 0, so it is pinned too). The pin exists so a Node or ICU
    // upgrade that changes a value fails CI instead of silently changing how
    // cashback rounds. Fewer decimals than ISO still send a valid Shopify
    // amount (a whole HUF is a valid HUF amount); only the rounding step is
    // coarser. Update the pin deliberately if ICU changes.
    expect({
      JPY: currencyDecimals("JPY"),
      GBP: currencyDecimals("GBP"),
      KWD: currencyDecimals("KWD"),
      HUF: currencyDecimals("HUF"),
      IDR: currencyDecimals("IDR"),
      TWD: currencyDecimals("TWD"),
    }).toEqual({ JPY: 0, GBP: 2, KWD: 3, HUF: 0, IDR: 0, TWD: 2 });
    expect(toShopifyAmount(new Money("1234.5"), "HUF")).toBe("1235");
    expect(toShopifyAmount(new Money("15000.4"), "IDR")).toBe("15000");
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
    expect(toShopifyAmount(new Money("1e-2"), "GBP")).toBe("0.01");
  });

  it("refuses a value that is zero once rounded to the currency's decimals", () => {
    expect(() => toShopifyAmount(new Money(0), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money("1e-7"), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money("0.004"), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money("-0.001"), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money("0.4"), "JPY")).toThrow(RangeError);
    // The smallest amount that rounds up to one minor unit is sent
    expect(toShopifyAmount(new Money("0.005"), "GBP")).toBe("0.01");
  });

  it("refuses a negative value", () => {
    expect(() => toShopifyAmount(new Money(-5), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money("-0.01"), "GBP")).toThrow(RangeError);
  });

  it("refuses NaN and infinities", () => {
    expect(() => toShopifyAmount(new Money(NaN), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money(Infinity), "GBP")).toThrow(RangeError);
    expect(() => toShopifyAmount(new Money(-Infinity), "GBP")).toThrow(RangeError);
  });

  it("refuses an unknown currency", () => {
    expect(() => toShopifyAmount(new Money(5), "ZZZ")).toThrow(UnknownCurrencyError);
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

  it("refuses a precision and scale that are not a numeric type", () => {
    for (const [precision, scale] of [
      [19, -1],
      [4, 5],
      [19.5, 4],
      [19, 4.5],
      [NaN, 4],
      [19, NaN],
      [Infinity, 4],
      [0, 0],
    ]) {
      expect(() => fitsNumeric(new Money(1), precision, scale)).toThrow(RangeError);
    }
    // scale equal to precision is a valid numeric: only |v| < 1 fits
    expect(fitsNumeric(new Money("0.99"), 2, 2)).toBe(true);
    expect(fitsNumeric(new Money("1"), 2, 2)).toBe(false);
    expect(fitsNumeric(new Money("12"), 2, 0)).toBe(true);
  });

  it("refuses NaN and infinities", () => {
    expect(fitsNumeric(new Money(NaN), 19, 4)).toBe(false);
    expect(fitsNumeric(new Money(Infinity), 19, 4)).toBe(false);
    expect(fitsNumeric(new Money(-Infinity), 19, 4)).toBe(false);
  });
});

describe("fromDb (Ruling 28)", () => {
  it("wraps a Prisma.Decimal from a numeric(19,4) column in Money, digits exact", () => {
    const value = fromDb(new Prisma.Decimal("123456789012345.6789"));
    expect(value.constructor).toBe(Money);
    expect(value.toFixed(4)).toBe("123456789012345.6789");
    expect(fromDb(new Prisma.Decimal("2.5000")).toString()).toBe("2.5");
    expect(fromDb(new Prisma.Decimal("-0.0001")).toFixed(4)).toBe("-0.0001");
  });

  it("does its arithmetic at Money's 40 digits, not Prisma's 20", () => {
    const prisma = new Prisma.Decimal("123456789012345.6789");
    // Prisma's own Decimal rounds the product to 20 significant digits
    expect(prisma.times("1.0001").toFixed(8)).toBe("123469134691246.91347000");
    expect(fromDb(prisma).times("1.0001").toFixed(8)).toBe("123469134691246.91346789");
  });

  it("takes the string or number a raw query gives", () => {
    expect(fromDb("2.5000").toFixed(4)).toBe("2.5000");
    expect(fromDb(0).toString()).toBe("0");
    expect(fromDb(12).constructor).toBe(Money);
    expect(fromDb(new Decimal("1.25")).constructor).toBe(Money);
  });

  it("refuses anything that is not a finite amount", () => {
    for (const bad of ["", "abc", "NaN", "Infinity", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fromDb(bad)).toThrow(RangeError);
    }
  });
});
