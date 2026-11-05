import type { LookReason, PayoutState } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { orderStatus } from "~/lib/order-status";

/**
 * An order's status on the Orders page (spec 4.6): Issued, Waiting, Taken
 * back, Needs a look or No cashback, from its cashback entry, that entry's
 * credit payout and its take-backs. One case per state.
 */

const live = { source: "live" as const, test: false };
const cashback = { amount: "1.00" };
/** A take-back's ledger amount is signed: it takes away */
const takeBack = (amount: string, state: PayoutState, more: { shortfall?: string; lookReason?: LookReason } = {}) => ({ amount, state, ...more });

describe("orderStatus", () => {
  it("is Issued once the credit is sent", () => {
    expect(orderStatus(live, cashback, { state: "sent" }, [])).toEqual({ label: "Issued", detail: null });
    expect(orderStatus(live, cashback, { state: "sent" })).toEqual({ label: "Issued", detail: null });
  });

  it("is Waiting while the credit is pending, sending, unconfirmed or held", () => {
    expect(orderStatus(live, cashback, { state: "pending" }, [])).toEqual({ label: "Waiting", detail: null });
    expect(orderStatus(live, cashback, { state: "sending" }, [])).toEqual({ label: "Waiting", detail: null });
    expect(orderStatus(live, cashback, { state: "unconfirmed" }, [])).toEqual({ label: "Waiting", detail: "Checking with Shopify whether it arrived" });
    expect(orderStatus(live, cashback, { state: "held" }, [])).toEqual({ label: "Waiting", detail: null });
    // Reduced by a refund before it went out, and not sent yet
    expect(orderStatus(live, cashback, { state: "pending" }, [takeBack("-0.40", "nothing_to_send")])).toEqual({ label: "Waiting", detail: null });
  });

  it("is Needs a look for a credit that needs one, for each reason", () => {
    expect(orderStatus(live, cashback, { state: "needs_look", lookReason: "refused" }, [])).toEqual({ label: "Needs a look", detail: "Shopify refused it." });
    expect(orderStatus(live, cashback, { state: "needs_look", lookReason: "kept_failing" }, [])).toEqual({
      label: "Needs a look",
      detail: "Sending kept failing.",
    });
    expect(orderStatus(live, cashback, { state: "needs_look", lookReason: "could_not_confirm" }, [])).toEqual({
      label: "Needs a look",
      detail: "RewardsPro couldn't confirm it arrived.",
    });
  });

  it("is Needs a look for a take-back that needs one, over Issued and Taken back", () => {
    // Over Issued: a partial take-back
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.50", "needs_look", { lookReason: "could_not_confirm" })])).toEqual({
      label: "Needs a look",
      detail: "RewardsPro couldn't confirm it was taken back.",
    });
    // Over Taken back: the rest was taken by an earlier refund
    expect(
      orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.50", "sent"), takeBack("-0.50", "needs_look", { lookReason: "refused" })]),
    ).toEqual({ label: "Needs a look", detail: "Shopify refused to take it back." });
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "needs_look", { lookReason: "kept_failing" })])).toEqual({
      label: "Needs a look",
      detail: "Taking it back kept failing.",
    });
    // A credit that needs a look speaks first
    expect(
      orderStatus(live, cashback, { state: "needs_look", lookReason: "could_not_confirm" }, [takeBack("-1.00", "needs_look", { lookReason: "refused" })]),
    ).toEqual({ label: "Needs a look", detail: "RewardsPro couldn't confirm it arrived." });
  });

  it("is Taken back when take-backs took all the cashback", () => {
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent")])).toEqual({ label: "Taken back", detail: null });
    // Two refunds, the second completing the order
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.33", "sent"), takeBack("-0.67", "sent")])).toEqual({
      label: "Taken back",
      detail: null,
    });
    // Refunded before it was sent: the credit had nothing left to send
    expect(orderStatus(live, cashback, { state: "nothing_to_send" }, [takeBack("-1.00", "nothing_to_send")])).toEqual({
      label: "Taken back",
      detail: null,
    });
    // The buyer had spent some of it first (Ruling 35's shortfall)
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent", { shortfall: "0.60" })])).toEqual({
      label: "Taken back",
      detail: "Part of it couldn't be taken back: the buyer had spent it",
    });
    // A shortfall of 0 is no shortfall
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "sent", { shortfall: "0" })])).toEqual({ label: "Taken back", detail: null });
  });

  it("says what a refund did to cashback it took only part of", () => {
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.40", "sent")])).toEqual({ label: "Issued", detail: "Part taken back for a refund" });
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.40", "sent", { shortfall: "0.10" })])).toEqual({
      label: "Issued",
      detail: "Part of it couldn't be taken back: the buyer had spent it",
    });
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.40", "pending")])).toEqual({
      label: "Issued",
      detail: "Part being taken back for a refund",
    });
    // A take-back closed without taking anything leaves the cashback with the buyer
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "closed")])).toEqual({
      label: "Issued",
      detail: "A take-back was closed without taking it back",
    });
  });

  it("is Waiting while a take-back of all of it is still on its way", () => {
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-1.00", "pending")])).toEqual({ label: "Waiting", detail: "Being taken back for a refund" });
    expect(orderStatus(live, cashback, { state: "sent" }, [takeBack("-0.50", "sent"), takeBack("-0.50", "sending")])).toEqual({
      label: "Waiting",
      detail: "Being taken back for a refund",
    });
  });

  it("is No cashback for a credit closed without sending", () => {
    expect(orderStatus(live, cashback, { state: "closed" }, [])).toEqual({ label: "No cashback", detail: "Closed without sending" });
    expect(orderStatus(live, cashback, { state: "closed" }, [takeBack("-1.00", "closed")])).toEqual({ label: "No cashback", detail: "Closed without sending" });
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
      expect(orderStatus(order), noCashbackReason).toEqual({ label: "No cashback", detail });
    }
    // No reason stored: what the order itself says, or nothing
    expect(orderStatus({ source: "import", test: false, noCashbackReason: null })).toEqual({ label: "No cashback", detail: "From before install" });
    expect(orderStatus({ source: "live", test: true })).toEqual({ label: "No cashback", detail: "Test order" });
    expect(orderStatus({ source: "live", test: false, noCashbackReason: null })).toEqual({ label: "No cashback", detail: null });
  });
});
