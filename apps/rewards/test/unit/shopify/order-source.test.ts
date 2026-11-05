import { afterEach, describe, expect, it, vi } from "vitest";
import { cashbackBase } from "~/lib/order-facts";
import { ShopifyTimeoutError } from "~/shopify/ask.server";
import {
  RewardsOrderFacts,
  RewardsOrderTransactions,
  RewardsOrderTransactionsCost,
  RewardsRecentPaidOrders,
  RewardsRefundFacts,
  RewardsRefundFactsCost,
  type GraphqlClient,
} from "~/shopify/graphql";
import {
  MAX_COST_IN_FLIGHT,
  ORDER_READ_DEADLINE_MS,
  createShopifyOrderSource,
  factsFromOrderNode,
} from "~/shopify/order-source.server";
import bulkNode from "../../fixtures/orders/bulk-node.json";
import discounts from "../../fixtures/orders/discounts.json";
import eurOnGbp from "../../fixtures/orders/eur-on-gbp.json";
import giftCardLine from "../../fixtures/orders/gift-card-line.json";
import giftCardTender from "../../fixtures/orders/gift-card-tender.json";
import jpy from "../../fixtures/orders/jpy.json";
import plain from "../../fixtures/orders/plain.json";
import recentPaid1 from "../../fixtures/orders/recent-paid-1.json";
import recentPaid2 from "../../fixtures/orders/recent-paid-2.json";
import refundInFullUsd from "../../fixtures/orders/refund-in-full-usd.json";
import refundItems from "../../fixtures/orders/refund-items.json";
import refundJpyItems from "../../fixtures/orders/refund-jpy-items.json";
import refundMoneyAndShippingGbp from "../../fixtures/orders/refund-money-and-shipping-gbp.json";
import refundMoneyAndTaxedShipping from "../../fixtures/orders/refund-money-and-taxed-shipping.json";
import refundMoneyOnly from "../../fixtures/orders/refund-money-only.json";
import refundShippingOnly from "../../fixtures/orders/refund-shipping-only.json";
import refundTaxedShippingOnly from "../../fixtures/orders/refund-taxed-shipping-only.json";
import refundedInFullUsd from "../../fixtures/orders/refunded-in-full-usd.json";
import refunded from "../../fixtures/orders/refunded.json";
import storeCreditTender from "../../fixtures/orders/store-credit-tender.json";
import taxExclusiveUsd from "../../fixtures/orders/tax-exclusive-usd.json";
import taxInclusiveGbp from "../../fixtures/orders/tax-inclusive-gbp.json";
import taxedShippingUsd from "../../fixtures/orders/taxed-shipping-usd.json";
import testOrder from "../../fixtures/orders/test-order.json";

type Answer = { data: Record<string, unknown> };
type Route = (query: string, variables: Record<string, unknown>) => unknown;

const clone = <T>(value: T): T => structuredClone(value);

/** A client that answers each document from `route`, and records what it was asked. */
function shopify(route: Route) {
  const graphql = vi.fn<GraphqlClient["graphql"]>(async (query, options) => {
    const body = route(query, options?.variables ?? {});
    return { json: async () => body };
  });
  return { graphql };
}

/** Answers RewardsOrderFacts and RewardsRefundFacts from fixtures, by the id asked for; Shopify's null for any other. */
function fromFixtures(orders: Answer[], refunds: Answer[] = []) {
  const byId = new Map<string, Answer>();
  for (const answer of orders) byId.set((answer.data.order as { id: string }).id, answer);
  for (const answer of refunds) byId.set((answer.data.refund as { id: string }).id, answer);
  return shopify((query, variables) => {
    const answer = byId.get(variables.id as string);
    if (query === RewardsOrderFacts) return answer ?? { data: { shop: { currencyCode: "GBP" }, order: null } };
    if (query === RewardsRefundFacts) return answer ?? { data: { refund: null } };
    throw new Error("unexpected document");
  });
}

const asked = (client: ReturnType<typeof shopify>) =>
  client.graphql.mock.calls.map(([query, options]) => ({
    document:
      query === RewardsOrderFacts
        ? "order"
        : query === RewardsRefundFacts
          ? "refund"
          : query === RewardsOrderTransactions
            ? "transactions"
            : "orders",
    variables: options?.variables,
  }));

const bag = (amount: string) => ({ shopMoney: { amount }, presentmentMoney: { amount } });

