import type { Decimal } from "decimal.js";
import { Money, currencyDecimals, floorMoney } from "~/lib/money";
import type { MoneyPair, OrderFacts, RefundFacts } from "~/lib/order-facts";
import type { OrderSource, UpdatedOrder } from "~/lib/ports";
import { ShopifyTimeoutError, askShopify } from "./ask.server";
import {
  RewardsOrderFacts,
  RewardsOrderTransactions,
  RewardsOrderTransactionsCost,
  RewardsRefundFacts,
  RewardsRefundFactsCost,
  RewardsUpdatedOrders,
  type GraphqlClient,
} from "./graphql";

/**
 * The order source on Shopify (spec 6.1): what the engine needs to know about
 * an order, read from its line items, tenders and refunds, in exact decimals
 * and in both the buyer's and the shop's currency (rules 1, 4 and 7). The
 * tender sums are carried from apps/rewardspro/app/utils/transaction-analyzer.ts;
 * the product value replaces its "everything paid by card".
 *
 * Every read throws when Shopify can't be reached or its answer can't be
 * read, so a webhook answers an error and is delivered again; a read answers
 * null only when Shopify says there is no such order or refund.
 */

/**
 * How long one whole readOrder or readRefund waits for Shopify, every call in
 * it together (each call gets the time left), so a webhook that makes the read
 * still answers inside its 5 s. Each page of the sweep gets the same. A caller
 * can end a read sooner with its own deadline (OrderSource's `deadline`).
 */
export const ORDER_READ_DEADLINE_MS = 4500;
/**
 * The deadline a webhook gives every read it makes, from the moment it is
 * received (before its authentication, which may refresh the token): Shopify
 * waits 5 s for the answer, and the last second is for the database and the
 * answer itself. refunds/create reads the refund and may then read its order,
 * both within this one deadline.
 */
export const WEBHOOK_READ_DEADLINE_MS = 4000;
/** Pages of 100 line items read for one order before giving up. */
export const MAX_LINE_PAGES = 25;
/** Pages of 50 orders the sweep reads at most. */
export const MAX_RECENT_PAGES = 10;
/** The refunds RewardsUpdatedOrders lists for each order; a list this long may be cut short. */
const LISTED_REFUNDS = 15;
/**
 * RewardsOrderFacts reads 20 transactions and 20 refund ids, and
 * RewardsRefundFacts 20 transactions and 20 shipping lines. A full list may
 * have more behind it, and money read from part of a list would be wrong.
 */
const LIST_LIMIT = 20;
/** The transactions RewardsOrderTransactions reads when the order's first 20 came back full. */
const MAX_TRANSACTIONS = 200;
/**
 * The most requested query cost one read keeps in flight at once. Shopify
 * reserves each query's requested cost from the app's bucket (2,000 in the
 * fixtures) until it answers, and answers THROTTLED when the bucket can't
 * cover it; so at most two refunds (2 × 429) are read together, and the
 * 801-point tender follow-up alone.
 */
export const MAX_COST_IN_FLIGHT = 1000;

/** Shopify's answer, or the order in it, can't be read as order facts. */
export class OrderReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderReadError";
  }
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

function rec(value: unknown, what: string): Rec {
  const record = asRecord(value);
  if (!record) throw new OrderReadError(`Expected ${what} in Shopify's answer`);
  return record;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new OrderReadError(`Expected a list of ${what} in Shopify's answer`);
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") throw new OrderReadError(`Expected ${what} in Shopify's answer`);
  return value;
}

function flag(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") throw new OrderReadError(`Expected ${what} to be true or false`);
  return value;
}

function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new OrderReadError(`Expected ${what} to be a count`);
  return value;
}

function dateOf(value: unknown, what: string): Date {
  const date = new Date(text(value, what));
  if (Number.isNaN(date.getTime())) throw new OrderReadError(`Expected ${what} to be a date`);
  return date;
}

