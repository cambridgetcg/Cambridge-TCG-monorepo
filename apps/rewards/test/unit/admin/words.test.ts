import type { PayoutState } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  AMOUNT_UNKNOWN,
  ERASED_BUYER,
  STATUS_LABEL,
  STATUS_TONE,
  orderNotes,
  payoutStatus,
  rewardLine,
  takeBackShort,
} from "~/admin/words";
import { Money } from "~/lib/money";

/**
 * One word for each thing on every page (TRUTH-5, DESIGN-11): a payout's
 * status, keyed by its direction and state, never by the words shown
 * (A21-F7); the spec's shortfall sentence (spec 4.6); and an order's notes.
 */

const credit = (state: PayoutState) => ({ direction: "credit" as const, state, debitedAmount: null });
const debit = (state: PayoutState, debitedAmount: string | null = null) => ({
  direction: "debit" as const,
  state,
  debitedAmount: debitedAmount === null ? null : new Money(debitedAmount),
});

describe("payoutStatus", () => {
  it("gives a credit its status from its state", () => {
    expect(payoutStatus(credit("sent"))).toBe("issued");
    expect((["pending", "sending", "unconfirmed", "held"] as const).map((state) => payoutStatus(credit(state)))).toEqual([
      "waiting",
      "waiting",
      "waiting",
      "waiting",
    ]);
    expect(payoutStatus(credit("needs_look"))).toBe("needs_look");
    // A refund cancelled it before it went out
    expect(payoutStatus(credit("nothing_to_send"))).toBe("taken_back");
    expect(payoutStatus(credit("closed"))).toBe("no_cashback");
  });

  it("gives a take-back its own words: a closed one, or one that took nothing, is Not taken back", () => {
    expect(payoutStatus(debit("sent", "1.00"))).toBe("taken_back");
    expect(payoutStatus(debit("sent", "0.40"))).toBe("taken_back");
    // Shopify confirmed it without saying how much: the ledger counts the ask
    expect(payoutStatus(debit("sent"))).toBe("taken_back");
    expect(payoutStatus(debit("sent", "0"))).toBe("not_taken_back");
    expect(payoutStatus(debit("closed"))).toBe("not_taken_back");
    expect(payoutStatus(debit("pending"))).toBe("waiting");
    expect(payoutStatus(debit("needs_look"))).toBe("needs_look");
    expect(payoutStatus(debit("nothing_to_send"))).toBe("taken_back");
  });

  // A broken invariant (every cashback and take-back is written with its payout)
  it("is Unknown, in a neutral tone, for an entry with no payout", () => {
    expect(payoutStatus(null)).toBe("unknown");
    expect(STATUS_LABEL.unknown).toBe("Unknown");
    expect(STATUS_TONE.unknown).toBe("neutral");
  });

  it("names each status once, with its tone", () => {
    expect(STATUS_LABEL).toEqual({
      issued: "Issued",
      waiting: "Waiting",
      needs_look: "Needs a look",
      taken_back: "Taken back",
      not_taken_back: "Not taken back",
      no_cashback: "No cashback",
      unknown: "Unknown",
    });
    expect(STATUS_TONE).toEqual({
      issued: "success",
      waiting: "info",
      needs_look: "warning",
      taken_back: "neutral",
      not_taken_back: "neutral",
      no_cashback: "neutral",
      unknown: "neutral",
    });
    expect(ERASED_BUYER).toBe("Erased buyer");
  });
});

describe("takeBackShort", () => {
  it("says the spec's sentence when a take-back took less than it asked", () => {
    expect(takeBackShort(new Money("0.40"), new Money("1.00"), "GBP")).toBe("Took back £0.40 of £1.00; the buyer had spent the rest");
    expect(takeBackShort(new Money("0"), new Money("1.00"), "GBP")).toBe("Couldn't take back £1.00; the buyer had spent it");
    expect(takeBackShort(new Money("62"), new Money("100"), "JPY")).toBe("Took back ¥62 of ¥100; the buyer had spent the rest");
  });

  it("says nothing when it took all it asked", () => {
    expect(takeBackShort(new Money("1.00"), new Money("1.00"), "GBP")).toBeNull();
  });
});