/** A refund of the USD order 5012 with no items: `amount` of money and no shipping. */
function moneyRefund(id: string, amount: string, createdAt = "2026-11-03T12:00:00Z"): Answer {
  const answer = clone(refundInFullUsd);
  Object.assign(answer.data.refund, {
    id,
    createdAt,
    transactions: { nodes: [{ kind: "REFUND", status: "SUCCESS", amountSet: bag(amount) }] },
    refundShippingLines: { nodes: [] },
  });
  return answer;
}

/** A refund of the USD order 5012 that returned one of `lineId`'s items, and $20. */
function itemRefund(id: string, createdAt: string, lineId: string): Answer {
  const answer = moneyRefund(id, "20.0", createdAt);
  Object.assign(answer.data.refund as object, { refundLineItems: { pageInfo: { hasNextPage: false }, nodes: [{ quantity: 1, lineItem: { id: lineId } }] } });
  return answer;
}

async function readOrder(order: Answer, refunds: Answer[] = []) {
  const client = fromFixtures([order], refunds);
  const facts = await createShopifyOrderSource(client).readOrder((order.data.order as { id: string }).id);
  if (!facts) throw new Error("no facts");
  return { facts, client };
}

describe("readOrder (the facts of one order, from its line items and tenders)", () => {
  it("reads a plain order", async () => {
    const { facts: f, client } = await readOrder(plain);

    expect(asked(client)).toEqual([{ document: "order", variables: { id: "gid://shopify/Order/5001", after: null } }]);
    expect(f).toMatchObject({
      externalOrderId: "gid://shopify/Order/5001",
      name: "#1001",
      externalCustomerId: "7001",
      currency: "GBP",
      shopCurrency: "GBP",
      test: false,
      cancelledAt: null,
      orderedAt: new Date("2026-11-02T10:15:00Z"),
      paidAt: new Date("2026-11-02T10:15:04Z"),
      financialStatus: "PAID",
      refunds: [],
    });
    expect(f.productValue.amount.toFixed(2)).toBe("50.00"); // shipping £5 not included
    expect(f.productValue.shopAmount.toFixed(2)).toBe("50.00");
    expect(f.total.amount.toFixed(2)).toBe("55.00");
    expect(f.total.shopAmount.toFixed(2)).toBe("55.00");
    expect(f.storeCreditUsed.amount.toFixed(2)).toBe("0.00");
    expect(f.giftCardUsed.amount.toFixed(2)).toBe("0.00");
    expect(f.refundedProductValue.amount.toFixed(2)).toBe("0.00");
    expect(f.refundedProductValue.shopAmount.toFixed(2)).toBe("0.00");
  });

  it("takes line discounts and an order discount allocated across the lines off the product value", async () => {
    const { facts: f } = await readOrder(discounts);
    // (£30 − £5 − £2.50) + (£20 − £2.00)
    expect(f.productValue.amount.toFixed(2)).toBe("40.50");
    expect(f.productValue.shopAmount.toFixed(2)).toBe("40.50");
    expect(f.total.amount.toFixed(2)).toBe("45.50");
  });

  it("keeps tax inside a tax-inclusive GBP price, and adds none to a tax-exclusive USD one", async () => {
    const { facts: gbp } = await readOrder(taxInclusiveGbp);
    expect(gbp.productValue.amount.toFixed(2)).toBe("60.00"); // £10 VAT is in the price
    expect(gbp.total.amount.toFixed(2)).toBe("64.99");

    const { facts: usd } = await readOrder(taxExclusiveUsd);
    expect(usd.currency).toBe("USD");
    expect(usd.shopCurrency).toBe("USD");
    expect(usd.productValue.amount.toFixed(2)).toBe("40.00"); // $3.30 tax and $6 shipping not included
    expect(usd.total.amount.toFixed(2)).toBe("49.30");
  });

  it("leaves gift-card lines out of the product value", async () => {
    const { facts: f } = await readOrder(giftCardLine);
    expect(f.productValue.amount.toFixed(2)).toBe("30.00");
    expect(f.total.amount.toFixed(2)).toBe("55.00");
  });

  it("counts successful store credit sales and captures as store credit used (the spec's £40 base)", async () => {
    const { facts: f } = await readOrder(storeCreditTender);
    // £6 shopify_store_credit + £4 captured by "Cashback Rewards"; the failed £10, the authorisations and the card don't count
    expect(f.storeCreditUsed.amount.toFixed(2)).toBe("10.00");
    expect(f.storeCreditUsed.shopAmount.toFixed(2)).toBe("10.00");
    expect(f.giftCardUsed.amount.toFixed(2)).toBe("0.00");
    expect(f.productValue.amount.toFixed(2)).toBe("50.00");
    expect(cashbackBase(f).amount.toFixed(2)).toBe("40.00");
  });

  it("counts successful gift card sales as gift cards used", async () => {
    const { facts: f } = await readOrder(giftCardTender);
    expect(f.giftCardUsed.amount.toFixed(2)).toBe("20.00"); // the £5 that errored doesn't count
    expect(f.storeCreditUsed.amount.toFixed(2)).toBe("0.00");
    expect(cashbackBase(f).amount.toFixed(2)).toBe("60.00");
  });

  it("reads a euro order on a GBP shop in both currencies", async () => {
    const { facts: f } = await readOrder(eurOnGbp);
    expect(f.currency).toBe("EUR");
    expect(f.shopCurrency).toBe("GBP");
    expect(f.productValue.amount.toFixed(2)).toBe("52.20");
    expect(f.productValue.shopAmount.toFixed(2)).toBe("45.00");
    expect(f.storeCreditUsed.amount.toFixed(2)).toBe("11.60");
    expect(f.storeCreditUsed.shopAmount.toFixed(2)).toBe("10.00");
    expect(f.total.amount.toFixed(2)).toBe("58.00");
    expect(f.total.shopAmount.toFixed(2)).toBe("50.00");
  });

  it("works in whole yen, rounding a refunded item's share down", async () => {
    const { facts: f } = await readOrder(jpy, [refundJpyItems]);
    expect(f.currency).toBe("JPY");
    expect(f.productValue.amount.toString()).toBe("2900");
    // One of three items worth ¥2,900: ¥966.66… rounds down to ¥966
    expect(f.refunds).toHaveLength(1);
    expect(f.refunds[0].productValue.amount.toString()).toBe("966");
    expect(f.refunds[0].productValue.shopAmount.toString()).toBe("966");
    expect(f.refundedProductValue.amount.toString()).toBe("966");
  });

  it("values an item refund, a shipping-only refund and a money-only refund", async () => {
    const { facts: f, client } = await readOrder(refunded, [refundItems, refundShippingOnly, refundMoneyOnly]);

    expect(asked(client)).toEqual([
      { document: "order", variables: { id: "gid://shopify/Order/5011", after: null } },
      { document: "refund", variables: { id: "gid://shopify/Refund/6151" } },
      { document: "refund", variables: { id: "gid://shopify/Refund/6152" } },
      { document: "refund", variables: { id: "gid://shopify/Refund/6153" } },
    ]);
    expect(f.productValue.amount.toFixed(2)).toBe("47.00");
    expect(f.refunds.map((r) => r.externalRefundId)).toEqual([
      "gid://shopify/Refund/6151",
      "gid://shopify/Refund/6152",
      "gid://shopify/Refund/6153",
    ]);
    expect(f.refunds[0].refundedAt).toEqual(new Date("2026-11-03T09:00:00Z"));
    // One of two items worth £27
    expect(f.refunds[0].productValue.amount.toFixed(2)).toBe("13.50");
    expect(f.refunds[1].productValue.amount.toFixed(2)).toBe("0.00"); // shipping-only
    expect(f.refunds[1].productValue.shopAmount.toFixed(2)).toBe("0.00");
    // £8 refunded with no items; the failed £100 doesn't count
    expect(f.refunds[2].productValue.amount.toFixed(2)).toBe("8.00");
    expect(f.refundedProductValue.amount.toFixed(2)).toBe("21.50");
    expect(f.refundedProductValue.shopAmount.toFixed(2)).toBe("21.50");
  });

  it("caps a money-only refund at the product value not yet refunded", async () => {
    const { facts: f } = await readOrder(refundedInFullUsd, [refundInFullUsd]);
    // $49.30 refunded less $6 itemised shipping is $43.30, but only $40 of products were bought
    expect(f.refunds[0].productValue.amount.toFixed(2)).toBe("40.00");
    expect(f.refundedProductValue.amount.toFixed(2)).toBe("40.00");
  });

  it("caps an item refund at the product value not yet refunded (Ruling 20)", async () => {
    const order = clone(refundedInFullUsd);
    order.data.order.refunds = [{ id: "gid://shopify/Refund/6251" }, { id: "gid://shopify/Refund/6253" }];
    const items = itemRefund("gid://shopify/Refund/6253", "2026-11-04T12:00:00Z", "gid://shopify/LineItem/6201");

    const { facts: f } = await readOrder(order, [refundInFullUsd, items]);

    // The money-only refund took the whole $40 back first; one of two $20 items is then worth nothing more
    expect(f.refunds.map((r) => r.productValue.amount.toFixed(2))).toEqual(["40.00", "0.00"]);
    expect(f.refundedProductValue.amount.toFixed(2)).toBe("40.00");
    expect(f.refundedProductValue.shopAmount.toFixed(2)).toBe("40.00");

    const one = await createShopifyOrderSource(fromFixtures([order], [refundInFullUsd, items])).readRefund("gid://shopify/Refund/6253");
    expect(one?.refund.productValue.amount.toFixed(2)).toBe("0.00");
  });

  it("orders refunds made in the same second by id, so readOrder and readRefund cap them alike", async () => {
    const order = clone(refundedInFullUsd);
    // Shopify's order is not the id order
    order.data.order.refunds = [{ id: "gid://shopify/Refund/6262" }, { id: "gid://shopify/Refund/6261" }];
    const refunds = [moneyRefund("gid://shopify/Refund/6261", "30.0"), moneyRefund("gid://shopify/Refund/6262", "30.0")];

    const { facts: f } = await readOrder(order, refunds);
    expect(f.refunds.map((r) => [r.externalRefundId, r.productValue.amount.toFixed(2)])).toEqual([
      ["gid://shopify/Refund/6261", "30.00"],
      ["gid://shopify/Refund/6262", "10.00"],
    ]);

    for (const [id, value] of [
      ["gid://shopify/Refund/6261", "30.00"],
      ["gid://shopify/Refund/6262", "10.00"],
    ]) {
      const one = await createShopifyOrderSource(fromFixtures([order], refunds)).readRefund(id);
      expect(one?.refund.productValue.amount.toFixed(2)).toBe(value);
    }
  });

  it("takes taxed shipping off a money-only refund on a tax-exclusive shop (Ruling 11)", async () => {
    // $6 shipping and its $0.48 tax refunded: nothing taken back
    const { facts: shippingOnly } = await readOrder(taxedShippingUsd, [refundTaxedShippingOnly]);
    expect(shippingOnly.refunds[0].productValue.amount.toFixed(2)).toBe("0.00");
    expect(shippingOnly.refunds[0].productValue.shopAmount.toFixed(2)).toBe("0.00");

    // $16.48 is $10 of product money plus the $6.48 of shipping
    const order = clone(taxedShippingUsd);
    order.data.order.refunds = [{ id: "gid://shopify/Refund/6352" }];
    const { facts: money } = await readOrder(order, [refundMoneyAndTaxedShipping]);
    expect(money.refunds[0].productValue.amount.toFixed(2)).toBe("10.00");
    expect(money.refunds[0].productValue.shopAmount.toFixed(2)).toBe("10.00");
  });

  it("takes shipping off at its subtotal alone on a tax-inclusive shop, whose subtotal holds the tax", async () => {
    // £5 shipping with £0.83 VAT inside it: the shipping-only refund takes nothing back
    const { facts: shippingOnly } = await readOrder(refunded, [refundItems, refundShippingOnly, refundMoneyOnly]);
    expect(shippingOnly.refunds[1].productValue.amount.toFixed(2)).toBe("0.00");

    // £13 is £8 of product money plus the £5 shipping; adding the VAT again would give £7.17
    const order = clone(refunded);
    order.data.order.refunds = [{ id: "gid://shopify/Refund/6154" }];
    const { facts: money } = await readOrder(order, [refundMoneyAndShippingGbp]);
    expect(money.refunds[0].productValue.amount.toFixed(2)).toBe("8.00");
  });

  it("throws rather than guess whether shipping was taxed when the order doesn't say", async () => {
    const order = clone(refunded) as { data: { order: Record<string, unknown> } };
    delete order.data.order.taxesIncluded;
    await expect(readOrder(order as Answer, [refundItems, refundShippingOnly, refundMoneyOnly])).rejects.toThrow(/include tax/);
  });

  it("reads a test order from a guest", async () => {
    const { facts: f } = await readOrder(testOrder);
    expect(f.test).toBe(true);
    expect(f.externalCustomerId).toBeNull();
    expect(f.productValue.amount.toFixed(2)).toBe("12.00");
  });

  it("reads every page of more than 100 lines", async () => {
    const page1 = clone(plain);
    page1.data.order.lineItems.pageInfo = { hasNextPage: true, endCursor: "cursor-1" };
    const page2 = clone(plain);
    page2.data.order.lineItems.nodes = [clone(plain.data.order.lineItems.nodes[1])];
    page2.data.order.lineItems.nodes[0].id = "gid://shopify/LineItem/5103";
    const client = shopify((_query, variables) => (variables.after === "cursor-1" ? page2 : page1));

    const f = await createShopifyOrderSource(client).readOrder("gid://shopify/Order/5001");

    expect(asked(client)).toEqual([
      { document: "order", variables: { id: "gid://shopify/Order/5001", after: null } },
      { document: "order", variables: { id: "gid://shopify/Order/5001", after: "cursor-1" } },
    ]);
    expect(f?.productValue.amount.toFixed(2)).toBe("70.00");
  });

  it("gives up after 25 pages of lines", async () => {
    const endless = clone(plain);
    endless.data.order.lineItems.pageInfo = { hasNextPage: true, endCursor: "again" };
    const client = shopify(() => endless);

    await expect(createShopifyOrderSource(client).readOrder("gid://shopify/Order/5001")).rejects.toThrow(/25 pages/);
    expect(client.graphql).toHaveBeenCalledTimes(25);
  });

  it("throws on a line id that appears on two pages", async () => {
    const page1 = clone(plain);
    page1.data.order.lineItems.pageInfo = { hasNextPage: true, endCursor: "cursor-1" };
    const client = shopify((_query, variables) => (variables.after === "cursor-1" ? plain : page1));
    await expect(createShopifyOrderSource(client).readOrder("gid://shopify/Order/5001")).rejects.toThrow(/appears twice/);
  });

  it("throws on a line whose currencies are not the order's", async () => {
    const mixed = clone(plain);
    mixed.data.order.lineItems.nodes[0].originalTotalSet.presentmentMoney.currencyCode = "EUR";
    await expect(createShopifyOrderSource(shopify(() => mixed)).readOrder("gid://shopify/Order/5001")).rejects.toThrow(
      /currencies are not the order's/,
    );
  });

  it("throws on a refund line the order doesn't have", async () => {
    const stray = clone(refundItems);
    stray.data.refund.refundLineItems.nodes[0].lineItem.id = "gid://shopify/LineItem/9999";
    await expect(readOrder(refunded, [stray, refundShippingOnly, refundMoneyOnly])).rejects.toThrow(/doesn't have/);
  });

  it("throws on a refund with more than 100 lines", async () => {
    const long = clone(refundItems);
    long.data.refund.refundLineItems.pageInfo.hasNextPage = true;
    await expect(readOrder(refunded, [long, refundShippingOnly, refundMoneyOnly])).rejects.toThrow(/more than 100 lines/);
  });

  it("reads a financial status Shopify leaves null as UNKNOWN", async () => {
    const unknown = clone(plain) as { data: { order: Record<string, unknown> } };
    unknown.data.order.displayFinancialStatus = null;
    const { facts: f } = await readOrder(unknown as Answer);
    expect(f.financialStatus).toBe("UNKNOWN");
  });

  it("answers null for an order Shopify doesn't have, and throws when it can't tell", async () => {
    await expect(createShopifyOrderSource(fromFixtures([])).readOrder("gid://shopify/Order/404")).resolves.toBeNull();

    const errors = shopify(() => ({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }));
    await expect(createShopifyOrderSource(errors).readOrder("gid://shopify/Order/5001")).rejects.toThrow("Throttled");

    const unreadable = clone(plain) as { data: { order: { lineItems: { nodes: Array<Record<string, unknown>> } } } };
    unreadable.data.order.lineItems.nodes[0].originalTotalSet = { shopMoney: { amount: "lots", currencyCode: "GBP" } };
    await expect(createShopifyOrderSource(shopify(() => unreadable)).readOrder("gid://shopify/Order/5001")).rejects.toThrow();
  });

  it("throws rather than miss refunds or tenders beyond the 20 it reads", async () => {
    const manyRefunds = clone(plain) as { data: { order: { refunds: Array<{ id: string }> } } };
    manyRefunds.data.order.refunds = Array.from({ length: 20 }, (_, i) => ({ id: `gid://shopify/Refund/${i + 1}` }));
    await expect(createShopifyOrderSource(shopify(() => manyRefunds)).readOrder("gid://shopify/Order/5001")).rejects.toThrow(
      /20 refunds/,
    );

  });

  it("reads every tender again when the first 20 came back full, and throws only if 200 do too", async () => {
    const card = plain.data.order.transactions[0];
    const storeCredit = { ...clone(card), gateway: "shopify_store_credit", amountSet: bag("6.0") };
    const manyTenders = clone(plain);
    manyTenders.data.order.transactions = Array.from({ length: 20 }, () => clone(card));
    const tenders = (transactions: unknown[]) =>
      shopify((query) => (query === RewardsOrderTransactions ? { data: { order: { transactions } } } : manyTenders));

    // 20 failed or card attempts, then the store credit that paid
    const whole = tenders([...Array.from({ length: 20 }, () => clone(card)), storeCredit]);
    const f = await createShopifyOrderSource(whole).readOrder("gid://shopify/Order/5001");
    expect(asked(whole)).toEqual([
      { document: "order", variables: { id: "gid://shopify/Order/5001", after: null } },
      { document: "transactions", variables: { id: "gid://shopify/Order/5001" } },
    ]);
    expect(f?.storeCreditUsed.amount.toFixed(2)).toBe("6.00");

    const full = tenders(Array.from({ length: 200 }, () => clone(card)));
    await expect(createShopifyOrderSource(full).readOrder("gid://shopify/Order/5001")).rejects.toThrow(/200 transactions/);
  });

  it("sends no tender follow-up for an order whose 20 refunds already make the read fail", async () => {
    const both = clone(plain) as { data: { order: { refunds: Array<{ id: string }>; transactions: unknown[] } } };
    both.data.order.refunds = Array.from({ length: 20 }, (_, i) => ({ id: `gid://shopify/Refund/${i + 1}` }));
    both.data.order.transactions = Array.from({ length: 20 }, () => clone(plain.data.order.transactions[0]));
    const client = shopify((query) => {
      if (query === RewardsOrderTransactions) throw new Error("the follow-up was sent");
      return both;
    });

    await expect(createShopifyOrderSource(client).readOrder("gid://shopify/Order/5001")).rejects.toThrow(/20 refunds/);
    expect(asked(client).map((a) => a.document)).toEqual(["order"]);
  });
});

describe("the calls in flight (their requested cost within MAX_COST_IN_FLIGHT)", () => {
  /** The USD order 5012 with 20 tenders (so the follow-up is read) and `n` money-only refunds of $1. */
  function busyOrder(n: number) {
    const order = clone(refundedInFullUsd);
    order.data.order.transactions = Array.from({ length: 20 }, () => clone(refundedInFullUsd.data.order.transactions[0]));
    const ids = Array.from({ length: n }, (_, i) => `gid://shopify/Refund/${7001 + i}`);
    order.data.order.refunds = ids.map((id) => ({ id }));
    const refunds = new Map(ids.map((id, i) => [id, moneyRefund(id, "1.0", `2026-11-03T12:00:0${i}Z`)]));
    return { order, refunds, ids };
  }

  /**
   * A client that answers each call a moment later (or rejects the follow-up,
   * with `failFollowUp`), recording the requested cost in flight whenever a
   * call is sent.
   */
  function metered(order: Answer, refunds: Map<string, Answer>, failFollowUp = false) {
    const cost = (query: string) =>
      query === RewardsRefundFacts ? RewardsRefundFactsCost : query === RewardsOrderTransactions ? RewardsOrderTransactionsCost : 909;
    let inFlight = 0;
    const seen: Array<{ document: string; inFlight: number }> = [];
    const graphql = vi.fn<GraphqlClient["graphql"]>(async (query, options) => {
      inFlight += cost(query);
      seen.push({ document: query === RewardsRefundFacts ? "refund" : query === RewardsOrderTransactions ? "transactions" : "order", inFlight });
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= cost(query);
      if (query === RewardsOrderTransactions) {
        if (failFollowUp) throw new Error("the follow-up failed");
        return { json: async () => ({ data: { order: { transactions: (order.data.order as { transactions: unknown[] }).transactions } } }) };
      }
      if (query === RewardsRefundFacts) return { json: async () => refunds.get(options?.variables?.id as string) };
      return { json: async () => order };
    });
    return { client: { graphql }, seen };
  }

  it("reads five refunds and the 801-point tender follow-up without passing 1,000 points in flight", async () => {
    const { order, refunds, ids } = busyOrder(5);
    const { client, seen } = metered(order, refunds);

    const f = await createShopifyOrderSource(client).readOrder("gid://shopify/Order/5012");

    expect(f?.refunds.map((r) => r.externalRefundId)).toEqual(ids);
    expect(f?.refundedProductValue.amount.toFixed(2)).toBe("5.00");
    expect(seen.map((s) => s.document)).toEqual(["order", "transactions", "refund", "refund", "refund", "refund", "refund"]);
    expect(Math.max(...seen.map((s) => s.inFlight))).toBeLessThanOrEqual(MAX_COST_IN_FLIGHT);
    // The follow-up alone, then the refunds two at a time, the next sent as one answers
    expect(seen.map((s) => s.inFlight)).toEqual([909, 801, 429, 858, 858, 858, 858]);
  });

  it("holds readRefund's other refunds to two at a time", async () => {
    const { order, refunds, ids } = busyOrder(5);
    const { client, seen } = metered(order, refunds);

    const answer = await createShopifyOrderSource(client).readRefund(ids[4]);

    expect(answer?.refund.productValue.amount.toFixed(2)).toBe("1.00");
    expect(seen.map((s) => s.inFlight)).toEqual([429, 909, 429, 858, 858, 858]);
  });

  it("rejects once, and sends no waiting refund, when the tender follow-up fails", async () => {
    const { order, refunds } = busyOrder(3);
    const { client, seen } = metered(order, refunds, true);

    await expect(createShopifyOrderSource(client).readOrder("gid://shopify/Order/5012")).rejects.toThrow(/the follow-up failed/);
    // Let anything left over settle: an unhandled rejection would fail this file
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen.map((s) => s.document)).toEqual(["order", "transactions"]);
  });
});

