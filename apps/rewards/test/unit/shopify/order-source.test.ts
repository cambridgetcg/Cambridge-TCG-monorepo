import { describe, expect, it, vi } from "vitest";
import { cashbackBase } from "~/lib/order-facts";
import { RewardsOrderFacts, RewardsRecentPaidOrders, RewardsRefundFacts, type GraphqlClient } from "~/shopify/graphql";
import { createShopifyOrderSource, factsFromOrderNode } from "~/shopify/order-source.server";
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
import refundMoneyOnly from "../../fixtures/orders/refund-money-only.json";
import refundShippingOnly from "../../fixtures/orders/refund-shipping-only.json";
import refundedInFullUsd from "../../fixtures/orders/refunded-in-full-usd.json";
import refunded from "../../fixtures/orders/refunded.json";
import storeCreditTender from "../../fixtures/orders/store-credit-tender.json";
import taxExclusiveUsd from "../../fixtures/orders/tax-exclusive-usd.json";
import taxInclusiveGbp from "../../fixtures/orders/tax-inclusive-gbp.json";
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
    document: query === RewardsOrderFacts ? "order" : query === RewardsRefundFacts ? "refund" : "orders",
    variables: options?.variables,
  }));

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

    const manyTenders = clone(plain);
    manyTenders.data.order.transactions = Array.from({ length: 20 }, () => clone(plain.data.order.transactions[0]));
    await expect(createShopifyOrderSource(shopify(() => manyTenders)).readOrder("gid://shopify/Order/5001")).rejects.toThrow(
      /20 transactions/,
    );
  });
});

describe("readRefund (one refund, valued against its order's lines)", () => {
  it("reads the refund and then the order's lines", async () => {
    const client = fromFixtures([refunded], [refundItems, refundShippingOnly, refundMoneyOnly]);

    const answer = await createShopifyOrderSource(client).readRefund("gid://shopify/Refund/6151");

    expect(asked(client)).toEqual([
      { document: "refund", variables: { id: "gid://shopify/Refund/6151" } },
      { document: "order", variables: { id: "gid://shopify/Order/5011", after: null } },
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
