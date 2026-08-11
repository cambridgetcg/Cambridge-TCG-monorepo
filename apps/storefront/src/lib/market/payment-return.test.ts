import { describe, expect, it } from "vitest";
import {
  PAYMENT_RETURN_COPY,
  classifyPaymentReturn,
  isPaymentWindowOpen,
} from "./payment-return";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

describe("classifyPaymentReturn", () => {
  it.each([
    "paid",
    "awaiting_shipment",
    "shipped_to_ctcg",
    "received_by_ctcg",
    "verified",
    "shipped_to_buyer",
    "completed",
    "disputed",
    "refunded",
  ])("recognises %s as past the payment step without claiming provider finality", (escrow_status) => {
    expect(classifyPaymentReturn({ escrow_status }, NOW)).toBe("trade_advanced");
  });

  it("separates an open window from a closed-window reconciliation", () => {
    expect(classifyPaymentReturn({
      escrow_status: "awaiting_payment",
      payment_expires_at: "2026-08-01T12:00:01.000Z",
    }, NOW)).toBe("still_awaiting");
    expect(classifyPaymentReturn({
      escrow_status: "awaiting_payment",
      payment_expires_at: "2026-08-01T12:00:00.000Z",
    }, NOW)).toBe("window_closed_reconcile");
  });

  it("never turns a cancelled or unknown state into a payment claim", () => {
    expect(classifyPaymentReturn({ escrow_status: "cancelled" }, NOW)).toBe("cancelled_reconcile");
    expect(classifyPaymentReturn({ escrow_status: "mystery" }, NOW)).toBe("unavailable");
  });

  it("fails closed for malformed deadlines and changes eligibility at the exact boundary", () => {
    expect(isPaymentWindowOpen(null, NOW)).toBe(true);
    expect(isPaymentWindowOpen("not-a-date", NOW)).toBe(false);
    expect(isPaymentWindowOpen("2026-08-01T12:00:00.001Z", NOW)).toBe(true);
    expect(isPaymentWindowOpen("2026-08-01T12:00:00.000Z", NOW)).toBe(false);
  });

  it("keeps every unresolved state explicit about not retrying or not inferring payment", () => {
    for (const state of [
      "checking",
      "still_awaiting",
      "still_awaiting_manual",
      "window_closed_reconcile",
      "cancelled_reconcile",
      "unavailable",
    ] as const) {
      const copy = `${PAYMENT_RETURN_COPY[state].title} ${PAYMENT_RETURN_COPY[state].body}`;
      expect(copy).toMatch(/not proof|Do not|not inferred|couldn’t verify/i);
    }
  });
});