describe("the read deadline (every call of one read within ORDER_READ_DEADLINE_MS)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The fixtures' answers, each `ms` late. */
  function late(ms: number, answers: ReturnType<typeof fromFixtures>) {
    const graphql = vi.fn<GraphqlClient["graphql"]>(
      (query, options) => new Promise((resolve) => setTimeout(() => resolve(answers.graphql(query, options)), ms)),
    );
    return { graphql };
  }

  /** The read's outcome so far: "pending", "answered" or what it threw. */
  function watch(read: Promise<unknown>) {
    const state: { outcome: unknown } = { outcome: "pending" };
    read.then(
      () => (state.outcome = "answered"),
      (error: unknown) => (state.outcome = error),
    );
    return state;
  }

  it("fails the whole read when a second call runs past the deadline, though no one call takes 4.5 s", async () => {
    vi.useFakeTimers();
    const client = late(3000, fromFixtures([refundedInFullUsd], [refundInFullUsd]));
    const read = watch(createShopifyOrderSource(client).readOrder("gid://shopify/Order/5012"));

    await vi.advanceTimersByTimeAsync(ORDER_READ_DEADLINE_MS - 1);
    expect(client.graphql).toHaveBeenCalledTimes(2); // the order at 0 s, its refund at 3 s
    expect(read.outcome).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    expect(read.outcome).toBeInstanceOf(ShopifyTimeoutError);
    expect(client.graphql.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it("reads the refunds two at a time, so three of them fit after the order", async () => {
    vi.useFakeTimers();
    const client = late(1200, fromFixtures([refunded], [refundItems, refundShippingOnly, refundMoneyOnly]));
    const read = watch(createShopifyOrderSource(client).readOrder("gid://shopify/Order/5011"));

    // The order at 0 s, two refunds at 1.2 s, the third at 2.4 s; one after another, the third would end at 4.8 s
    await vi.advanceTimersByTimeAsync(3600);
    expect(client.graphql).toHaveBeenCalledTimes(4);
    expect(read.outcome).toBe("answered");
  });

  it("holds readRefund to the same deadline", async () => {
    vi.useFakeTimers();
    const client = late(2000, fromFixtures([refunded], [refundItems, refundShippingOnly, refundMoneyOnly]));
    const read = watch(createShopifyOrderSource(client).readRefund("gid://shopify/Refund/6153"));

    await vi.advanceTimersByTimeAsync(ORDER_READ_DEADLINE_MS);
    // The refund at 0 s and the order at 2 s answered; the other refunds, sent at 4 s, had 0.5 s left
    expect(read.outcome).toBeInstanceOf(ShopifyTimeoutError);
  });
});

describe("readRefund (one refund, valued against its order's lines)", () => {
  it("reads the refund and then the order's lines", async () => {
    const client = fromFixtures([refunded], [refundItems, refundShippingOnly, refundMoneyOnly]);

    const answer = await createShopifyOrderSource(client).readRefund("gid://shopify/Refund/6151");

    // The order's other refunds too: an item refund is capped by them as well (Ruling 20)
    expect(asked(client)).toEqual([
      { document: "refund", variables: { id: "gid://shopify/Refund/6151" } },
      { document: "order", variables: { id: "gid://shopify/Order/5011", after: null } },
      { document: "refund", variables: { id: "gid://shopify/Refund/6152" } },
      { document: "refund", variables: { id: "gid://shopify/Refund/6153" } },
    ]);
    expect(answer?.orderGid).toBe("gid://shopify/Order/5011");
    expect(answer?.refund.externalRefundId).toBe("gid://shopify/Refund/6151");
    expect(answer?.refund.refundedAt).toEqual(new Date("2026-11-03T09:00:00Z"));
    expect(answer?.refund.productValue.amount.toFixed(2)).toBe("13.50");
    expect(answer?.refund.productValue.shopAmount.toFixed(2)).toBe("13.50");
  });

  it("values a shipping-only refund at 0", async () => {
    const client = fromFixtures([refunded], [refundItems, refundShippingOnly, refundMoneyOnly]);
    const answer = await createShopifyOrderSource(client).readRefund("gid://shopify/Refund/6152");
    expect(answer?.refund.productValue.amount.toFixed(2)).toBe("0.00");
  });

  it("reads the order's other refunds for a money-only refund, so its cap is the same as readOrder's", async () => {
    const client = fromFixtures([refundedInFullUsd], [refundInFullUsd]);
    const capped = await createShopifyOrderSource(client).readRefund("gid://shopify/Refund/6251");
    expect(capped?.refund.productValue.amount.toFixed(2)).toBe("40.00");

    const withEarlier = fromFixtures([refunded], [refundItems, refundShippingOnly, refundMoneyOnly]);
    const money = await createShopifyOrderSource(withEarlier).readRefund("gid://shopify/Refund/6153");
    expect(money?.refund.productValue.amount.toFixed(2)).toBe("8.00");
    expect(asked(withEarlier).filter((a) => a.document === "refund")).toHaveLength(3);
  });

  it("answers null for a refund Shopify doesn't have", async () => {
    await expect(createShopifyOrderSource(fromFixtures([])).readRefund("gid://shopify/Refund/404")).resolves.toBeNull();
  });
});

describe("factsFromOrderNode (shared with the import)", () => {
  it("values a bulk-shaped node's refunded quantities when it has no refunds", () => {
    const f = factsFromOrderNode(bulkNode, "GBP", []);
    // (£45 − £4.50) + £19.99; the £10 gift card line doesn't count
    expect(f.productValue.amount.toFixed(2)).toBe("60.49");
    // 2 × £13.50 + 1 × £9.995 = £36.995, rounded down
    expect(f.refundedProductValue.amount.toFixed(2)).toBe("36.99");
    expect(f.refundedProductValue.shopAmount.toFixed(2)).toBe("36.99");
    expect(f.refunds).toEqual([]);
    expect(f.financialStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("refuses an order whose shop money is in another currency than the shop's", () => {
    expect(() => factsFromOrderNode(plain.data.order, "USD", [])).toThrow(/GBP/);
  });
});

describe("recentPaidOrders (the hourly sweep's candidates)", () => {
  const since = new Date("2026-11-01T09:00:00.000Z");

  it("pages the paid and partly refunded orders created since then", async () => {
    const client = shopify((_query, variables) => (variables.after ? recentPaid2 : recentPaid1));

    const orders = await createShopifyOrderSource(client).recentPaidOrders(since);

    const query = "created_at:>='2026-11-01T09:00:00.000Z' AND (financial_status:paid OR financial_status:partially_refunded)";
    expect(client.graphql.mock.calls.map(([document, options]) => [document, options?.variables])).toEqual([
      [RewardsRecentPaidOrders, { query, after: null }],
      [RewardsRecentPaidOrders, { query, after: recentPaid1.data.orders.pageInfo.endCursor }],
    ]);
    expect(orders).toEqual([
      { orderGid: "gid://shopify/Order/5001", hasCustomer: true, test: false, orderedAt: new Date("2026-11-02T10:15:00Z") },
      { orderGid: "gid://shopify/Order/5010", hasCustomer: false, test: true, orderedAt: new Date("2026-11-02T11:00:00Z") },
      { orderGid: "gid://shopify/Order/5011", hasCustomer: true, test: false, orderedAt: new Date("2026-11-02T12:30:00Z") },
    ]);
  });

  it("reads at most 10 pages", async () => {
    const client = shopify(() => recentPaid1);
    const orders = await createShopifyOrderSource(client).recentPaidOrders(since);
    expect(client.graphql).toHaveBeenCalledTimes(10);
    expect(orders).toHaveLength(20);
  });

  it("throws when Shopify answers with errors", async () => {
    const client = shopify(() => ({ errors: [{ message: "Throttled" }] }));
    await expect(createShopifyOrderSource(client).recentPaidOrders(since)).rejects.toThrow("Throttled");
  });
});
