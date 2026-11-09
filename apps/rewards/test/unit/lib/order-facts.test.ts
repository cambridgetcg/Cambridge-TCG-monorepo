import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { Money } from "~/lib/money";
import { cashbackBase, refundTakeBack, type MoneyPair } from "~/lib/order-facts";

const d = (v: Decimal.Value) => new Money(v);
const pair = (amount: Decimal.Value, shopAmount: Decimal.Value = amount): MoneyPair => ({
  amount: d(amount),
  shopAmount: d(shopAmount),
});

describe("cashbackBase", () => {
  it("subtracts store credit from the product value (spec example: £50 products, £5 shipping, £10 credit → £40)", () => {
    // Shipping is not part of productValue, so it never reaches the base.
    const base = cashbackBase({ productValue: pair(50), storeCreditUsed: pair(10), giftCardUsed: pair(0) });
    expect(base.amount.toFixed(2)).toBe("40.00");
    expect(base.shopAmount.toFixed(2)).toBe("40.00");
  });

  it("never goes below zero", () => {
    const base = cashbackBase({ productValue: pair(10), storeCreditUsed: pair(15), giftCardUsed: pair(0) });
    expect(base.amount.toFixed(2)).toBe("0.00");
    expect(base.shopAmount.toFixed(2)).toBe("0.00");
    expect(base.amount.isNegative()).toBe(false);
  });

  it("subtracts gift cards too", () => {
    const base = cashbackBase({ productValue: pair(50), storeCreditUsed: pair(10), giftCardUsed: pair("12.50") });
    expect(base.amount.toFixed(2)).toBe("27.50");
  });

  it("takes no refunds into account: a late-recorded order earns on the full base (Ruling 24)", () => {
    // The base reads only these three facts; refunds are taken back later, one by one
    const base = cashbackBase({ productValue: pair(50), storeCreditUsed: pair(10), giftCardUsed: pair(0) });
    expect(base.amount.toFixed(2)).toBe("40.00");
    expect(cashbackBase.length).toBe(1);
  });

  it("works each currency on its own: a euro order on a GBP shop", () => {
    const base = cashbackBase({ productValue: pair(60, "51.30"), storeCreditUsed: pair(10, "8.55"), giftCardUsed: pair(0) });
    expect(base.amount.toFixed(2)).toBe("50.00");
    expect(base.shopAmount.toFixed(2)).toBe("42.75");
  });

  it("returns Money values, even from plain Decimal inputs", () => {
    // Clones share Decimal's prototype, so instanceof can't tell them apart.
    const plain = (v: number): MoneyPair => ({ amount: new Decimal(v), shopAmount: new Decimal(v) });
    const base = cashbackBase({ productValue: plain(1), storeCreditUsed: plain(0), giftCardUsed: plain(0) });
    expect(base.amount.constructor).toBe(Money);
    expect(base.shopAmount.constructor).toBe(Money);
  });
});

describe("refundTakeBack", () => {
  const base = {
    cashback: d(2),
    orderProductValue: d(50),
    takenSoFar: d(0),
    completesOrder: false,
    currency: "GBP",
  };

  it("takes the refund's share of the cashback, rounded down", () => {
    expect(refundTakeBack({ ...base, refundProductValue: d(20) }).toFixed(2)).toBe("0.80");
    // 2 × 17 / 50 = 0.68; 1 × 17 / 50 = 0.34; 1 × 1 / 3 = 0.333… → 0.33
    expect(refundTakeBack({ ...base, refundProductValue: d(17) }).toFixed(2)).toBe("0.68");
    expect(
      refundTakeBack({ ...base, cashback: d(1), orderProductValue: d(3), refundProductValue: d(1) }).toFixed(2),
    ).toBe("0.33");
  });

  it("lets the completing refund take the rest", () => {
    expect(
      refundTakeBack({ ...base, refundProductValue: d(30), takenSoFar: d("0.80"), completesOrder: true }).toFixed(2),
    ).toBe("1.20");
    // Two refunds of a third each round down; the last one takes the leftover cent.
    const c = { ...base, cashback: d(1), orderProductValue: d(3), refundProductValue: d(1) };
    const first = refundTakeBack(c);
    const second = refundTakeBack({ ...c, takenSoFar: first });
    const last = refundTakeBack({ ...c, takenSoFar: first.plus(second), completesOrder: true });
    expect([first, second, last].map((v) => v.toFixed(2))).toEqual(["0.33", "0.33", "0.34"]);
    expect(first.plus(second).plus(last).toFixed(2)).toBe("1.00");
  });

  it("takes nothing for a shipping-only refund", () => {
    expect(refundTakeBack({ ...base, cashback: d(1), refundProductValue: d(0) }).toFixed(2)).toBe("0.00");
  });

  it("never takes more than is left", () => {
    expect(refundTakeBack({ ...base, refundProductValue: d(50), takenSoFar: d("1.50") }).toFixed(2)).toBe("0.50");
    // A refund that claims more product value than the order had is capped too.
    expect(refundTakeBack({ ...base, refundProductValue: d(80) }).toFixed(2)).toBe("2.00");
  });

  it("never goes below zero", () => {
    expect(refundTakeBack({ ...base, refundProductValue: d(20), takenSoFar: d(2) }).toFixed(2)).toBe("0.00");
    expect(refundTakeBack({ ...base, refundProductValue: d(20), takenSoFar: d(3) }).toFixed(2)).toBe("0.00");
    expect(refundTakeBack({ ...base, refundProductValue: d(0), takenSoFar: d(3), completesOrder: true }).toFixed(2)).toBe(
      "0.00",
    );
  });

  it("takes nothing from an order with no product value, unless it completes the order", () => {
    expect(refundTakeBack({ ...base, orderProductValue: d(0), refundProductValue: d(0) }).toFixed(2)).toBe("0.00");
    expect(
      refundTakeBack({ ...base, orderProductValue: d(0), refundProductValue: d(0), completesOrder: true }).toFixed(2),
    ).toBe("2.00");
  });

  it("follows the currency's minor unit", () => {
    // 62 × 1 / 3 = 20.67 → 20 yen; KWD 0.123 × 1 / 3 = 0.041
    expect(
      refundTakeBack({ ...base, cashback: d(62), orderProductValue: d(3), refundProductValue: d(1), currency: "JPY" }).toFixed(0),
    ).toBe("20");
    expect(
      refundTakeBack({ ...base, cashback: d("0.123"), orderProductValue: d(3), refundProductValue: d(1), currency: "KWD" }).toFixed(3),
    ).toBe("0.041");
  });
});
