import type { LookReason, PayoutState } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { orderStatus } from "~/lib/order-status";

/**
 * An order's status on the Orders page (spec 4.6): Issued, Waiting, Taken
 * back, Needs a look or No cashback, from its cashback entry, that entry's
 * credit payout and its take-backs. A sent take-back counts at what it took
 * (its debitedAmount, Ruling 65), so one that fell short leaves the order
 * Issued with the spec's sentence. One case per state.
 */

const live = { source: "live" as const, test: false };
const cashback = { amount: "1.00", currency: "GBP" };
/** A take-back's ledger amount is signed: it takes away */
const takeBack = (amount: string, state: PayoutState, more: { debitedAmount?: string | null; lookReason?: LookReason } = {}) => ({
  amount,
  state,
  // A sent take-back took what it asked unless the case says otherwise
  debitedAmount: more.debitedAmount === undefined ? (state === "sent" ? amount.replace("-", "") : null) : more.debitedAmount,
  lookReason: more.lookReason,
});

describe("orderStatus", () => {
  it("is Issued once the credit is sent", () => {
    expect(orderStatus(live, cashback, { state: "sent" }, [])).toEqual({ key: "issued", label: "Issued", detail: null });
    expect(orderStatus(live, cashback, { state: "sent" })).toEqual({ key: "issued", label: "Issued", detail: null });
  });

  it("is Waiting while the credit is pending, sending, unconfirmed or held", () => {
    const waiting = { key: "waiting", label: "Waiting", detail: null };
    expect(orderStatus(live, cashback, { state: "pending" }, [])).toEqual(waiting);
    expect(orderStatus(live, cashback, { state: "sending" }, [])).toEqual(waiting);
    expect(orderStatus(live, cashback, { state: "unconfirmed" }, [])).toEqual({ ...waiting, detail: "Checking with Shopify whether it arrived" });
    expect(orderStatus(live, cashback, { state: "held" }, [])).toEqual(waiting);
    // Reduced by a refund before it went out, and not sent yet
    expect(orderStatus(live, cashback, { state: "pending" }, [takeBack("-0.40", "nothing_to_send")])).toEqual(waiting);
  });

  it("is Needs a look for a credit that needs one, for each reason", () => {
    const look = (detail: string) => ({ key: "needs_look", label: "Needs a look", detail });
    expect(orderStatus(live, cashback, { state: "needs_look", lookReason: "refused" }, [])).toEqual(look("Shopify refused it."));
    expect(orderStatus(live, cashback, { state: "needs_look", lookReason: "kept_failing" }, [])).toEqual(look("Sending kept failing."));
    expect(orderStatus(live, cashback, { state: "needs_look", lookReason: "could_not_confirm" }, [])).toEqual(look("RewardsPro couldn't confirm it arrived."));
  });

  it("is Needs a look for a take-back that needs one, over Issued and Taken back", () => {
    const look = (detail: string) => ({ key: "needs_look", label: "Needs a look", detail });
    // Over Issued: a partial take-back
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.50", "needs_look", { lookReason: "could_not_confirm" })])).toEqual(
      look("RewardsPro couldn't confirm it was taken back."),
    );
    // Over Taken back: the rest was taken by an earlier refund
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.50", "sent"), takeBack("-0.50", "needs_look", { lookReason: "refused" })])).toEqual(
      look("Shopify refused to take it back."),
    );
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "needs_look", { lookReason: "kept_failing" })])).toEqual(
      look("Taking it back kept failing."),
    );
    // A credit that needs a look speaks first
    expect(
      orderStatus(live, cashback, { state: "needs_look", lookReason: "could_not_confirm" }, [takeBack("-1.00", "needs_look", { lookReason: "refused" })]),
    ).toEqual(look("RewardsPro couldn't confirm it arrived."));
  });

  it("is Taken back when the take-backs took all the cashback", () => {
    const takenBack = { key: "taken_back", label: "Taken back", detail: null };
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent")])).toEqual(takenBack);
    // Two refunds, the second completing the order
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.33", "sent"), takeBack("-0.67", "sent")])).toEqual(takenBack);
    // Refunded before it was sent: the credit had nothing left to send
    expect(orderStatus(live, cashback, { state: "nothing_to_send" }, [takeBack("-1.00", "nothing_to_send")])).toEqual(takenBack);
    // Shopify confirmed it without saying how much (A11-F4): the ledger counts the ask, and the detail says so
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent", { debitedAmount: null })])).toEqual({
      ...takenBack,
      detail: "Amount unknown",
    });
  });

  // Ruling 65 (TRUTH-1): the ask is not what left the buyer
  it("is Issued, with the spec's sentence, when a take-back took less than it asked", () => {
    // Fully refunded, but the buyer had spent all of it: nothing was taken
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent", { debitedAmount: "0" })])).toEqual({
      key: "issued",
      label: "Issued",
      detail: "Couldn't take back £1.00; the buyer had spent it",
    });
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent", { debitedAmount: "0.40" })])).toEqual({
      key: "issued",
      label: "Issued",
      detail: "Took back £0.40 of £1.00; the buyer had spent the rest",
    });
    // A partial refund that fell short
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.40", "sent", { debitedAmount: "0.10" })])).toEqual({
      key: "issued",
      label: "Issued",
      detail: "Took back £0.10 of £0.40; the buyer had spent the rest",
    });
    // In the buyer's currency
    expect(orderStatus(live, { amount: "100", currency: "JPY" }, { state: "sent" }, [takeBack("-100", "sent", { debitedAmount: "62" })])).toMatchObject({
      detail: "Took back ¥62 of ¥100; the buyer had spent the rest",
    });
  });

  it("says what a refund did to cashback it took only part of", () => {
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.40", "sent")])).toEqual({ key: "issued", label: "Issued", detail: "Part taken back for a refund" });
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.40", "pending")])).toEqual({
      key: "issued",
      label: "Issued",
      detail: "Part being taken back for a refund",
    });
    // A take-back closed without taking anything leaves the cashback with the buyer
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "closed")])).toEqual({
      key: "issued",
      label: "Issued",
      detail: "A take-back was closed without taking it back",
    });
  });

  it("is Waiting while a take-back of all of it is still on its way", () => {
    const being = { key: "waiting", label: "Waiting", detail: "Being taken back for a refund" };
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "pending")])).toEqual(being);
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.50", "sent"), takeBack("-0.50", "sending")])).toEqual(being);
  });

  it("is No cashback for a credit closed without sending", () => {
    const closed = { key: "no_cashback", label: "No cashback", detail: "Closed without sending" };
    expect(orderStatus(live, cashback, { state: "closed" }, [])).toEqual(closed);
    expect(orderStatus(live, cashback, { state: "closed" }, [takeBack("-1.00", "closed")])).toEqual(closed);
  });

  it("is No cashback with the reason for an order that earned none", () => {
    const reasons = {
      off: "Cashback was off",
      test: "Test order",
      import: "From before install",
      before_install: "From before install",
      cancelled: "Cancelled",
      no_tier: "No tiers were set up",
      nothing_to_pay_on: "Nothing to pay on",
    } as const;
    for (const [noCashbackReason, detail] of Object.entries(reasons)) {
      const order = { ...live, source: noCashbackReason === "import" ? ("import" as const) : ("live" as const), noCashbackReason: noCashbackReason as keyof typeof reasons };
      expect(orderStatus(order), noCashbackReason).toEqual({ key: "no_cashback", label: "No cashback", detail });
    }
    // No reason stored: what the order itself says, or nothing
    expect(orderStatus({ source: "import", test: false, noCashbackReason: null })).toEqual({ key: "no_cashback", label: "No cashback", detail: "From before install" });
    expect(orderStatus({ source: "live", test: true })).toEqual({ key: "no_cashback", label: "No cashback", detail: "Test order" });
    expect(orderStatus({ source: "live", test: false, noCashbackReason: null })).toEqual({ key: "no_cashback", label: "No cashback", detail: null });
  });

  // TRUTH-6: a positive base at a rate that gave nothing (0%, or below the minor unit)
  it("says the rate gave nothing when there was a base to pay on", () => {
    const order = { ...live, noCashbackReason: "nothing_to_pay_on" as const };
    expect(orderStatus({ ...order, cashbackBase: "40.00" })).toEqual({ key: "no_cashback", label: "No cashback", detail: "The rate gave nothing on this order" });
    expect(orderStatus({ ...order, cashbackBase: "0" })).toEqual({ key: "no_cashback", label: "No cashback", detail: "Nothing to pay on" });
  });
});
