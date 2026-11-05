import { Prisma, type LedgerEntryKind, type LookReason, type PayoutDirection, type PayoutState } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * Orders and the needs-a-look answers (spec 4.6, rule 12): the list's pages,
 * statuses and needs-a-look filter, the order panel's ledger entries,
 * payouts and refunds (a take-back's shortfall in words), each answer moving
 * the payout as answerNeedsLook (A11) says, and 404 for another merchant's
 * order. The admin session is the library's job (requireMerchant), so it is
 * replaced here by the store's connection and a stand-in Admin API client
 * that answers RewardsCustomerNames.
 */

vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));

const SHOP = "orders-page.myshopify.com";
const OTHER_SHOP = "other-orders-page.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;

type Person = { firstName?: string; lastName?: string; email?: string };

/** RewardsCustomerNames from `people` (by numeric id); each node also carries an email, which the pages must never show. */
function fakeAdmin(people: Record<string, Person> = {}): GraphqlClient {
  return {
    async graphql(query, options) {
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
      if (operation !== "RewardsCustomerNames") throw new Error(`The test answers no ${operation}`);
      const ids = (options?.variables?.ids ?? []) as string[];
      const nodes = ids.map((gid) => {
        const person = people[gid.split("/").pop()!];
        return person ? { id: gid, firstName: person.firstName ?? null, lastName: person.lastName ?? null, email: person.email ?? null } : null;
      });
      return { json: async () => ({ data: { nodes } }) };
    },
  };
}

type ListRoute = typeof import("~/routes/app.orders._index");
type PanelRoute = typeof import("~/routes/app.orders.$id");
let listRoute: ListRoute;
let panelRoute: PanelRoute;
let requireMerchant: ReturnType<typeof vi.fn>;

async function signIn(admin: GraphqlClient, shop = SHOP) {
  const signedIn = (await findConnection(shop))!;
  requireMerchant.mockResolvedValue({ admin, session: { shop }, conn: signedIn });
}

type ListData = Exclude<Awaited<ReturnType<ListRoute["loader"]>>, Response>;
type PanelData = Exclude<Awaited<ReturnType<PanelRoute["loader"]>>, Response>;

async function loadList(search: string, admin: GraphqlClient = fakeAdmin()): Promise<ListData> {
  await signIn(admin);
  const request = new Request(`https://test.example.com/app/orders${search}`);
  return (await listRoute.loader({ request, params: {}, context: {} } as never)) as ListData;
}

async function loadPanel(id: string, admin: GraphqlClient = fakeAdmin()): Promise<PanelData> {
  await signIn(admin);
  const request = new Request(`https://test.example.com/app/orders/${id}`);
  return (await panelRoute.loader({ request, params: { id }, context: {} } as never)) as PanelData;
}

async function answer(orderId: string, fields: Record<string, string>) {
  await signIn(fakeAdmin());
  const request = new Request(`https://test.example.com/app/orders/${orderId}`, { method: "POST", body: new URLSearchParams(fields) });
  const result = await panelRoute.action({ request, params: { id: orderId }, context: {} } as never);
  // A 400 comes back wrapped by data()
  if (result && typeof result === "object" && "type" in result && (result as { type: string }).type === "DataWithResponseInit") {
    const wrapped = result as unknown as { data: { ok: boolean; error?: string }; init: { status?: number } };
    return { ...wrapped.data, status: wrapped.init.status };
  }
  return result as { ok: boolean; error?: string };
}

/** What a thrown loader or action Response says, or the error itself. */
async function thrown(promise: Promise<unknown>): Promise<{ status: number } | unknown> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Response ? { status: error.status } : error;
  }
  throw new Error("expected it to throw");
}

let conn: ConnectionContext;

let buyerNumber = 0;
const addBuyer = (o: { c?: ConnectionContext; externalId?: string | null } = {}) => {
  const c = o.c ?? conn;
  buyerNumber++;
  return prisma.customer.create({
    data: {
      merchantId: c.merchantId,
      connectionId: c.connectionId,
      externalCustomerId: o.externalId === undefined ? String(6000 + buyerNumber) : o.externalId,
    },
    select: { id: true, externalCustomerId: true },
  });
};

