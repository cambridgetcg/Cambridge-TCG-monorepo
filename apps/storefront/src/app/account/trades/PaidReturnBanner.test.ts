import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PaidReturnBanner.tsx", import.meta.url), "utf8");

describe("PaidReturnBanner contract", () => {
  it("checks participant state and polls only a bounded number of times", () => {
    expect(source).toContain("readMarketTradePaymentStatus(tradeId");
    expect(source).toContain("POLL_DELAYS_MS");
    expect(source).toContain("attempt + 1 < POLL_DELAYS_MS.length");
  });

  it("ends automatic polling in a manual state and never offers an inert retry", () => {
    expect(source).toContain('"still_awaiting_manual"');
    expect(source).toContain("finalAutomaticCheck");
    expect(source).toContain("&& checkableTradeId &&");
  });

  it("does not turn a return query parameter into a provider payment claim", () => {
    expect(source).not.toMatch(/Payment sent|Stripe has your payment/);
    expect(source).toContain("query parameter proves only navigation");
    expect(source).toContain("remains explicitly unverified");
  });
});