describe("rewardLine (Home's Recent rewards)", () => {
  const sentCredit = { direction: "credit" as const, state: "sent" as const, amount: new Money("1.00"), debitedAmount: null };
  const sentDebit = (debitedAmount: string | null) => ({
    direction: "debit" as const,
    state: "sent" as const,
    amount: new Money("1.00"),
    debitedAmount: debitedAmount === null ? null : new Money(debitedAmount),
  });

  it("shows cashback at its ledger amount", () => {
    expect(rewardLine({ kind: "cashback", amount: new Money("1.00"), currency: "GBP", payout: sentCredit })).toEqual({
      amount: "£1.00",
      status: "Issued",
      tone: "success",
      detail: null,
    });
  });

  // Ruling 65: what left the buyer, not what was asked (the ledger nets the shortfall back)
  it("shows a sent take-back at what it took", () => {
    const reversal = { kind: "reversal" as const, amount: new Money("-1.00"), currency: "GBP" };
    expect(rewardLine({ ...reversal, payout: sentDebit("1.00") })).toEqual({ amount: "-£1.00", status: "Taken back", tone: "neutral", detail: null });
    expect(rewardLine({ ...reversal, payout: sentDebit("0.40") })).toEqual({
      amount: "-£0.40",
      status: "Taken back",
      tone: "neutral",
      detail: "Took back £0.40 of £1.00; the buyer had spent the rest",
    });
    expect(rewardLine({ ...reversal, payout: sentDebit("0") })).toEqual({
      amount: "£0.00",
      status: "Not taken back",
      tone: "neutral",
      detail: "Couldn't take back £1.00; the buyer had spent it",
    });
    expect(rewardLine({ ...reversal, payout: sentDebit(null) })).toEqual({ amount: AMOUNT_UNKNOWN, status: "Taken back", tone: "neutral", detail: null });
  });

  it("shows a take-back not sent yet at its ledger amount", () => {
    const reversal = { kind: "reversal" as const, amount: new Money("-0.50"), currency: "GBP" };
    const pending = { direction: "debit" as const, state: "pending" as const, amount: new Money("0.50"), debitedAmount: null };
    expect(rewardLine({ ...reversal, payout: pending })).toEqual({ amount: "-£0.50", status: "Waiting", tone: "info", detail: null });
  });

  // MONEY-2 (Ruling 65): a closed payout moved nothing, and its close: entry nets the ledger to 0
  it("shows a closed take-back at £0.00, as the zero take", () => {
    const reversal = { kind: "reversal" as const, amount: new Money("-1.00"), currency: "GBP" };
    const closed = { direction: "debit" as const, state: "closed" as const, amount: new Money("1.00"), debitedAmount: null };
    expect(rewardLine({ ...reversal, payout: closed })).toEqual({ amount: "£0.00", status: "Not taken back", tone: "neutral", detail: null });
  });

  it("shows a credit closed without sending at £0.00, saying what wasn't sent", () => {
    const cashback = { kind: "cashback" as const, amount: new Money("10.00"), currency: "GBP" };
    const closed = { direction: "credit" as const, state: "closed" as const, amount: new Money("10.00"), debitedAmount: null };
    expect(rewardLine({ ...cashback, payout: closed })).toEqual({
      amount: "£0.00",
      status: "No cashback",
      tone: "neutral",
      detail: "Closed without sending £10.00",
    });
    // In the cashback's own currency, at its minor unit
    expect(rewardLine({ ...cashback, currency: "JPY", amount: new Money("62"), payout: { ...closed, amount: new Money("62") } })).toMatchObject({
      amount: "¥0",
      detail: "Closed without sending ¥62",
    });
  });

  it("is Unknown for an entry with no payout", () => {
    expect(rewardLine({ kind: "cashback", amount: new Money("1.00"), currency: "GBP", payout: null })).toEqual({
      amount: "£1.00",
      status: "Unknown",
      tone: "neutral",
      detail: null,
    });
  });
});

describe("orderNotes", () => {
  const order = { test: false, cancelledAt: null, source: "live" as const, noCashbackReason: null };

  it("says what the order itself says: a test order, cancelled, or from before install", () => {
    expect(orderNotes(order)).toEqual([]);
    expect(orderNotes({ ...order, test: true, cancelledAt: new Date() })).toEqual(["Test order", "Cancelled"]);
    expect(orderNotes({ ...order, source: "import", noCashbackReason: "import" })).toEqual(["From before install"]);
    expect(orderNotes({ ...order, noCashbackReason: "before_install" })).toEqual(["From before install"]);
  });

  // A22-F8: the status detail already says it
  it("leaves out a note the status detail already says", () => {
    expect(orderNotes({ ...order, test: true }, "Test order")).toEqual([]);
    expect(orderNotes({ ...order, test: true, cancelledAt: new Date() }, "Test order")).toEqual(["Cancelled"]);
  });
});