function currencyOf(value: unknown, what: string): string {
  const code = text(value, what);
  currencyDecimals(code);
  return code;
}

function amountOf(value: unknown, what: string): Decimal {
  if (typeof value === "string") {
    try {
      const amount = new Money(value);
      if (amount.isFinite()) return amount;
    } catch {
      // not a decimal: refused below
    }
  }
  throw new OrderReadError(`Expected ${what} to be an amount`);
}

/** A MoneyBag as a MoneyPair: presentmentMoney is the buyer's currency, shopMoney the shop's. */
function pairOf(bag: unknown, what: string): MoneyPair {
  const set = rec(bag, what);
  return {
    amount: amountOf(rec(set.presentmentMoney, what).amount, what),
    shopAmount: amountOf(rec(set.shopMoney, what).amount, what),
  };
}

const zero = (): MoneyPair => ({ amount: new Money(0), shopAmount: new Money(0) });
const plus = (a: MoneyPair, b: MoneyPair): MoneyPair => ({ amount: a.amount.plus(b.amount), shopAmount: a.shopAmount.plus(b.shopAmount) });
const minus = (a: MoneyPair, b: MoneyPair): MoneyPair => ({ amount: a.amount.minus(b.amount), shopAmount: a.shopAmount.minus(b.shopAmount) });
const sum = (pairs: MoneyPair[]): MoneyPair => pairs.reduce(plus, zero());

/** `value` × `quantity` / `of`, exactly. */
function shareOf(value: MoneyPair, quantity: number, of: number): MoneyPair {
  if (of === 0) return zero();
  return { amount: value.amount.times(quantity).div(of), shopAmount: value.shopAmount.times(quantity).div(of) };
}

/** Each side between 0 and its cap. */
function clamp(value: MoneyPair, cap: MoneyPair): MoneyPair {
  const one = (v: Decimal, c: Decimal) => Money.max(0, Money.min(v, c));
  return { amount: one(value.amount, cap.amount), shopAmount: one(value.shopAmount, cap.shopAmount) };
}

interface Currencies {
  currency: string;
  shopCurrency: string;
}

/** A pair whose amounts are not exact minor units (refund shares), rounded down to each currency's minor unit (rule 3). */
function floorPair(value: MoneyPair, c: Currencies): MoneyPair {
  return { amount: floorMoney(value.amount, c.currency), shopAmount: floorMoney(value.shopAmount, c.shopCurrency) };
}

interface Line {
  quantity: number;
  currentQuantity: number;
  /** originalTotal − Σ discountAllocations; zero for a gift-card line, which is no product (rule 1). */
  value: MoneyPair;
}

interface ParsedOrder extends Currencies {
  facts: Omit<OrderFacts, "productValue" | "refundedProductValue" | "refunds">;
  lines: Map<string, Line>;
  /** totalTipReceivedSet: the tips, which the lines hold and the product value leaves out (rule 1, Ruling 26). */
  tip: MoneyPair;
  /** Whether the order's prices include tax; null when the node doesn't say (the import's bulk node). */
  taxesIncluded: boolean | null;
}

const CUSTOMER_GID = /^gid:\/\/shopify\/Customer\/(\d+)$/;

/** Whether a tender's gateway is a gift card or store credit (carried from the transaction analyzer). */
function tenderOf(gateway: string): "gift_card" | "store_credit" | null {
  const name = gateway.toLowerCase();
  if (name.includes("gift_card")) return "gift_card";
  if (name.includes("store_credit") || name.includes("cashback") || name.includes("rewards")) return "store_credit";
  return null;
}

/**
 * Reads an order node in RewardsOrderFacts's shape, with every line in
 * `lineItems.nodes`. Throws OrderReadError when any part can't be read, or
 * when its shop money isn't in `shopCurrency`: amounts in the shop's old
 * currency must not be counted as its current one.
 */