let orderNumber = 0;

/** An order of `amount` of products in GBP, `daysAgo` days ago. */
async function addOrder(
  customerId: string,
  amount: string,
  daysAgo: number,
  o: {
    c?: ConnectionContext;
    total?: string;
    test?: boolean;
    cancelled?: boolean;
    source?: "live" | "import";
    reason?: "import" | "before_install" | "test" | "cancelled" | "off" | "no_tier" | "nothing_to_pay_on" | null;
    storeCredit?: string;
    importRefundIds?: string[];
  } = {},
) {
  const c = o.c ?? conn;
  orderNumber++;
  const at = new Date(Date.now() - daysAgo * DAY);
  return prisma.order.create({
    data: {
      merchantId: c.merchantId,
      connectionId: c.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${5000 + orderNumber}`,
      name: `#${5000 + orderNumber}`,
      source: o.source ?? "live",
      currency: "GBP",
      totalAmount: o.total ?? amount,
      productAmount: amount,
      shopProductAmount: amount,
      storeCreditUsed: o.storeCredit ?? "0",
      shopStoreCreditUsed: o.storeCredit ?? "0",
      giftCardUsed: "0",
      cashbackBase: new Prisma.Decimal(amount).minus(o.storeCredit ?? "0"),
      orderedAt: at,
      paidAt: at,
      cancelledAt: o.cancelled ? at : null,
      test: o.test ?? false,
      noCashbackReason: o.reason === undefined ? (o.source === "import" ? "import" : null) : o.reason,
      importRefundIds: o.importRefundIds ?? [],
    },
    select: { id: true, name: true, customerId: true },
  });
}

let entryNumber = 0;

async function addEntry(
  order: { id: string; customerId: string },
  o: { kind: LedgerEntryKind; amount: string; refundId?: string; createdAt?: Date; tierName?: string; rate?: string; key?: string; c?: ConnectionContext },
) {
  const c = o.c ?? conn;
  entryNumber++;
  return prisma.ledgerEntry.create({
    data: {
      merchantId: c.merchantId,
      connectionId: c.connectionId,
      customerId: order.customerId,
      orderId: order.id,
      refundId: o.refundId ?? null,
      kind: o.kind,
      amount: o.amount,
      currency: "GBP",
      shopAmount: o.amount,
      tierName: o.tierName ?? "Bronze",
      ratePercent: o.rate ?? "5",
      idempotencyKey: o.key ?? `${o.kind}:${entryNumber}`,
      createdAt: o.createdAt ?? new Date(Date.now() - DAY + entryNumber * 60_000),
    },
    select: { id: true, customerId: true, amount: true },
  });
}

async function addPayout(
  entry: { id: string; customerId: string; amount: { toString(): string } },
  state: PayoutState,
  o: {
    direction?: PayoutDirection;
    lookReason?: LookReason;
    debitedAmount?: string;
    shortfall?: string;
    attempts?: number;
    firstFailedAt?: Date;
    unconfirmedAt?: Date;
    claimedAt?: Date;
    sentAt?: Date;
    lastError?: string;
    c?: ConnectionContext;
  } = {},
) {
  const c = o.c ?? conn;
  return prisma.payout.create({
    data: {
      merchantId: c.merchantId,
      ledgerEntryId: entry.id,
      customerId: entry.customerId,
      rail: "shopify_store_credit",
      direction: o.direction ?? "credit",
      amount: state === "nothing_to_send" ? "0" : entry.amount.toString().replace("-", ""),
      currency: "GBP",
      state,
      lookReason: o.lookReason ?? null,
      attempts: o.attempts ?? 0,
      firstFailedAt: o.firstFailedAt ?? null,
      debitedAmount: o.debitedAmount ?? null,
      shortfall: o.shortfall ?? null,
      unconfirmedAt: o.unconfirmedAt ?? null,
      claimedAt: o.claimedAt ?? null,
      sentAt: o.sentAt ?? (state === "sent" ? new Date(Date.now() - DAY) : null),
      lastError: o.lastError ?? null,
      nextAttemptAt: new Date(Date.now() + DAY),
    },
    select: { id: true },
  });
}

