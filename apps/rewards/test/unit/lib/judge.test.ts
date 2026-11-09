import { describe, expect, it, vi } from "vitest";

// payouts.server imports the app's Prisma client, which needs a database
// URL; the judge reads only its arguments.
vi.mock("~/db.server", () => ({ default: {} }));

import { Money } from "~/lib/money";
import { CLOCK_SLACK_MS, SEND_WINDOW_MS, judgeUnconfirmed } from "~/lib/payouts.server";
import type { CreditRecord } from "~/lib/ports";

// Carried from apps/rewardspro/test/unit/services/stuck-cashback.test.ts
// (judgeStuckCashback, lines 37-77). The three cases for claims made before
// claims were timed are not carried: every payout is claimed with a time.

const CLAIMED = new Date("2026-11-04T09:00:00.000Z");
const at = (seconds: number) => new Date(CLAIMED.getTime() + seconds * 1000);

const credit = (
  seconds: number,
  amount = "5.00",
  currency = "GBP",
  id = `gid://shopify/StoreCreditAccountCreditTransaction/${seconds}`,
): CreditRecord => ({ id, amount: new Money(amount), currency, createdAt: at(seconds) });

/** £5.00 cashback claimed at 09:00 whose credit Shopify answered unclearly 20 seconds later. */
const judge = (credits: CreditRecord[], options: { complete?: boolean; ownCreditTimes?: Date[] } = {}) =>
  judgeUnconfirmed({
    amount: new Money("5.0000"),
    currency: "GBP",
    claimedAt: CLAIMED,
    unconfirmedAt: at(20),
    credits,
    complete: options.complete ?? true,
    ownCreditTimes: options.ownCreditTimes ?? [],
  });

describe("judgeUnconfirmed (did a credit Shopify never confirmed arrive?)", () => {
  it("keeps the carried clock slack and send window", () => {
    expect(CLOCK_SLACK_MS).toBe(5 * 60 * 1000);
    expect(SEND_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it("says it never arrived when Shopify holds no credit of that amount since the claim", () => {
    expect(judge([])).toEqual({ outcome: "not_landed" });
    // Other amounts, and credits from before the claim, say nothing about this one
    expect(judge([credit(10, "4.99"), credit(-3600)])).toEqual({ outcome: "not_landed" });
  });

  it("says it arrived when exactly one credit of that amount came while it was being sent", () => {
    const sent = credit(10);
    expect(judge([credit(-3600), sent])).toEqual({ outcome: "landed", credit: sent });
  });

  it("cannot tell from a credit of that amount outside the sending window", () => {
    expect(judge([credit(3600)])).toMatchObject({ outcome: "unknown" });
  });

  it("cannot tell between two credits of that amount sent at the same time", () => {
    expect(judge([credit(10), credit(12)])).toMatchObject({ outcome: "unknown" });
  });

  it("cannot tell when another RewardsPro credit of that amount went to the customer then", () => {
    expect(judge([credit(10)], { ownCreditTimes: [at(60)] })).toMatchObject({ outcome: "unknown" });
    // One long before does not matter
    expect(judge([credit(10)], { ownCreditTimes: [at(-86_400)] })).toMatchObject({ outcome: "landed" });
  });

  it("never says it did not arrive from a history it could not read to the end", () => {
    expect(judge([], { complete: false })).toMatchObject({ outcome: "unknown" });
  });

  it("never says it arrived from a history it could not read to the end", () => {
    // The unread page may hold another credit of that amount from when it was sent
    expect(judge([credit(10)], { complete: false })).toMatchObject({ outcome: "unknown" });
  });

  it("never says it did not arrive when a credit of that amount came in another currency", () => {
    expect(judge([credit(10, "5.00", "EUR")])).toMatchObject({ outcome: "unknown" });
  });

  it("allows for the two clocks differing by a few minutes", () => {
    expect(judge([credit(-120)])).toMatchObject({ outcome: "landed" });
  });

  it("matches the payout's own currency, not the shop's", () => {
    // A euro credit for a euro order on a GBP shop (rule 4)
    const sent = credit(10, "5.00", "EUR");
    const euro = judgeUnconfirmed({
      amount: new Money("5.0000"),
      currency: "EUR",
      claimedAt: CLAIMED,
      unconfirmedAt: at(20),
      credits: [credit(11, "5.00", "GBP"), sent],
      complete: true,
      ownCreditTimes: [],
    });
    expect(euro).toEqual({ outcome: "landed", credit: sent });
  });

  it("without Shopify's unclear answer, takes the send window from the claim", () => {
    const unanswered = (credits: CreditRecord[]) =>
      judgeUnconfirmed({ amount: new Money("5"), currency: "GBP", claimedAt: CLAIMED, unconfirmedAt: null, credits, complete: true, ownCreditTimes: [] });
    expect(unanswered([credit(14 * 60)])).toMatchObject({ outcome: "landed" });
    expect(unanswered([credit(16 * 60)])).toMatchObject({ outcome: "unknown" });
  });
});
