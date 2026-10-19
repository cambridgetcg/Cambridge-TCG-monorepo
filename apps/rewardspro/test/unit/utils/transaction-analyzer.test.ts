// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createTransactionAnalyzer, formatForShopify, roundDownToHundredths, type Transaction } from "~/utils/transaction-analyzer";

describe("money rounding on the store-credit path", () => {
  it("rounds down to whole cents without binary-float error", () => {
    // Math.floor(x * 100) / 100 gave 2.29, 1.12, 4.34 and 0.28
    expect([2.3, 1.13, 4.35, 0.29].map(formatForShopify)).toEqual(["2.30", "1.13", "4.35", "0.29"]);
    expect([2.3, 1.13, 4.35, 0.29].map(roundDownToHundredths)).toEqual([2.3, 1.13, 4.35, 0.29]);
    expect(formatForShopify(2.309)).toBe("2.30");
    expect(formatForShopify("4.35")).toBe("4.35");
  });

  it("sums payments to the cent before rounding down", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const payment = (id: string, gateway: string, amount: string): Transaction => ({
      id,
      gateway,
      status: "SUCCESS",
      kind: "SALE",
      amountSet: { shopMoney: { amount, currencyCode: "GBP" } },
    });

    const breakdown = createTransactionAnalyzer(undefined).analyzeTransactions([
      payment("1", "shopify_payments", "0.70"),
      payment("2", "paypal", "0.10"),
      payment("3", "gift_card", "4.35"),
      payment("4", "shopify_store_credit", "1.13"),
    ]);

    // 0.70 + 0.10 is 0.7999999999999999 in floats, which used to floor to 0.79
    expect(breakdown).toEqual({ giftCardAmount: 4.35, storeCreditAmount: 1.13, externalPaymentAmount: 0.8, cashbackEligibleAmount: 0.8, currency: "GBP" });
  });
});
