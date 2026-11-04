import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

// The verdict reads only its arguments; nothing reaches a database
vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewardspro" }));

import { judgeStuckCashback, readStoreCreditHistory, type ShopifyCredit } from "~/services/stuck-cashback.server";

const CLAIMED = new Date("2026-11-04T09:00:00.000Z");
const at = (seconds: number) => new Date(CLAIMED.getTime() + seconds * 1000);

/** £5.00 cashback claimed at 09:00 whose credit Shopify answered unclearly 20 seconds later. */
const entry = (metadata: Record<string, unknown> = { claimedAt: CLAIMED.toISOString(), unconfirmedAt: at(20).toISOString() }) => ({
  amount: new Prisma.Decimal("5.00"),
  createdAt: new Date("2026-11-04T08:30:00.000Z"),
  metadata: { syncStatus: "SYNCING", ...metadata },
});

const credit = (seconds: number, amount = "5.00", currency = "GBP", id = `gid://shopify/StoreCreditAccountCreditTransaction/${seconds}`): ShopifyCredit => ({
  id,
  amount: new Prisma.Decimal(amount),
  currency,
  createdAt: at(seconds),
  balanceAfter: new Prisma.Decimal(amount),
  accountBalance: new Prisma.Decimal(amount),
});

const judge = (credits: ShopifyCredit[], options: { complete?: boolean; ownCreditTimes?: Date[]; metadata?: Record<string, unknown> } = {}) =>
  judgeStuckCashback({
    entry: entry(options.metadata),
    history: { credits, complete: options.complete ?? true },
    shopCurrency: "GBP",
    ownCreditTimes: options.ownCreditTimes ?? [],
  });

describe("judgeStuckCashback (did a credit Shopify never confirmed arrive?)", () => {
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

  it("never says it did not arrive when a credit of that amount came in another currency", () => {
    expect(judge([credit(10, "5.00", "EUR")])).toMatchObject({ outcome: "unknown" });
  });

  it("allows for the two clocks differing by a few minutes", () => {
    expect(judge([credit(-120)])).toMatchObject({ outcome: "landed" });
  });

  describe("an entry claimed before claims were timed", () => {
    it("knows when the send ended from Shopify's unclear answer", () => {
      const sent = credit(10);
      expect(judge([sent], { metadata: { unconfirmedAt: at(20).toISOString() } })).toEqual({ outcome: "landed", credit: sent });
    });

    it("looks back to when the entry was recorded, and cannot match a credit to it", () => {
      const seenOnly = { syncingSeenAt: at(7200).toISOString() };
      expect(judge([], { metadata: seenOnly })).toEqual({ outcome: "not_landed" });
      // 08:30 is when the entry was recorded: a credit after it may be this one
      expect(judge([credit(-600)], { metadata: seenOnly })).toMatchObject({ outcome: "unknown" });
    });

    it("never says it did not arrive when a smaller credit came, since nothing recorded what a hand issue sent", () => {
      // The Orders page could send less than the entry held and leave the entry as it was
      const answered = { unconfirmedAt: at(20).toISOString() };
      expect(judge([credit(10, "3.00")], { metadata: answered })).toMatchObject({ outcome: "unknown" });
      expect(judge([credit(-600, "3.00")], { metadata: { syncingSeenAt: at(7200).toISOString() } })).toMatchObject({ outcome: "unknown" });
      // A larger credit cannot be this one
      expect(judge([credit(10, "6.00")], { metadata: answered })).toEqual({ outcome: "not_landed" });
    });
  });
});

describe("readStoreCreditHistory", () => {
  const since = new Date("2026-11-04T08:55:00.000Z");
  const answer = (body: unknown) => ({ graphql: vi.fn(async () => ({ json: async () => body })) });
  const account = (nodes: unknown[], hasNextPage = false) => ({
    id: "gid://shopify/StoreCreditAccount/1",
    balance: { amount: "7.50", currencyCode: "GBP" },
    transactions: { pageInfo: { hasNextPage }, nodes },
  });
  const node = (createdAt: string, amount = "5.00") => ({
    __typename: "StoreCreditAccountCreditTransaction",
    id: `gid://shopify/StoreCreditAccountCreditTransaction/${createdAt}`,
    amount: { amount, currencyCode: "GBP" },
    balanceAfterTransaction: { amount: "7.50", currencyCode: "GBP" },
    createdAt,
  });
  const customer = (accounts: unknown[], hasNextPage = false) => ({
    data: { customer: { id: "gid://shopify/Customer/100", storeCreditAccounts: { pageInfo: { hasNextPage }, nodes: accounts } } },
  });

  it("reads every credit with the account's balance", async () => {
    const admin = answer(customer([account([node("2026-11-04T09:00:10Z")])]));

    const result = await readStoreCreditHistory(admin, "100", since);

    expect(admin.graphql).toHaveBeenCalledWith(expect.stringContaining("CustomerStoreCreditHistory"), {
      variables: { customerId: "gid://shopify/Customer/100" },
    });
    expect(result).toMatchObject({ status: "found", history: { complete: true } });
    if (result.status !== "found") throw new Error("not found");
    expect(result.history.credits).toHaveLength(1);
    expect(result.history.credits[0]).toMatchObject({ currency: "GBP", createdAt: new Date("2026-11-04T09:00:10Z") });
    expect(result.history.credits[0].accountBalance.toFixed(2)).toBe("7.50");
  });

  it("is incomplete when Shopify has more credits since the claim than one page", async () => {
    const full = await readStoreCreditHistory(answer(customer([account([node("2026-11-04T09:00:10Z")], true)])), "100", since);
    expect(full).toMatchObject({ status: "found", history: { complete: false } });
    // A further page older than the claim does not matter
    const older = await readStoreCreditHistory(answer(customer([account([node("2026-11-04T08:00:00Z")], true)])), "100", since);
    expect(older).toMatchObject({ status: "found", history: { complete: true } });
    const moreAccounts = await readStoreCreditHistory(answer(customer([account([])], true)), "100", since);
    expect(moreAccounts).toMatchObject({ status: "found", history: { complete: false } });
  });

  it("tells a deleted customer from a failed read", async () => {
    await expect(readStoreCreditHistory(answer({ data: { customer: null } }), "100", since)).resolves.toEqual({ status: "customer_missing" });
    await expect(readStoreCreditHistory(answer({ errors: [{ message: "Throttled" }] }), "100", since)).resolves.toEqual({
      status: "failed",
      error: "Throttled",
    });
    const unreachable = { graphql: vi.fn(async () => { throw new Error("fetch failed"); }) };
    await expect(readStoreCreditHistory(unreachable, "100", since)).resolves.toEqual({ status: "failed", error: "fetch failed" });
  });
});