function parseOrderNode(value: unknown, shopCurrency: string): ParsedOrder {
  const node = rec(value, "an order");
  currencyOf(shopCurrency, "the shop's currency");
  const orderShopCurrency = currencyOf(node.currencyCode, "the order's shop currency");
  if (orderShopCurrency !== shopCurrency) {
    throw new OrderReadError(`The order's shop money is in ${orderShopCurrency}, but the shop's currency is ${shopCurrency}`);
  }
  const currency = currencyOf(node.presentmentCurrencyCode, "the order's presentment currency");

  const lines = new Map<string, Line>();
  for (const item of list(rec(node.lineItems, "the order's line items").nodes, "line items")) {
    const line = rec(item, "a line item");
    const id = text(line.id, "a line item id");
    if (lines.has(id)) throw new OrderReadError(`The line ${id} appears twice in the order's lines`);
    const quantity = count(line.quantity, "a line's quantity");
    const currentQuantity = count(line.currentQuantity, "a line's current quantity");
    const totalSet = rec(line.originalTotalSet, "a line's original total");
    if (
      rec(totalSet.presentmentMoney, "a line's original total").currencyCode !== currency ||
      rec(totalSet.shopMoney, "a line's original total").currencyCode !== shopCurrency
    ) {
      throw new OrderReadError(`A line's currencies are not the order's (${currency}, ${shopCurrency})`);
    }
    const discounts = list(line.discountAllocations, "discount allocations").map((a) =>
      pairOf(rec(a, "a discount allocation").allocatedAmountSet, "a discount allocation"),
    );
    const value = minus(pairOf(totalSet, "a line's original total"), sum(discounts));
    lines.set(id, { quantity, currentQuantity, value: flag(line.isGiftCard, "isGiftCard") ? zero() : value });
  }

  let storeCreditUsed = zero();
  let giftCardUsed = zero();
  // When the order became paid: its latest successful SALE or CAPTURE (Ruling 43)
  let paidAt: Date | null = null;
  for (const item of list(node.transactions, "transactions")) {
    const tx = rec(item, "a transaction");
    if (tx.status !== "SUCCESS" || (tx.kind !== "SALE" && tx.kind !== "CAPTURE")) continue;
    // The import's bulk node reads no transaction times
    const processedAt = tx.processedAt === undefined || tx.processedAt === null ? null : dateOf(tx.processedAt, "a transaction's processedAt");
    if (processedAt && (paidAt === null || processedAt > paidAt)) paidAt = processedAt;
    const tender = tenderOf(text(tx.gateway, "a transaction's gateway"));
    if (tender === "gift_card") giftCardUsed = plus(giftCardUsed, pairOf(tx.amountSet, "a transaction's amount"));
    if (tender === "store_credit") storeCreditUsed = plus(storeCreditUsed, pairOf(tx.amountSet, "a transaction's amount"));
  }

  let externalCustomerId: string | null = null;
  if (node.customer !== null) {
    const gid = text(rec(node.customer, "the order's customer").id, "the customer id");
    const match = CUSTOMER_GID.exec(gid);
    if (!match) throw new OrderReadError("Expected a Shopify customer id");
    externalCustomerId = match[1];
  }

  return {
    currency,
    shopCurrency,
    lines,
    tip: pairOf(node.totalTipReceivedSet, "the order's tips"),
    taxesIncluded: node.taxesIncluded === undefined ? null : flag(node.taxesIncluded, "taxesIncluded"),
    facts: {
      externalOrderId: text(node.id, "the order id"),
      name: text(node.name, "the order's name"),
      externalCustomerId,
      currency,
      shopCurrency,
      test: flag(node.test, "test"),
      cancelledAt: node.cancelledAt === null ? null : dateOf(node.cancelledAt, "cancelledAt"),
      orderedAt: dateOf(node.createdAt, "createdAt"),
      paidAt: paidAt ?? (node.processedAt === null || node.processedAt === undefined ? dateOf(node.createdAt, "createdAt") : dateOf(node.processedAt, "processedAt")),
      // Display only, and nullable in the Admin schema
      financialStatus: node.displayFinancialStatus === null ? "UNKNOWN" : text(node.displayFinancialStatus, "the financial status"),
      total: pairOf(node.totalPriceSet, "the order's total"),
      storeCreditUsed,
      giftCardUsed,
    },
  };
}