let refundNumber = 0;
const addRefund = (order: { id: string }, amount: string, o: { externalId?: string; daysAgo?: number } = {}) => {
  refundNumber++;
  return prisma.refund.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      orderId: order.id,
      externalRefundId: o.externalId ?? `gid://shopify/Refund/${9000 + refundNumber}`,
      productAmount: amount,
      shopProductAmount: amount,
      refundedAt: new Date(Date.now() - (o.daysAgo ?? 1) * DAY),
    },
    select: { id: true },
  });
};

/** An order whose cashback credit of `amount` is in `state`. */
async function orderWithCredit(state: PayoutState, more: Parameters<typeof addPayout>[2] = {}, amount = "1.00") {
  const buyer = await addBuyer();
  const order = await addOrder(buyer.id, "20.00", 3);
  const entry = await addEntry(order, { kind: "cashback", amount });
  const credit = await addPayout(entry, state, more);
  return { buyer, order, entry, credit };
}

describe.skipIf(!hasTestDatabase)("Orders", () => {
  beforeEach(async () => {
    await resetDatabase();
    await ensureMerchant({ shop: SHOP, name: "Orders Page", currency: "GBP", timezone: "Europe/London", now: new Date("2025-01-01T00:00:00Z") });
    conn = (await findConnection(SHOP))!;
    if (!listRoute) {
      listRoute = await import("~/routes/app.orders._index");
      panelRoute = await import("~/routes/app.orders.$id");
      ({ requireMerchant } = (await import("~/admin/require-merchant.server")) as unknown as { requireMerchant: ReturnType<typeof vi.fn> });
    }
  });

  afterEach(async () => {
    await flushWaitUntil();
    requireMerchant?.mockReset();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the list", () => {
    it("shows each order's buyer, tier, total, cashback and rate, and status, newest first", async () => {
      const ann = await addBuyer();
      const people = { [ann.externalCustomerId!]: { firstName: "Ann", lastName: "Smith", email: "ann@example.com" } };
      const issued = await addOrder(ann.id, "100.00", 9, { total: "105.00" });
      await addPayout(await addEntry(issued, { kind: "cashback", amount: "7.00", tierName: "Silver", rate: "7" }), "sent");
      const waiting = await addOrder(ann.id, "40.00", 8);
      await addPayout(await addEntry(waiting, { kind: "cashback", amount: "2.00" }), "pending");
      const takenBack = await addOrder(ann.id, "20.00", 7);
      const tbEntry = await addEntry(takenBack, { kind: "cashback", amount: "1.00" });
      await addPayout(tbEntry, "sent");
      await addPayout(await addEntry(takenBack, { kind: "reversal", amount: "-1.00" }), "sent", { direction: "debit", debitedAmount: "1.00", shortfall: "0" });
      const look = await addOrder(ann.id, "60.00", 6);
      await addPayout(await addEntry(look, { kind: "cashback", amount: "3.00" }), "needs_look", { lookReason: "refused", lastError: "ACCOUNT_LIMIT" });
      const off = await addOrder(ann.id, "30.00", 5, { reason: "off" });
      const test = await addOrder(ann.id, "30.00", 4, { test: true, reason: "test" });
      const imported = await addOrder(ann.id, "30.00", 300, { source: "import" });
      // An erased buyer's order stays, with no one to name
      const erased = await addBuyer({ externalId: null });
      const theirs = await addOrder(erased.id, "10.00", 2, { reason: "nothing_to_pay_on" });
      // Another store's order is not listed
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection(OTHER_SHOP))!;
      await addOrder((await addBuyer({ c: other })).id, "10.00", 1, { c: other, reason: "off" });

      const page = await loadList("", fakeAdmin(people));

      expect(page).toMatchObject({ page: 1, hasNext: false, hasPrevious: false, needsLookOnly: false, needsLook: 1 });
      expect(page.rows).toEqual([
        { id: theirs.id, name: theirs.name, buyer: "Erased buyer", customerId: null, tierName: null, ratePercent: null, total: "£10.00", cashback: null, status: "No cashback", detail: "Nothing to pay on" },
        { id: test.id, name: test.name, buyer: "Ann Smith", customerId: ann.id, tierName: null, ratePercent: null, total: "£30.00", cashback: null, status: "No cashback", detail: "Test order" },
        { id: off.id, name: off.name, buyer: "Ann Smith", customerId: ann.id, tierName: null, ratePercent: null, total: "£30.00", cashback: null, status: "No cashback", detail: "Cashback was off" },
        { id: look.id, name: look.name, buyer: "Ann Smith", customerId: ann.id, tierName: "Bronze", ratePercent: "5", total: "£60.00", cashback: "£3.00", status: "Needs a look", detail: "Shopify refused it." },
        { id: takenBack.id, name: takenBack.name, buyer: "Ann Smith", customerId: ann.id, tierName: "Bronze", ratePercent: "5", total: "£20.00", cashback: "£1.00", status: "Taken back", detail: null },
        { id: waiting.id, name: waiting.name, buyer: "Ann Smith", customerId: ann.id, tierName: "Bronze", ratePercent: "5", total: "£40.00", cashback: "£2.00", status: "Waiting", detail: null },
        { id: issued.id, name: issued.name, buyer: "Ann Smith", customerId: ann.id, tierName: "Silver", ratePercent: "7", total: "£105.00", cashback: "£7.00", status: "Issued", detail: null },
        { id: imported.id, name: imported.name, buyer: "Ann Smith", customerId: ann.id, tierName: null, ratePercent: null, total: "£30.00", cashback: null, status: "No cashback", detail: "From before install" },
      ]);
      expect(JSON.stringify(page)).not.toContain("ann@example.com");
    });

    it("holds 50 orders a page", async () => {
      const buyer = await addBuyer();
      const orders = [];
      for (let i = 0; i < 52; i++) orders.push(await addOrder(buyer.id, "10.00", 60 - i, { reason: "off" }));
      const newestFirst = [...orders].reverse().map((order) => order.id);

      const first = await loadList("");
      expect(first.rows.map((row) => row.id)).toEqual(newestFirst.slice(0, 50));
      expect(first).toMatchObject({ hasNext: true, hasPrevious: false });

      const second = await loadList("?page=2");
      expect(second.rows.map((row) => row.id)).toEqual(newestFirst.slice(50));
      expect(second).toMatchObject({ page: 2, hasNext: false, hasPrevious: true });
      expect((await loadList("?page=nonsense")).page).toBe(1);
    });

    it("shows only the orders that need a look when asked", async () => {
      const credit = await orderWithCredit("needs_look", { lookReason: "kept_failing" });
      await orderWithCredit("sent");
      // A take-back that needs a look on an order whose credit went out
      const debited = await orderWithCredit("sent");
      await addPayout(await addEntry(debited.order, { kind: "reversal", amount: "-0.50" }), "needs_look", { direction: "debit", lookReason: "could_not_confirm" });

      const page = await loadList("?look=1");

      expect(page).toMatchObject({ needsLookOnly: true, needsLook: 2 });
      expect(page.rows.map((row) => row.id).sort()).toEqual([credit.order.id, debited.order.id].sort());
      expect(page.rows.map((row) => row.status)).toEqual(["Needs a look", "Needs a look"]);
    });
  });

  describe("the order panel", () => {
    it("shows the order, its ledger entries, payouts and refunds, with a shortfall in words", async () => {
      const ann = await addBuyer();
      const people = { [ann.externalCustomerId!]: { firstName: "Ann", email: "ann@example.com" } };
      const order = await addOrder(ann.id, "50.00", 10, { total: "55.00", storeCredit: "10.00" });
      const cashback = await addEntry(order, { kind: "cashback", amount: "2.00", tierName: "Silver", rate: "5" });
      await addPayout(cashback, "sent");
      const refund = await addRefund(order, "20.00", { daysAgo: 5 });
      const short = await addEntry(order, { kind: "reversal", amount: "-1.00", refundId: refund.id });
      const shortPayout = await addPayout(short, "sent", { direction: "debit", debitedAmount: "0.40", shortfall: "0.60" });
      await addEntry(order, { kind: "adjustment", amount: "0.60", key: `shortfall:${shortPayout.id}` });
      // Taken back by an amount Shopify never told (A11-F4)
      const second = await addRefund(order, "5.00", { daysAgo: 4 });
      const unknown = await addEntry(order, { kind: "reversal", amount: "-0.25", refundId: second.id });
      await addPayout(unknown, "sent", { direction: "debit" });

      const page = await loadPanel(order.id, fakeAdmin(people));

      expect(page).toMatchObject({
        id: order.id,
        name: order.name,
        buyer: "Ann",
        customerId: ann.id,
        buyerAdminUrl: `shopify://admin/customers/${ann.externalCustomerId}`,
        processed: expect.any(String),
        total: "£55.00",
        productValue: "£50.00",
        storeCreditUsed: "£10.00",
        cashbackBase: "£40.00",
        status: { label: "Issued", detail: "Part of it couldn't be taken back: the buyer had spent it" },
        notes: [],
      });
      expect(page.entries.map(({ label, amount, status, detail }) => ({ label, amount, status, detail }))).toEqual([
        { label: "Taken back for a refund", amount: "-£0.25", status: "Taken back", detail: "Amount taken back: unknown" },
        { label: "Not taken back: the buyer had spent it", amount: "£0.60", status: null, detail: null },
        { label: "Taken back for a refund", amount: "-£1.00", status: "Taken back", detail: "Took back £0.40 of £1.00; the buyer had spent the rest" },
        { label: "Cashback", amount: "£2.00", status: "Issued", detail: null },
      ]);
      expect(page.entries.at(-1)).toMatchObject({ tierName: "Silver", ratePercent: "5" });
      expect(page.payouts.map(({ what, amount, state, sent, look }) => ({ what, amount, state, sent, look }))).toEqual([
        { what: "Take-back", amount: "£0.25", state: "Sent", sent: expect.stringMatching(/\d{4}$/), look: null },
        { what: "Take-back", amount: "£1.00", state: "Sent", sent: expect.stringMatching(/\d{4}$/), look: null },
        { what: "Store credit", amount: "£2.00", state: "Sent", sent: expect.stringMatching(/\d{4}$/), look: null },
      ]);
      // What was taken, as the entries say: £0.40 of the £1.00 asked, and an amount Shopify never told
      expect(page.refunds).toEqual([
        { date: expect.any(String), productValue: "£5.00", takenBack: "Amount unknown", note: null },
        { date: expect.any(String), productValue: "£20.00", takenBack: "£0.40", note: null },
      ]);
      expect(JSON.stringify(page)).not.toContain("ann@example.com");
    });

    it("says what each refund's take-back took, or where it stands", async () => {
      const buyer = await addBuyer();
      const order = await addOrder(buyer.id, "100.00", 10);
      await addPayout(await addEntry(order, { kind: "cashback", amount: "5.00" }), "sent");
      /** A refund `daysAgo` days ago whose take-back of `amount` is in `state` */
      const takeBack = async (daysAgo: number, amount: string, state: PayoutState, more: Parameters<typeof addPayout>[2] = {}) => {
        const refund = await addRefund(order, "10.00", { daysAgo });
        const entry = await addEntry(order, { kind: "reversal", amount: `-${amount}`, refundId: refund.id });
        const payout = await addPayout(entry, state, { direction: "debit", ...more });
        return payout;
      };
      await takeBack(9, "1.00", "sent", { debitedAmount: "1.00", shortfall: "0" });
      // Closed: it took nothing, and its close: adjustment cancels the reversal
      const closed = await takeBack(8, "0.50", "closed", { lastError: "ACCOUNT_LIMIT" });
      await addEntry(order, { kind: "adjustment", amount: "0.50", key: `close:${closed.id}` });
      await takeBack(7, "0.30", "pending");
      await takeBack(6, "0.20", "held");
      await takeBack(5, "0.15", "unconfirmed", { unconfirmedAt: new Date() });
      await takeBack(4, "0.10", "needs_look", { lookReason: "could_not_confirm" });
      // A refund before the credit was sent: the credit went out less, by the ledger's amount
      await takeBack(3, "0.40", "nothing_to_send");
      // A refund that took nothing off the cashback
      await addRefund(order, "10.00", { daysAgo: 2 });

      const page = await loadPanel(order.id);

      expect(page.refunds.map((refund) => refund.takenBack)).toEqual([null, "£0.40", "Needs a look", "Waiting", "Waiting", "Waiting", "None (closed)", "£1.00"]);
    });

    it("never says Not sent for a payout that may have arrived", async () => {
      const sentDay = new Date("2026-06-06T12:00:00Z");
      const cases: Array<[PayoutState, Parameters<typeof addPayout>[2], string]> = [
        ["sent", { sentAt: sentDay }, "June 6, 2026"],
        ["sending", { claimedAt: new Date() }, "Not confirmed"],
        ["unconfirmed", { unconfirmedAt: new Date() }, "Not confirmed"],
        ["needs_look", { lookReason: "could_not_confirm" }, "Not confirmed"],
        ["needs_look", { lookReason: "refused" }, "Not sent"],
        ["needs_look", { lookReason: "kept_failing" }, "Not sent"],
        ["pending", {}, "Not sent"],
        ["held", {}, "Not sent"],
        ["closed", {}, "Not sent"],
        ["nothing_to_send", {}, "Not sent"],
      ];
      for (const [state, more, sent] of cases) {
        const { order } = await orderWithCredit(state, more);
        expect({ state, ...more, sent: (await loadPanel(order.id)).payouts[0]?.sent }).toEqual({ state, ...more, sent });
      }
    });

    it("offers the answers each needs-a-look reason takes, with the check for one it couldn't confirm", async () => {
      const refused = await orderWithCredit("needs_look", { lookReason: "refused", lastError: "ACCOUNT_LIMIT" });
      const failing = await orderWithCredit("needs_look", { lookReason: "kept_failing" });
      const unclear = await orderWithCredit("needs_look", { lookReason: "could_not_confirm" });
      const debit = await orderWithCredit("sent");
      const takeBack = await addPayout(await addEntry(debit.order, { kind: "reversal", amount: "-1.00" }), "needs_look", {
        direction: "debit",
        lookReason: "could_not_confirm",
      });

      const looks = async (orderId: string) => (await loadPanel(orderId)).payouts.flatMap((p) => (p.look ? [{ id: p.id, ...p.look }] : []));

      expect(await looks(refused.order.id)).toEqual([
        {
          id: refused.credit.id,
          heading: "Cashback of £1.00 needs a look",
          text: "Shopify refused it.",
          hint: null,
          answers: [
            { answer: "retry", label: "Retry" },
            { answer: "close", label: "Close without sending" },
          ],
        },
      ]);
      expect((await looks(failing.order.id))[0]).toMatchObject({ text: "Sending kept failing.", answers: [{ answer: "retry" }, { answer: "close" }] });
      expect(await looks(unclear.order.id)).toEqual([
        {
          id: unclear.credit.id,
          heading: "Cashback of £1.00 needs a look",
          text: "RewardsPro couldn't confirm it arrived.",
          hint: "Check the buyer's store credit in Shopify first. If you already added it by hand, choose It arrived.",
          answers: [
            { answer: "arrived", label: "It arrived" },
            { answer: "not_arrived", label: "It didn't arrive, send it" },
          ],
        },
      ]);
      expect(await looks(debit.order.id)).toEqual([
        {
          id: takeBack.id,
          heading: "Take-back of £1.00 needs a look",
          text: "RewardsPro couldn't confirm it was taken back.",
          hint: "Check the buyer's store credit in Shopify first. If you already took it back by hand, choose It was taken back.",
          answers: [
            { answer: "arrived", label: "It was taken back" },
            { answer: "not_arrived", label: "It wasn't taken back, try again" },
          ],
        },
      ]);
    });

    it("says which refunds the import already counted, and notes a test, cancelled or imported order", async () => {
      const buyer = await addBuyer();
      const imported = await addOrder(buyer.id, "80.00", 200, { source: "import", importRefundIds: ["gid://shopify/Refund/1"] });
      await addRefund(imported, "30.00", { externalId: "gid://shopify/Refund/1", daysAgo: 190 });
      await addRefund(imported, "10.00", { externalId: "gid://shopify/Refund/2", daysAgo: 20 });
      const cancelledTest = await addOrder(buyer.id, "10.00", 2, { test: true, cancelled: true, reason: "test" });

      const page = await loadPanel(imported.id);
      expect(page).toMatchObject({ status: { label: "No cashback", detail: "From before install" }, notes: ["From before install"], entries: [], payouts: [] });
      expect(page.refunds).toEqual([
        { date: expect.any(String), productValue: "£10.00", takenBack: null, note: null },
        { date: expect.any(String), productValue: "£30.00", takenBack: null, note: "Counted at import" },
      ]);
      expect((await loadPanel(cancelledTest.id)).notes).toEqual(["Test order", "Cancelled"]);
    });

    it("answers 404 for another merchant's order, or no order", async () => {
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection(OTHER_SHOP))!;
      const theirBuyer = await addBuyer({ c: other });
      const theirs = await addOrder(theirBuyer.id, "10.00", 1, { c: other });
      const theirEntry = await addEntry(theirs, { kind: "cashback", amount: "1.00", c: other });
      const theirCredit = await addPayout(theirEntry, "needs_look", { lookReason: "refused", c: other });

      for (const id of [theirs.id, "00000000-0000-4000-8000-000000000000", "not-an-order"]) {
        expect(await thrown(loadPanel(id)), id).toEqual({ status: 404 });
        expect(await thrown(answer(id, { intent: "retry", payoutId: theirCredit.id })), id).toEqual({ status: 404 });
      }
      expect(await prisma.payout.findUniqueOrThrow({ where: { id: theirCredit.id } })).toMatchObject({ state: "needs_look", lookReason: "refused" });
    });
  });

  describe("the answers", () => {
    it("Retry sends a refused credit again, with the failure clock and attempts cleared", async () => {
      const { order, credit } = await orderWithCredit("needs_look", { lookReason: "refused", attempts: 5, firstFailedAt: new Date(Date.now() - 2 * DAY) });
      const before = Date.now();

      expect(await answer(order.id, { intent: "retry", payoutId: credit.id })).toEqual({ ok: true });

      const payout = await prisma.payout.findUniqueOrThrow({ where: { id: credit.id } });
      expect(payout).toMatchObject({ state: "pending", lookReason: null, attempts: 0, firstFailedAt: null });
      expect(payout.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(payout.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect((await loadPanel(order.id)).status).toEqual({ label: "Waiting", detail: null });
    });

    it("Close without sending closes a credit that kept failing, and the ledger cancels it", async () => {
      const { order, credit, entry } = await orderWithCredit("needs_look", { lookReason: "kept_failing" }, "1.50");

      expect(await answer(order.id, { intent: "close", payoutId: credit.id })).toEqual({ ok: true });

      expect(await prisma.payout.findUniqueOrThrow({ where: { id: credit.id } })).toMatchObject({ state: "closed", settledBy: "merchant" });
      const adjustment = await prisma.ledgerEntry.findFirstOrThrow({ where: { idempotencyKey: `close:${credit.id}` } });
      expect(adjustment).toMatchObject({ kind: "adjustment", orderId: order.id, customerId: entry.customerId });
      expect(adjustment.amount.toFixed(2)).toBe("-1.50");
      const page = await loadPanel(order.id);
      expect(page.status).toEqual({ label: "No cashback", detail: "Closed without sending" });
      expect(page.payouts[0].look).toBeNull();
    });

    it("It arrived marks a credit sent and releases its held take-back", async () => {
      const { order, credit } = await orderWithCredit("needs_look", { lookReason: "could_not_confirm", claimedAt: new Date(Date.now() - DAY) });
      const held = await addPayout(await addEntry(order, { kind: "reversal", amount: "-0.50" }), "held", { direction: "debit" });

      expect(await answer(order.id, { intent: "arrived", payoutId: credit.id })).toEqual({ ok: true });

      expect(await prisma.payout.findUniqueOrThrow({ where: { id: credit.id } })).toMatchObject({ state: "sent", settledBy: "merchant" });
      expect(await prisma.payout.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({ state: "pending" });
    });

    it("It didn't arrive, send it puts a credit back to pending", async () => {
      const { order, credit } = await orderWithCredit("needs_look", { lookReason: "could_not_confirm", unconfirmedAt: new Date(Date.now() - DAY) });

      expect(await answer(order.id, { intent: "not_arrived", payoutId: credit.id })).toEqual({ ok: true });

      expect(await prisma.payout.findUniqueOrThrow({ where: { id: credit.id } })).toMatchObject({ state: "pending", lookReason: null, unconfirmedAt: null });
    });

    it("It arrived on a take-back that fell short writes the shortfall, and the order says so", async () => {
      const { order } = await orderWithCredit("sent");
      const reversal = await addEntry(order, { kind: "reversal", amount: "-1.00" });
      const debit = await addPayout(reversal, "needs_look", { direction: "debit", lookReason: "could_not_confirm", debitedAmount: "0.40", shortfall: "0.60" });

      expect(await answer(order.id, { intent: "arrived", payoutId: debit.id })).toEqual({ ok: true });

      expect(await prisma.payout.findUniqueOrThrow({ where: { id: debit.id } })).toMatchObject({ state: "sent", settledBy: "merchant" });
      const shortfall = await prisma.ledgerEntry.findFirstOrThrow({ where: { idempotencyKey: `shortfall:${debit.id}` } });
      expect(shortfall.amount.toFixed(2)).toBe("0.60");
      const page = await loadPanel(order.id);
      expect(page.status).toEqual({ label: "Taken back", detail: "Part of it couldn't be taken back: the buyer had spent it" });
      expect(page.entries.find((e) => e.label === "Taken back for a refund")?.detail).toBe("Took back £0.40 of £1.00; the buyer had spent the rest");
      expect(page.entries.map((e) => e.label)).toContain("Not taken back: the buyer had spent it");
    });

    it("It wasn't taken back puts a take-back back to pending, forgetting what it asked", async () => {
      const { order } = await orderWithCredit("sent");
      const debit = await addPayout(await addEntry(order, { kind: "reversal", amount: "-1.00" }), "needs_look", {
        direction: "debit",
        lookReason: "could_not_confirm",
        debitedAmount: "1.00",
        shortfall: "0",
      });

      expect(await answer(order.id, { intent: "not_arrived", payoutId: debit.id })).toEqual({ ok: true });

      expect(await prisma.payout.findUniqueOrThrow({ where: { id: debit.id } })).toMatchObject({ state: "pending", lookReason: null, debitedAmount: null, shortfall: null });
    });

    it("refuses an answer the payout isn't waiting for, a payout of another order, and an unknown answer", async () => {
      const { order, credit } = await orderWithCredit("needs_look", { lookReason: "refused" });
      const elsewhere = await orderWithCredit("needs_look", { lookReason: "refused" });

      expect(await answer(order.id, { intent: "arrived", payoutId: credit.id })).toEqual({
        ok: false,
        error: "This payment has changed since the page loaded. Reload the page.",
      });
      // Another of the store's orders' payout, through this order: not found here
      expect(await thrown(answer(order.id, { intent: "retry", payoutId: elsewhere.credit.id }))).toEqual({ status: 404 });
      expect(await thrown(answer(order.id, { intent: "retry", payoutId: "not-a-payout" }))).toEqual({ status: 404 });
      expect(await answer(order.id, { intent: "refund", payoutId: credit.id })).toMatchObject({ ok: false, status: 400 });

      for (const id of [credit.id, elsewhere.credit.id]) {
        expect(await prisma.payout.findUniqueOrThrow({ where: { id } })).toMatchObject({ state: "needs_look", lookReason: "refused" });
      }
      // Answered once, a second answer changes nothing
      expect(await answer(order.id, { intent: "close", payoutId: credit.id })).toEqual({ ok: true });
      expect(await answer(order.id, { intent: "retry", payoutId: credit.id })).toMatchObject({ ok: false });
      expect(await prisma.payout.findUniqueOrThrow({ where: { id: credit.id } })).toMatchObject({ state: "closed" });
    });
  });
});
