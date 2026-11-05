import { describe, expect, it, vi } from "vitest";
import { RewardsCreditHistory, type GraphqlClient } from "~/shopify/graphql";
import { RAIL_CALL_TIMEOUT_MS, createStoreCreditRail } from "~/shopify/store-credit-rail.server";

describe("creditHistory (the buyer's credits in Shopify, for the hourly check)", () => {
  const since = new Date("2026-11-04T08:55:00.000Z");
  const answer = (body: unknown) => ({ graphql: vi.fn<GraphqlClient["graphql"]>(async () => ({ json: async () => body })) });
  const account = (nodes: unknown[], hasNextPage = false) => ({
    transactions: { pageInfo: { hasNextPage }, nodes },
  });
  const node = (createdAt: string, amount = "5.00", currencyCode = "GBP", typename = "StoreCreditAccountCreditTransaction") => ({
    __typename: typename,
    ...(typename === "StoreCreditAccountCreditTransaction" ? { id: `gid://shopify/StoreCreditAccountCreditTransaction/${createdAt}` } : {}),
    amount: { amount, currencyCode },
    createdAt,
  });
  const customer = (accounts: unknown[], hasNextPage = false) => ({
    data: { customer: { storeCreditAccounts: { pageInfo: { hasNextPage }, nodes: accounts } } },
  });
  const read = (admin: ReturnType<typeof answer>) => createStoreCreditRail(admin).creditHistory("100", since);

  it("reads every credit in every account", async () => {
    const admin = answer(
      customer([
        account([node("2026-11-04T09:00:10Z"), node("2026-11-04T08:00:00Z", "3.00", "GBP", "StoreCreditAccountDebitRevertTransaction")]),
        account([node("2026-11-04T09:00:20Z", "620", "JPY")]),
      ]),
    );

    const result = await read(admin);

    expect(admin.graphql).toHaveBeenCalledWith(RewardsCreditHistory, {
      variables: { customerId: "gid://shopify/Customer/100" },
      signal: expect.any(AbortSignal),
    });
    expect(result).toMatchObject({ status: "found", complete: true });
    if (result.status !== "found") throw new Error("not found");
    // Only credit transactions are credits
    expect(result.credits).toHaveLength(2);
    expect(result.credits[0]).toMatchObject({
      id: "gid://shopify/StoreCreditAccountCreditTransaction/2026-11-04T09:00:10Z",
      currency: "GBP",
      createdAt: new Date("2026-11-04T09:00:10Z"),
    });
    expect(result.credits[0].amount.toFixed(2)).toBe("5.00");
    expect(result.credits[1]).toMatchObject({ currency: "JPY" });
    expect(result.credits[1].amount.toString()).toBe("620");
  });

  it("is incomplete when Shopify has more credits since the claim than one page", async () => {
    const full = await read(answer(customer([account([node("2026-11-04T09:00:10Z")], true)])));
    expect(full).toMatchObject({ status: "found", complete: false });
    // A further page older than the claim does not matter
    const older = await read(answer(customer([account([node("2026-11-04T08:00:00Z")], true)])));
    expect(older).toMatchObject({ status: "found", complete: true });
    const moreAccounts = await read(answer(customer([account([])], true)));
    expect(moreAccounts).toMatchObject({ status: "found", complete: false });
  });

  // "Found, complete, no credits" lets the hourly check send a credit again:
  // it must come from Shopify's own answer, never from a field that wasn't there
  it("is complete with no credits only when Shopify says so", async () => {
    await expect(read(answer(customer([account([])])))).resolves.toEqual({ status: "found", credits: [], complete: true });
    await expect(read(answer(customer([])))).resolves.toEqual({ status: "found", credits: [], complete: true });

    // No pageInfo, for the accounts or for an account's credits: there may be more
    const noAccountsPageInfo = { data: { customer: { storeCreditAccounts: { nodes: [account([])] } } } };
    await expect(read(answer(noAccountsPageInfo))).resolves.toMatchObject({ status: "found", complete: false });
    const noCreditsPageInfo = customer([{ transactions: { nodes: [node("2026-11-04T08:00:00Z")] } }]);
    await expect(read(answer(noCreditsPageInfo))).resolves.toMatchObject({ status: "found", complete: false });
    const nullPageInfo = customer([{ transactions: { pageInfo: null, nodes: [] } }]);
    await expect(read(answer(nullPageInfo))).resolves.toMatchObject({ status: "found", complete: false });

    // No list of credits, or of accounts: a failed read
    for (const broken of [{}, { transactions: null }, { transactions: { pageInfo: { hasNextPage: false } } }, { transactions: { pageInfo: { hasNextPage: false }, nodes: {} } }]) {
      await expect(read(answer(customer([broken])))).resolves.toMatchObject({ status: "failed" });
    }
    await expect(read(answer({ data: { customer: { storeCreditAccounts: { pageInfo: { hasNextPage: false } } } } }))).resolves.toMatchObject({ status: "failed" });
    await expect(read(answer({ data: { customer: {} } }))).resolves.toMatchObject({ status: "failed" });
  });

  it("tells a deleted customer from a failed read", async () => {
    await expect(read(answer({ data: { customer: null } }))).resolves.toEqual({ status: "customer_missing" });
    await expect(read(answer({ errors: [{ message: "Throttled" }] }))).resolves.toEqual({ status: "failed", error: "Throttled" });
    const unreachable = {
      graphql: vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    };
    await expect(createStoreCreditRail(unreachable).creditHistory("100", since)).resolves.toEqual({ status: "failed", error: "fetch failed" });
    // An answer it can't read is a failed read, never a history
    await expect(read(answer(customer([account([node("2026-11-04T09:00:10Z", "lots")])])))).resolves.toMatchObject({ status: "failed" });
    await expect(read(answer({ data: {} }))).resolves.toMatchObject({ status: "failed" });
  });

  it("is a failed read when Shopify gives no answer in time", async () => {
    vi.useFakeTimers();
    try {
      const hanging = { graphql: vi.fn(() => new Promise<never>(() => {})) };
      const result = createStoreCreditRail(hanging).creditHistory("100", since);
      await vi.advanceTimersByTimeAsync(RAIL_CALL_TIMEOUT_MS);
      await expect(result).resolves.toMatchObject({ status: "failed" });
    } finally {
      vi.useRealTimers();
    }
  });
});