/** Throws when a list Shopify gave is as long as the most it was asked for (`limit`): there may be more. */
function ensureWhole(items: unknown[], limit: number, what: string): void {
  if (items.length >= limit) throw new OrderReadError(`Shopify gave ${limit} ${what}, the most one read takes; there may be more`);
}

/**
 * What one refunded shipping line returned in money: its subtotal, plus its
 * tax when the order's prices exclude tax (Ruling 11). The refund's money
 * includes that tax on such a shop, so a shipping-only refund takes nothing
 * back.
 */
function shippingRefunded(item: unknown, order: ParsedOrder): MoneyPair {
  const line = rec(item, "a refund shipping line");
  const subtotal = pairOf(line.subtotalAmountSet, "a refunded shipping line");
  if (order.taxesIncluded === null) throw new OrderReadError("Expected whether the order's prices include tax");
  return order.taxesIncluded ? subtotal : plus(subtotal, pairOf(line.taxAmountSet, "a refunded shipping line's tax"));
}

/** The order's lines one refund returned, with the units of each; throws on more than 100, or on a line the order doesn't have. */
function refundLinesOf(refund: Rec, order: ParsedOrder): Array<{ line: Line; quantity: number }> {
  const lineItems = rec(refund.refundLineItems, "a refund's line items");
  if (rec(lineItems.pageInfo, "a refund's line items").hasNextPage !== false) {
    throw new OrderReadError("A refund returned more than 100 lines, the most one read takes");
  }
  return list(lineItems.nodes, "refund line items").map((item) => {
    const refundLine = rec(item, "a refund line");
    const id = text(rec(refundLine.lineItem, "a refund line's line item").id, "a refund line's line item id");
    const line = order.lines.get(id);
    if (!line) throw new OrderReadError("A refund returned a line the order doesn't have");
    return { line, quantity: count(refundLine.quantity, "a refund line's quantity") };
  });
}

/**
 * The product value one refund returned (rule 7), rounded down to the minor
 * unit: its items at their discounted price, or, with no items, its
 * successful money less the shipping it refunded. Either is capped at the
 * product value not yet refunded (`left`, Ruling 20) and never below 0. The
 * refund that completes the order (refundsOf decides it by units) is valued
 * at exactly `left`, so the order's refunds add up to its product value
 * (Ruling 34).
 */
function refundValue(
  refund: Rec,
  order: ParsedOrder,
  items: Array<{ line: Line; quantity: number }>,
  left: MoneyPair,
  completesOrder: boolean,
): RefundFacts {
  const facts = { externalRefundId: text(refund.id, "the refund id"), refundedAt: dateOf(refund.createdAt, "the refund's createdAt"), completesOrder };
  if (completesOrder) return { ...facts, productValue: clamp(left, left) };
  let value: MoneyPair;
  if (items.length > 0) {
    value = clamp(sum(items.map(({ line, quantity }) => shareOf(line.value, quantity, line.quantity))), left);
  } else {
    const transactions = list(rec(refund.transactions, "a refund's transactions").nodes, "refund transactions");
    const shippingLines = list(rec(refund.refundShippingLines, "a refund's shipping lines").nodes, "refund shipping lines");
    ensureWhole(transactions, LIST_LIMIT, "refund transactions");
    ensureWhole(shippingLines, LIST_LIMIT, "refund shipping lines");
    const money = sum(
      transactions
        .map((item) => rec(item, "a refund transaction"))
        .filter((tx) => tx.kind === "REFUND" && tx.status === "SUCCESS")
        .map((tx) => pairOf(tx.amountSet, "a refund transaction's amount")),
    );
    const shipping = sum(shippingLines.map((item) => shippingRefunded(item, order)));
    value = clamp(minus(money, shipping), left);
  }
  return { ...facts, productValue: floorPair(value, order) };
}

/**
 * The units order edits removed from each line: quantity − currentQuantity −
 * its units in the refunds' line items, never below 0. Shopify's quantity
 * (and the discounts on it) still counts refunded and removed units, and
 * currentQuantity counts neither.
 */
function removedUnits(order: ParsedOrder, refundNodes: Rec[]): Map<Line, number> {
  const refundedUnits = new Map<Line, number>();
  for (const node of refundNodes) {
    for (const { line, quantity } of refundLinesOf(node, order)) refundedUnits.set(line, (refundedUnits.get(line) ?? 0) + quantity);
  }
  return new Map(
    [...order.lines.values()].map((line) => [line, Math.max(0, line.quantity - line.currentQuantity - (refundedUnits.get(line) ?? 0))]),
  );
}

/** Refund GIDs in numeric order (a shorter number is a smaller one), so the order never depends on how they were read. */
function byId(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Every refund of the order, oldest first and by id within the same moment,
 * each capped by the product value (`productValue`) less the ones before it.
 * readOrder and readRefund get the refunds in different orders, and must give
 * each the same value.
 *
 * A refund of items completes the order when, after it, every line with a
 * value has had all its units refunded or removed by an edit (Ruling 34);
 * lines worth nothing (gift cards) don't count. That refund is valued at what
 * is left, so the refunds sum to the product value however their shares were
 * rounded down.
 */
function refundsOf(order: ParsedOrder, productValue: MoneyPair, refundNodes: Rec[]): RefundFacts[] {
  const dated = refundNodes.map((node) => ({
    node,
    id: text(node.id, "the refund id"),
    at: dateOf(node.createdAt, "the refund's createdAt").getTime(),
  }));
  dated.sort((a, b) => a.at - b.at || byId(a.id, b.id));
  const removed = removedUnits(order, refundNodes);
  const valued = [...order.lines.values()].filter((line) => line.value.amount.gt(0) || line.value.shopAmount.gt(0));
  const returned = new Map<Line, number>();
  let refunded = zero();
  return dated.map(({ node }) => {
    const items = refundLinesOf(node, order);
    for (const { line, quantity } of items) returned.set(line, (returned.get(line) ?? 0) + quantity);
    const completesOrder =
      items.length > 0 &&
      valued.length > 0 &&
      valued.every((line) => (removed.get(line) ?? 0) + (returned.get(line) ?? 0) >= line.quantity);
    const refund = refundValue(node, order, items, minus(productValue, refunded), completesOrder);
    refunded = plus(refunded, refund.productValue);
    return refund;
  });
}

/** Each side less the tips, never below 0 (Ruling 26). */
function withoutTip(value: MoneyPair, tip: MoneyPair): MoneyPair {
  return {
    amount: Money.max(0, value.amount.minus(tip.amount)),
    shopAmount: Money.max(0, value.shopAmount.minus(tip.shopAmount)),
  };
}

/**
 * What the buyer bought (rule 1, Ruling 25), on a read that has the order's
 * refunds: every line's value, less the units order edits removed from it, at
 * the line's discounted unit value and rounded down as a refund's share is,
 * then less the tips, never below 0 (removedUnits).
 */
function boughtValue(order: ParsedOrder, refundNodes: Rec[]): MoneyPair {
  const units = removedUnits(order, refundNodes);
  const lines = [...order.lines.values()];
  const removed = sum(lines.map((line) => shareOf(line.value, units.get(line) ?? 0, line.quantity)));
  return withoutTip(minus(sum(lines.map((line) => line.value)), floorPair(removed, order)), order.tip);
}

/**
 * Where an order node's refunded product value comes from (Ruling 25), said
 * by the caller, never guessed from an empty list:
 * - `{ refunds }`: the live read. The order's refunds, each a node in
 *   RewardsRefundFacts's shape (an order with none passes []). The product value
 *   leaves out the units order edits removed, and the refunded product value
 *   is the sum of the refunds.
 * - `"quantities"`: the import's bulk node, which has no refunds. Every unit
 *   no longer on the order (quantity − currentQuantity) is valued as
 *   refunded, rounded down, whether a refund or an edit took it off; the
 *   product value counts every unit, less the tips. The node can't see a
 *   refund of money with no items.
 */
export type RefundedFrom = { refunds: unknown[] } | "quantities";

function factsFrom(order: ParsedOrder, refunded: RefundedFrom): OrderFacts {
  const lines = [...order.lines.values()];
  if (refunded === "quantities") {
    return {
      ...order.facts,
      productValue: withoutTip(sum(lines.map((line) => line.value)), order.tip),
      refundedProductValue: floorPair(
        sum(lines.map((line) => shareOf(line.value, Math.max(0, line.quantity - line.currentQuantity), line.quantity))),
        order,
      ),
      refunds: [],
    };
  }
  const nodes = refunded.refunds.map((node) => rec(node, "a refund"));
  const productValue = boughtValue(order, nodes);
  const refunds = refundsOf(order, productValue, nodes);
  return { ...order.facts, productValue, refundedProductValue: sum(refunds.map((refund) => refund.productValue)), refunds };
}

/**
 * An order's facts from one order node in RewardsOrderFacts's shape, with
 * every line in `lineItems.nodes`. Pure: the live read passes the query's
 * `shop.currencyCode` and the order's refund nodes; the import passes the
 * connection's currency and "quantities" (see RefundedFrom). Throws
 * OrderReadError when the node can't be read.
 */
export function factsFromOrderNode(node: unknown, shopCurrency: string, refunded: RefundedFrom): OrderFacts {
  return factsFrom(parseOrderNode(node, shopCurrency), refunded);
}

function firstErrorMessage(errors: unknown): string {
  const all = Array.isArray(errors) ? errors : asRecord(errors)?.graphQLErrors;
  const message = Array.isArray(all) ? asRecord(all[0])?.message : undefined;
  return typeof message === "string" ? message : "unknown error";
}

type Ask = (query: string, variables: Record<string, unknown>) => Promise<Rec>;

/** Runs `call` once the calls in flight leave room for `cost`. */
type InTurn = <T>(cost: number, call: () => Promise<T>) => Promise<T>;

/**
 * Calls taken in the order they came, each started once the requested cost
 * of those in flight plus its own is at most MAX_COST_IN_FLIGHT. Once one
 * call has failed, the read has failed: the calls still waiting are not sent
 * and reject with the same error.
 */
function oneBucket(): InTurn {
  let inFlight = 0;
  let failure: { error: unknown } | null = null;
  const waiting: Array<{ cost: number; start: () => void }> = [];
  const next = () => {
    while (waiting.length > 0 && (inFlight === 0 || inFlight + waiting[0].cost <= MAX_COST_IN_FLIGHT)) {
      const turn = waiting.shift();
      if (turn) turn.start();
    }
  };
  return (cost, call) =>
    new Promise((resolve, reject) => {
      waiting.push({
        cost,
        start: () => {
          if (failure) return reject(failure.error);
          inFlight += cost;
          call().then(
            (value) => {
              inFlight -= cost;
              resolve(value);
              next();
            },
            (error: unknown) => {
              inFlight -= cost;
              failure ??= { error };
              reject(error);
              next();
            },
          );
        },
      });
      next();
    });
}

export function createShopifyOrderSource(admin: GraphqlClient): OrderSource {
  /**
   * A reader whose calls all end by one deadline, ORDER_READ_DEADLINE_MS from
   * now or the caller's `given` deadline (a Date.now() time) if that comes
   * sooner: each call waits only the time left. Each answer's `data`; throws
   * on GraphQL errors, an answer that can't be read, or no time left.
   */
  function askWithin(given?: number): Ask {
    const start = Date.now();
    const deadline = Math.min(start + ORDER_READ_DEADLINE_MS, given ?? Number.POSITIVE_INFINITY);
    return async (query, variables) => {
      const left = deadline - Date.now();
      if (left <= 0) throw new ShopifyTimeoutError(Math.max(0, deadline - start));
      const body = asRecord(await askShopify(admin, query, variables, left));
      if (body?.errors) throw new OrderReadError(`Shopify answered with errors: ${firstErrorMessage(body.errors)}`);
      return rec(body?.data, "data");
    };
  }

  /** The order with every page of its lines, and the shop's currency; null when Shopify has no such order. */
  async function orderNode(ask: Ask, orderGid: string): Promise<{ node: Rec; shopCurrency: string } | null> {
    let data = await ask(RewardsOrderFacts, { id: orderGid, after: null });
    if (data.order === null) return null;
    const first = rec(data.order, "the order");
    const shopCurrency = text(rec(data.shop, "the shop").currencyCode, "the shop's currency");
    const nodes: unknown[] = [];
    for (let pages = 1; ; pages++) {
      const lineItems = rec(rec(data.order, "the order").lineItems, "the order's line items");
      nodes.push(...list(lineItems.nodes, "line items"));
      const pageInfo = rec(lineItems.pageInfo, "the line items' page info");
      if (pageInfo.hasNextPage === false) break;
      if (pages >= MAX_LINE_PAGES) throw new OrderReadError(`The order has more lines than ${MAX_LINE_PAGES} pages of 100`);
      data = await ask(RewardsOrderFacts, { id: orderGid, after: text(pageInfo.endCursor, "the line items' cursor") });
      if (data.order === null) throw new OrderReadError("The order went away while its lines were read");
    }
    return { node: { ...first, lineItems: { nodes } }, shopCurrency };
  }

  /**
   * The order's tenders, all of them: when its first 20 came back full they
   * are read again, up to MAX_TRANSACTIONS, and it throws only if those are
   * full too.
   */
  async function transactionsOf(ask: Ask, inTurn: InTurn, orderGid: string, node: Rec): Promise<unknown[]> {
    const first = list(node.transactions, "transactions");
    if (first.length < LIST_LIMIT) return first;
    const data = await inTurn(RewardsOrderTransactionsCost, () => ask(RewardsOrderTransactions, { id: orderGid }));
    if (data.order === null) throw new OrderReadError("The order went away while its tenders were read");
    const all = list(rec(data.order, "the order").transactions, "transactions");
    ensureWhole(all, MAX_TRANSACTIONS, "transactions");
    return all;
  }

  async function refundNode(ask: Ask, refundGid: string, inTurn?: InTurn): Promise<Rec | null> {
    const call = () => ask(RewardsRefundFacts, { id: refundGid });
    const data = await (inTurn ? inTurn(RewardsRefundFactsCost, call) : call());
    return data.refund === null ? null : rec(data.refund, "the refund");
  }

  /** The order's refund ids (all of them: throws when the list may be cut short). */
  function refundIds(node: Rec): string[] {
    const refunds = list(node.refunds, "refunds");
    ensureWhole(refunds, LIST_LIMIT, "refunds");
    return refunds.map((r) => text(rec(r, "a refund").id, "a refund id"));
  }

  /** The refunds, read as many at a time as MAX_COST_IN_FLIGHT allows. */
  function refundNodes(ask: Ask, inTurn: InTurn, ids: string[]): Promise<Rec[]> {
    return Promise.all(
      ids.map(async (id) => {
        const node = await refundNode(ask, id, inTurn);
        if (!node) throw new OrderReadError("A refund on the order could not be read");
        return node;
      }),
    );
  }

  return {
    /**
     * The lines (every page), then any further tenders and the refunds, as
     * many together as MAX_COST_IN_FLIGHT allows, then the facts; all within
     * one deadline.
     */
    async readOrder(orderGid, o = {}) {
      const ask = askWithin(o.deadline);
      const read = await orderNode(ask, orderGid);
      if (!read) return null;
      // Before any call is sent: a throw here must not leave one unawaited
      const ids = refundIds(read.node);
      const inTurn = oneBucket();
      const [transactions, refundNodesRead] = await Promise.all([
        transactionsOf(ask, inTurn, orderGid, read.node),
        refundNodes(ask, inTurn, ids),
      ]);
      return factsFromOrderNode({ ...read.node, transactions }, read.shopCurrency, { refunds: refundNodesRead });
    },

    /**
     * The refund, then its order's lines so its items can be valued, then the
     * order's other refunds: every refund is capped by the product value not
     * yet refunded, so it is valued exactly as readOrder values it. All
     * within one deadline.
     */
    async readRefund(refundGid, o = {}) {
      const ask = askWithin(o.deadline);
      const refund = await refundNode(ask, refundGid);
      if (!refund) return null;
      const orderGid = text(rec(refund.order, "the refund's order").id, "the refund's order id");
      const read = await orderNode(ask, orderGid);
      if (!read) throw new OrderReadError("The refund's order could not be read");
      const order = parseOrderNode(read.node, read.shopCurrency);
      const others = await refundNodes(ask, oneBucket(), refundIds(read.node).filter((id) => id !== refundGid));
      const all = [...others, refund];
      const valued = refundsOf(order, boughtValue(order, all), all).find((r) => r.externalRefundId === refundGid);
      if (!valued) throw new OrderReadError("The refund could not be valued");
      return { orderGid, refund: valued };
    },

    /**
     * Most recently updated first, at most MAX_RECENT_PAGES pages of 50, so a
     * busy shop's newest changes are found first. When there are more, the
     * older ones are not read, and a warning (with no buyer data) says so.
     * Each page ends by the caller's deadline too.
     */
    async recentlyUpdatedOrders(since, o = {}) {
      const query = `updated_at:>='${since.toISOString()}' AND (financial_status:paid OR financial_status:partially_refunded OR financial_status:refunded)`;
      const found: UpdatedOrder[] = [];
      let after: string | null = null;
      for (let page = 1; ; page++) {
        const orders = rec((await askWithin(o.deadline)(RewardsUpdatedOrders, { query, after })).orders, "orders");
        for (const item of list(orders.nodes, "orders")) {
          const node = rec(item, "an order");
          if (node.customer !== null) rec(node.customer, "an order's customer");
          const refunds = list(node.refunds, "an order's refunds").map((r) => {
            const refund = rec(r, "a refund");
            return { refundGid: text(refund.id, "a refund id"), refundedAt: dateOf(refund.createdAt, "a refund's createdAt") };
          });
          found.push({
            orderGid: text(node.id, "an order id"),
            hasCustomer: node.customer !== null,
            test: flag(node.test, "test"),
            orderedAt: dateOf(node.createdAt, "createdAt"),
            cancelledAt: node.cancelledAt === null ? null : dateOf(node.cancelledAt, "cancelledAt"),
            refunds: refunds.length >= LISTED_REFUNDS ? null : refunds,
          });
        }
        const pageInfo = rec(orders.pageInfo, "the orders' page info");
        if (pageInfo.hasNextPage === false) break;
        if (page >= MAX_RECENT_PAGES) {
          console.warn(
            `[order-source] The sweep read ${found.length} orders updated since ${since.toISOString()}, the most it reads; older ones were not read`,
          );
          break;
        }
        after = text(pageInfo.endCursor, "the orders' cursor");
      }
      return found;
    },
  };
}
