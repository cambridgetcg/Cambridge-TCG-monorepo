import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { databaseSchema } from "~/db.server";
import { REPORT_RETENTION_DAYS, buildPrivacyReport, merchantErasureOrder } from "~/lib/erasure.server";
import type { ConnectionContext } from "~/lib/merchant.server";
import { ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import type { OrderFacts, RefundFacts } from "~/lib/order-facts";
import { answerNeedsLook, sendPayout, settleUnconfirmed } from "~/lib/payouts.server";
import type { CreditHistoryResult, PayoutRail, RailAnswer } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { recordRefund } from "~/lib/refunds.server";
import { action as compliance } from "~/routes/webhooks.compliance";
import { action as appUninstalled } from "~/routes/webhooks.app.uninstalled";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./helpers/database";
import { backdateClaim, signedWebhook } from "./helpers/shopify";

/**
 * app/uninstalled and the three compliance topics on Postgres, adapted from
 * apps/rewardspro's compliance.integration.test.ts: deliveries signed as
 * Shopify signs them, checked by the app's own signature check (no session,
 * so an expired token can't make them answer 500, plan Decision 11).
 * Changed from the old suite: uninstall marks the connection, deletes the
 * sessions and keeps every other row; shop/redact erases the merchant;
 * customers/redact blanks one customer row and keeps the ledger's amounts;
 * a data request opens a privacy_request whose report is built live.
 * MSW answers nothing here: any call to Shopify fails the test.
 */

const SHOP = "compliance-test.myshopify.com";
const OTHER_SHOP = "compliance-other.myshopify.com";
const ALICE = "7001";
const BOB = "7002";
const ALICE_EMAIL = "alice@example.test";
const INSTALLED = new Date("2026-11-01T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const order = (n: number) => `gid://shopify/Order/${n}`;
const money = (v: Prisma.Decimal | null | undefined) => (v == null ? null : v.toFixed(2));

/** A paid £50 order `n` by `buyer`: 5% earns £2.50. */
function orderFacts(n: number, buyer: string): OrderFacts {
  const pair = (amount: string) => ({ amount: new Money(amount), shopAmount: new Money(amount) });
  return {
    externalOrderId: order(n),
    name: `#${n}`,
    externalCustomerId: buyer,
    currency: "GBP",
    shopCurrency: "GBP",
    test: false,
    cancelledAt: null,
    orderedAt: new Date("2026-11-04T12:00:00Z"),
    paidAt: new Date("2026-11-04T12:00:05Z"),
    financialStatus: "PAID",
    total: pair("50.00"),
    productValue: pair("50.00"),
    storeCreditUsed: pair("0"),
    giftCardUsed: pair("0"),
    refundedProductValue: pair("0"),
    refunds: [],
  };
}

/** A refund of £10 of products: takes back £0.50. */
function refundFacts(n: number): RefundFacts {
  const pair = { amount: new Money("10.00"), shopAmount: new Money("10.00") };
  return { externalRefundId: `gid://shopify/Refund/${n}`, productValue: pair, refundedAt: new Date() };
}

const applied: RailAnswer = { outcome: "applied", transactionId: "gid://shopify/StoreCreditAccountCreditTransaction/1" };
const unclear: RailAnswer = { outcome: "unclear", message: "Shopify answered 502" };
const refusedForGood: RailAnswer = { outcome: "refused", permanent: true, code: "OWNER_NOT_FOUND", message: "Owner not found" };

/** A rail that answers every credit with `credit`, every debit as applied, and the history with `history` (none by default). */
function fakeRail(credit: RailAnswer = applied, history: CreditHistoryResult = { status: "found", credits: [], complete: true }) {
  return {
    credit: vi.fn<PayoutRail["credit"]>(async () => credit),
    debit: vi.fn<PayoutRail["debit"]>(async () => ({ outcome: "applied", transactionId: "gid://shopify/StoreCreditAccountDebitTransaction/1" })),
    balance: vi.fn<PayoutRail["balance"]>(async () => new Money("100.00")),
    creditHistory: vi.fn<PayoutRail["creditHistory"]>(async () => history),
  } satisfies PayoutRail;
}

/** A running GBP shop installed on INSTALLED with one 5% tier. */
async function runningShop(shop = SHOP): Promise<ConnectionContext & { tierId: string }> {
  await ensureMerchant({ shop, name: "Compliance Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  const conn = await findConnection(shop);
  if (!conn) throw new Error("no connection");
  const tier = await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
  return { ...conn, running: true, tierId: tier.id };
}

/** Record order `n` by `buyer`; its £2.50 credit is then sent with `answer` (or left pending). */
async function creditFor(conn: ConnectionContext, n: number, buyer: string, answer?: RailAnswer) {
  const recorded = await recordOrder(conn, orderFacts(n, buyer), "live");
  if (recorded.status !== "recorded" || !recorded.payoutId) throw new Error("no payout");
  if (answer) await sendPayout(recorded.payoutId, fakeRail(answer));
  return { orderId: recorded.orderId, customerId: recorded.customerId, payoutId: recorded.payoutId };
}

/** Refund £10 of order `n`: its take-back payout. */
async function takeBack(conn: ConnectionContext, n: number) {
  const refund = await recordRefund(conn, order(n), refundFacts(n));
  if (refund.status !== "recorded" || !refund.reversalPayoutId) throw new Error("no take-back");
  return refund.reversalPayoutId;
}

/** A store with data in every table that holds a merchant's rows, and its offline session. */
async function fullShop(shop: string) {
  const conn = await runningShop(shop);
  await creditFor(conn, 5001, ALICE, applied);
  await takeBack(conn, 5001);
  await creditFor(conn, 5002, BOB);
  await prisma.privacyRequest.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: ALICE,
      shopifyRequestId: "1",
      ordersRequested: [],
      status: "open",
      receivedAt: new Date(),
      dueAt: new Date(Date.now() + 30 * DAY),
      expiresAt: new Date(Date.now() + 45 * DAY),
    },
  });
  await seedSession(shop);
  return conn;
}

/** An offline session row (the routes never read it; the token can be long expired). */
async function seedSession(shop: string, o: { expired?: boolean } = {}) {
  const past = new Date(Date.now() - DAY);
  await prisma.session.create({
    data: {
      id: `offline_${shop}`,
      shop,
      state: "state",
      isOnline: false,
      accessToken: "encrypted-access-token",
      ...(o.expired ? { expires: past, refreshToken: "encrypted-refresh-token", refreshTokenExpires: past } : {}),
    },
  });
}

/** Every model holding a merchant's rows, by its client key. */
const MERCHANT_MODELS = Prisma.dmmf.datamodel.models
  .filter((model) => model.fields.some((field) => field.name === "merchantId"))
  .map((model) => model.name);

type CountDelegate = { count: (args: { where: { merchantId: string } }) => Promise<number> };
const delegate = (model: string) => (prisma as unknown as Record<string, CountDelegate>)[model.charAt(0).toLowerCase() + model.slice(1)];

/** Rows per model for one merchant, plus the merchant row and the shop's sessions. */
async function rowsOf(merchantId: string, shop: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of MERCHANT_MODELS) counts[model] = await delegate(model).count({ where: { merchantId } });
  counts.Merchant = await prisma.merchant.count({ where: { id: merchantId } });
  counts.Session = await prisma.session.count({ where: { shop } });
  return counts;
}

/** The order's ledger, oldest entry first, with each entry's payout. */
async function ledgerOf(orderId: string) {
  const entries = await prisma.ledgerEntry.findMany({ where: { orderId }, include: { payout: true }, orderBy: { createdAt: "asc" } });
  return {
    entries: entries.map((e) => [e.kind, money(e.amount), e.payout?.state ?? null]),
    net: entries.reduce((sum, e) => sum.plus(e.amount.toString()), new Money(0)).toFixed(2),
  };
}

async function payoutOf(id: string) {
  const p = await prisma.payout.findUniqueOrThrow({ where: { id } });
  return { ...p, amount: money(p.amount) };
}

const args = (request: Request) => ({ request, params: {}, context: {} }) as never;
const deliver = (topic: string, payload: unknown, o: { shop?: string; headers?: Record<string, string> } = {}) =>
  (topic === "app/uninstalled" ? appUninstalled : compliance)(
    args(signedWebhook(topic, o.shop ?? SHOP, payload, crypto.randomUUID(), "2026-10", o.headers)),
  );
const uninstall = (o: { shop?: string; triggeredAt?: string } = {}) =>
  deliver("app/uninstalled", { id: 1, myshopify_domain: o.shop ?? SHOP }, { shop: o.shop, headers: o.triggeredAt ? { "X-Shopify-Triggered-At": o.triggeredAt } : {} });
const dataRequest = (requestId: number, customerId: number | null = Number(ALICE), ordersRequested: number[] = [], shop = SHOP) =>
  deliver(
    "customers/data_request",
    {
      shop_id: 1,
      shop_domain: shop,
      orders_requested: ordersRequested,
      ...(customerId === null ? {} : { customer: { id: customerId, email: ALICE_EMAIL, phone: "+447700900000" } }),
      data_request: { id: requestId },
    },
    { shop },
  );
const customerRedact = (customerId: number, shop = SHOP) =>
  deliver("customers/redact", { shop_id: 1, shop_domain: shop, customer: { id: customerId, email: ALICE_EMAIL, phone: "+447700900000" }, orders_to_redact: [] }, { shop });
const shopRedact = (shop = SHOP) => deliver("shop/redact", { shop_id: 1, shop_domain: shop }, { shop });

describe.skipIf(!hasTestDatabase)("uninstall and compliance", () => {
  let logs: string[];

  beforeEach(async () => {
    await resetDatabase();
    logs = [];
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => void logs.push(parts.map(String).join(" ")));
    }
  });

  afterEach(() => {
    restoreFailedCalls();
    vi.restoreAllMocks();
    // Nothing a buyer could be known by reaches the logs.
    expect(logs.join("\n")).not.toContain(ALICE_EMAIL);
    expect(logs.join("\n")).not.toContain("+447700900000");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("app/uninstalled", () => {
    it.each([
      ["no session row", null],
      ["an expired token", { expired: true }],
    ] as const)("uninstall with no usable session answers 200, marks the connection and keeps the data: %s", async (_, session) => {
      const conn = await runningShop();
      const { payoutId, orderId } = await creditFor(conn, 5001, ALICE);
      if (session) await seedSession(SHOP, session);
      const before = await rowsOf(conn.merchantId, SHOP);
      const triggeredAt = "2026-11-03T10:00:00.877041743Z";

      const response = await uninstall({ triggeredAt });

      expect(response.status).toBe(200);
      await expect(findConnection(SHOP)).resolves.toBeNull();
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({
        status: "uninstalled",
        // When Shopify says it happened, not when it arrived (Ruling 13).
        uninstalledAt: new Date("2026-11-03T10:00:00.877Z"),
      });
      // Sessions go; every other row stays until shop/redact.
      await expect(rowsOf(conn.merchantId, SHOP)).resolves.toEqual({ ...before, Session: 0 });
      await expect(payoutOf(payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.50" });
      await expect(ledgerOf(orderId)).resolves.toMatchObject({ net: "2.50" });
    });

    it("dates the uninstall at its receipt when X-Shopify-Triggered-At is missing or doesn't read", async () => {
      for (const triggeredAt of [undefined, "not a time"]) {
        await resetDatabase();
        const conn = await runningShop();
        const before = Date.now();
        expect((await uninstall({ triggeredAt })).status).toBe(200);
        const { uninstalledAt } = await prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } });
        expect(uninstalledAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(uninstalledAt!.getTime()).toBeLessThanOrEqual(Date.now());
      }
    });

    it("a repeated delivery keeps the first uninstall time and answers 200", async () => {
      const conn = await runningShop();
      await uninstall({ triggeredAt: "2026-11-03T10:00:00Z" });
      await seedSession(SHOP);

      expect((await uninstall({ triggeredAt: "2026-11-03T10:00:00Z" })).status).toBe(200);

      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({
        status: "uninstalled",
        uninstalledAt: new Date("2026-11-03T10:00:00Z"),
      });
      await expect(prisma.session.count()).resolves.toBe(0);
    });

    it("a stale uninstall, retried after a reinstall it failed before, leaves the live store and its session (Ruling 13)", async () => {
      const conn = await runningShop();
      const uninstalledAt = "2026-11-03T10:00:00Z";
      // The first delivery fails before it commits: the connection stays active.
      failNextCall("connection", "updateMany", new Error("connection reset"));
      expect((await uninstall({ triggeredAt: uninstalledAt })).status).toBe(500);
      await expect(findConnection(SHOP)).resolves.not.toBeNull();
      // The merchant reinstalls: a fresh session and an open. The connection
      // was never marked, so the open doesn't reactivate it (activatedAt stays).
      await seedSession(SHOP);
      const reopened = new Date("2026-11-03T11:00:00Z");
      await expect(ensureMerchant({ shop: SHOP, name: "Compliance Test", currency: "GBP", timezone: "Europe/London", now: reopened })).resolves.toMatchObject({
        reactivated: false,
      });

      // Shopify retries the first uninstall.
      expect((await uninstall({ triggeredAt: uninstalledAt })).status).toBe(200);

      await expect(findConnection(SHOP)).resolves.toMatchObject({ connectionId: conn.connectionId, activatedAt: INSTALLED, uninstalledAt: null });
      await expect(prisma.session.count({ where: { shop: SHOP } })).resolves.toBe(1);
      // At the very instant of the open counts as before it, too.
      expect((await uninstall({ triggeredAt: reopened.toISOString() })).status).toBe(200);
      await expect(findConnection(SHOP)).resolves.not.toBeNull();
      await expect(prisma.session.count({ where: { shop: SHOP } })).resolves.toBe(1);

      // An uninstall after that open is a real one.
      expect((await uninstall({ triggeredAt: "2026-11-03T11:00:01Z" })).status).toBe(200);
      await expect(findConnection(SHOP)).resolves.toBeNull();
      await expect(prisma.session.count({ where: { shop: SHOP } })).resolves.toBe(0);
    });

    it("a store never seen answers 200 and loses its sessions", async () => {
      await seedSession(OTHER_SHOP);

      expect((await uninstall({ shop: OTHER_SHOP })).status).toBe(200);

      await expect(prisma.session.count()).resolves.toBe(0);
      await expect(prisma.connection.count()).resolves.toBe(0);
    });

    it("uninstall with a bad HMAC answers 401", async () => {
      const conn = await runningShop();
      await seedSession(SHOP);
      const request = signedWebhook("app/uninstalled", SHOP, { id: 1 }, crypto.randomUUID(), "2026-10", {
        "X-Shopify-Hmac-Sha256": crypto.createHmac("sha256", "not-the-secret").update(JSON.stringify({ id: 1 })).digest("base64"),
      });

      expect((await appUninstalled(args(request))).status).toBe(401);

      await expect(findConnection(SHOP)).resolves.toMatchObject({ connectionId: conn.connectionId });
      await expect(prisma.session.count()).resolves.toBe(1);
    });

    it("another topic at the uninstall URI answers 400 and changes nothing", async () => {
      await runningShop();
      await seedSession(SHOP);
      expect((await appUninstalled(args(signedWebhook("shop/redact", SHOP, { shop_id: 1, shop_domain: SHOP })))).status).toBe(400);
      await expect(findConnection(SHOP)).resolves.not.toBeNull();
      await expect(prisma.session.count()).resolves.toBe(1);
    });

    it("reinstall before shop/redact reactivates and a pending payout is still there", async () => {
      const conn = await runningShop();
      const pending = await creditFor(conn, 5001, ALICE);
      const unconfirmed = await creditFor(conn, 5002, ALICE, unclear);
      const held = await takeBack(conn, 5002);
      await seedSession(SHOP);
      expect((await uninstall({ triggeredAt: "2026-11-03T10:00:00Z" })).status).toBe(200);

      const reopened = await ensureMerchant({ shop: SHOP, name: "Compliance Test", currency: "GBP", timezone: "Europe/London", now: new Date("2026-11-04T09:00:00Z") });

      expect(reopened).toEqual({ merchantId: conn.merchantId, connectionId: conn.connectionId, created: false, reactivated: true });
      // Rule 12: pending payouts and held take-backs carry on.
      await expect(payoutOf(pending.payoutId)).resolves.toMatchObject({ state: "pending", amount: "2.50" });
      await expect(payoutOf(unconfirmed.payoutId)).resolves.toMatchObject({ state: "unconfirmed" });
      await expect(payoutOf(held)).resolves.toMatchObject({ state: "held", amount: "0.50" });
      const rail = fakeRail();
      await expect(sendPayout(pending.payoutId, rail)).resolves.toBe("sent");
      expect(rail.credit).toHaveBeenCalledWith(expect.objectContaining({ externalCustomerId: ALICE }));
      // The connection stays the merchant's; the import doesn't run again.
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).resolves.toMatchObject({ installedAt: INSTALLED });
    });
  });

  describe("compliance topics", () => {
    it("compliance topics with no usable session answer 200 and do their work", async () => {
      // The real order: uninstall (sessions go), then the privacy topics, then shop/redact 48 h later.
      const conn = await runningShop();
      await creditFor(conn, 5001, ALICE);
      await seedSession(SHOP, { expired: true });
      expect((await uninstall()).status).toBe(200);

      expect((await dataRequest(11)).status).toBe(200);
      await expect(prisma.privacyRequest.count({ where: { connectionId: conn.connectionId, shopifyRequestId: "11" } })).resolves.toBe(1);

      expect((await customerRedact(Number(ALICE))).status).toBe(200);
      await expect(prisma.customer.count({ where: { connectionId: conn.connectionId, externalCustomerId: ALICE } })).resolves.toBe(0);
      await expect(prisma.customer.count({ where: { connectionId: conn.connectionId, redactedAt: { not: null } } })).resolves.toBe(1);

      expect((await shopRedact()).status).toBe(200);
      await expect(prisma.merchant.count()).resolves.toBe(0);
      await expect(prisma.connection.count()).resolves.toBe(0);
    });

    it("compliance with a bad HMAC answers 401 and changes nothing", async () => {
      const conn = await fullShop(SHOP);
      const before = await rowsOf(conn.merchantId, SHOP);
      const body = { shop_id: 1, shop_domain: SHOP };
      const request = signedWebhook("shop/redact", SHOP, body, crypto.randomUUID(), "2026-10", {
        "X-Shopify-Hmac-Sha256": crypto.createHmac("sha256", "not-the-secret").update(JSON.stringify(body)).digest("base64"),
      });

      expect((await compliance(args(request))).status).toBe(401);

      await expect(rowsOf(conn.merchantId, SHOP)).resolves.toEqual(before);
    });

    it("a shop it has never seen answers 200 for every topic", async () => {
      const conn = await fullShop(SHOP);
      const before = await rowsOf(conn.merchantId, SHOP);

      for (const response of [await dataRequest(12, Number(ALICE), [], OTHER_SHOP), await customerRedact(Number(ALICE), OTHER_SHOP), await shopRedact(OTHER_SHOP)]) {
        expect(response.status).toBe(200);
      }

      await expect(rowsOf(conn.merchantId, SHOP)).resolves.toEqual(before);
    });

    it("another topic at the compliance URI answers 400", async () => {
      await runningShop();
      expect((await compliance(args(signedWebhook("app/uninstalled", SHOP, {})))).status).toBe(400);
      await expect(findConnection(SHOP)).resolves.not.toBeNull();
    });

    it("an error answers 500, so Shopify delivers it again", async () => {
      const conn = await runningShop();
      await creditFor(conn, 5001, ALICE);
      failNextCall("connection", "findFirst", new Error("connection reset"));

      expect((await customerRedact(Number(ALICE))).status).toBe(500);

      await expect(prisma.customer.count({ where: { externalCustomerId: ALICE } })).resolves.toBe(1);
      expect(logs.join("\n")).toMatch(/connection reset/);
      // The redelivery does the work.
      expect((await customerRedact(Number(ALICE))).status).toBe(200);
      await expect(prisma.customer.count({ where: { externalCustomerId: ALICE } })).resolves.toBe(0);
    });
  });

  describe("shop/redact", () => {
    it("shop/redact erases every merchant table and passes the ledger trigger", async () => {
      const conn = await fullShop(SHOP);
      const other = await fullShop(OTHER_SHOP);
      await prisma.cronLock.create({ data: { jobName: "payouts", expiresAt: new Date(Date.now() + 60_000) } });
      const mine = await rowsOf(conn.merchantId, SHOP);
      const otherBefore = await rowsOf(other.merchantId, OTHER_SHOP);
      // Every table that holds a merchant's rows has some, so the erasure is tested on each.
      for (const [model, count] of Object.entries(mine)) expect(count, model).toBeGreaterThan(0);

      const response = await shopRedact();

      expect(response.status).toBe(200);
      const after = await rowsOf(conn.merchantId, SHOP);
      expect(after).toEqual(Object.fromEntries(Object.keys(mine).map((model) => [model, 0])));
      // The other store and the jobs' own rows are untouched.
      await expect(rowsOf(other.merchantId, OTHER_SHOP)).resolves.toEqual(otherBefore);
      await expect(prisma.cronLock.count()).resolves.toBe(1);
      // The append-only trigger still guards the rows that are left.
      // (SET LOCAL ended with the erasure's transaction.)
      await expect(prisma.$executeRaw`DELETE FROM ${Prisma.raw(`"${databaseSchema}"."ledger_entry"`)}`).rejects.toThrow(/append-only/);
    });

    it("a repeated shop/redact answers 200 with nothing left to erase", async () => {
      await fullShop(SHOP);
      expect((await shopRedact()).status).toBe(200);
      expect((await shopRedact()).status).toBe(200);
      await expect(prisma.merchant.count()).resolves.toBe(0);
    });

    it("a reinstall after shop/redact starts afresh: a new merchant, and the import runs again (spec 6.5)", async () => {
      const first = await fullShop(SHOP);
      await uninstall();
      expect((await shopRedact()).status).toBe(200);

      const reopened = new Date("2026-11-20T09:00:00Z");
      const again = await ensureMerchant({ shop: SHOP, name: "Compliance Test", currency: "GBP", timezone: "Europe/London", now: reopened });

      expect(again).toMatchObject({ created: true, reactivated: false });
      expect(again.merchantId).not.toBe(first.merchantId);
      await expect(prisma.connection.findUniqueOrThrow({ where: { id: again.connectionId } })).resolves.toMatchObject({
        status: "active",
        installedAt: reopened,
        activatedAt: reopened,
        uninstalledAt: null,
        importState: "not_started",
      });
    });

    it("every model with merchantId is covered by the erasure order", () => {
      const order = merchantErasureOrder();

      expect([...order].sort()).toEqual([...MERCHANT_MODELS].sort());
      // Each model is erased before every model it points at.
      for (const model of Prisma.dmmf.datamodel.models) {
        if (!order.includes(model.name)) continue;
        for (const field of model.fields) {
          if (field.kind !== "object" || !field.relationFromFields?.length || field.type === model.name || !order.includes(field.type)) continue;
          expect(order.indexOf(model.name), `${model.name} before ${field.type}`).toBeLessThan(order.indexOf(field.type));
        }
      }
    });
  });

  describe("customers/redact", () => {
    it("customers/redact blanks one buyer, keeps ledger amounts, closes open payouts", async () => {
      const conn = await runningShop();
      const pending = await creditFor(conn, 5001, ALICE);
      const refused = await creditFor(conn, 5002, ALICE, refusedForGood);
      const sent = await creditFor(conn, 5003, ALICE, applied);
      const pendingTakeBack = await takeBack(conn, 5003);
      const unconfirmed = await creditFor(conn, 5004, ALICE, unclear);
      const heldTakeBack = await takeBack(conn, 5004);
      const bob = await creditFor(conn, 5101, BOB);
      await prisma.customer.update({ where: { id: pending.customerId }, data: { lockedTierId: conn.tierId } });
      await dataRequest(21);
      await dataRequest(22, Number(BOB));
      const amountsBefore = await prisma.ledgerEntry.findMany({ where: { kind: { not: "adjustment" } }, orderBy: { id: "asc" } });

      expect((await customerRedact(Number(ALICE))).status).toBe(200);

      const alice = await prisma.customer.findUniqueOrThrow({ where: { id: pending.customerId } });
      expect(alice).toMatchObject({ externalCustomerId: null, lockedTierId: null, redactedAt: expect.any(Date) });
      // The ledger's amounts stay as they were; closing only adds adjustments.
      await expect(prisma.ledgerEntry.findMany({ where: { kind: { not: "adjustment" } }, orderBy: { id: "asc" } })).resolves.toEqual(amountsBefore);
      await expect(prisma.order.count({ where: { customerId: pending.customerId } })).resolves.toBe(4);

      const erased = { state: "closed", lastError: "Customer data erased", settledBy: "auto" };
      await expect(payoutOf(pending.payoutId)).resolves.toMatchObject({ ...erased, amount: "2.50" });
      await expect(ledgerOf(pending.orderId)).resolves.toEqual({ entries: [["cashback", "2.50", "closed"], ["adjustment", "-2.50", null]], net: "0.00" });
      await expect(payoutOf(refused.payoutId)).resolves.toMatchObject(erased);
      await expect(ledgerOf(refused.orderId)).resolves.toMatchObject({ net: "0.00" });
      // Sent stays sent; its take-back is never taken, so the buyer keeps the whole credit in the ledger too.
      await expect(payoutOf(sent.payoutId)).resolves.toMatchObject({ state: "sent" });
      await expect(payoutOf(pendingTakeBack)).resolves.toMatchObject(erased);
      await expect(ledgerOf(sent.orderId)).resolves.toEqual({
        entries: [["cashback", "2.50", "sent"], ["reversal", "-0.50", "closed"], ["adjustment", "0.50", null]],
        net: "2.50",
      });
      // An unclear credit may have landed: it is left for the hourly check; its held take-back is closed.
      await expect(payoutOf(unconfirmed.payoutId)).resolves.toMatchObject({ state: "unconfirmed" });
      await expect(payoutOf(heldTakeBack)).resolves.toMatchObject(erased);

      // The other buyer is untouched, and so is their data request.
      await expect(prisma.customer.findUniqueOrThrow({ where: { id: bob.customerId } })).resolves.toMatchObject({ externalCustomerId: BOB, redactedAt: null });
      await expect(payoutOf(bob.payoutId)).resolves.toMatchObject({ state: "pending", lastError: null });
      // The erased buyer's data requests go with them.
      await expect(prisma.privacyRequest.findMany({ select: { shopifyRequestId: true } })).resolves.toEqual([{ shopifyRequestId: "22" }]);
    });

    it("a held take-back closed by the redaction leaves a true ledger whatever its credit turns out to be", async () => {
      const conn = await runningShop();
      const credit = await creditFor(conn, 5001, ALICE, unclear);
      await takeBack(conn, 5001);
      expect((await customerRedact(Number(ALICE))).status).toBe(200);

      // The hourly check can't ask about an erased buyer: it needs a look, and the merchant closes it.
      await backdateClaim(credit.payoutId, 60);
      await expect(settleUnconfirmed(credit.payoutId, fakeRail())).resolves.toBe("needs_look");
      await expect(answerNeedsLook(conn.merchantId, credit.payoutId, "close")).resolves.toEqual({ ok: true });

      const ledger = await ledgerOf(credit.orderId);
      expect(ledger.entries).toEqual([
        ["cashback", "2.50", "closed"],
        ["reversal", "-0.50", "closed"],
        ["adjustment", "0.50", null],
        ["adjustment", "-2.50", null],
      ]);
      expect(ledger.net).toBe("0.00");
    });

    it("a credit that couldn't be confirmed is closed less its held take-back, which then has nothing to send", async () => {
      const conn = await runningShop();
      const credit = await creditFor(conn, 5001, ALICE, unclear);
      await backdateClaim(credit.payoutId, 60);
      // Two credits of its amount from when it was sent: the merchant would be asked.
      const twoAlike: CreditHistoryResult = {
        status: "found",
        complete: true,
        credits: [0, 1].map((n) => ({ id: `t${n}`, amount: new Money("2.50"), currency: "GBP", createdAt: new Date(Date.now() - 60 * 60_000 + n * 1000) })),
      };
      await expect(settleUnconfirmed(credit.payoutId, fakeRail(applied, twoAlike))).resolves.toBe("needs_look");
      const held = await takeBack(conn, 5001);
      await expect(payoutOf(held)).resolves.toMatchObject({ state: "held" });

      expect((await customerRedact(Number(ALICE))).status).toBe(200);

      await expect(payoutOf(credit.payoutId)).resolves.toMatchObject({ state: "closed", amount: "2.00", lastError: "Customer data erased" });
      await expect(payoutOf(held)).resolves.toMatchObject({ state: "nothing_to_send" });
      await expect(ledgerOf(credit.orderId)).resolves.toEqual({
        entries: [["cashback", "2.50", "closed"], ["reversal", "-0.50", "nothing_to_send"], ["adjustment", "-2.00", null]],
        net: "0.00",
      });
    });

    it("a redacted buyer's next order is a new buyer row", async () => {
      const conn = await runningShop();
      await creditFor(conn, 5001, ALICE);
      await customerRedact(Number(ALICE));

      const next = await creditFor(conn, 5002, ALICE);

      await expect(prisma.customer.findUniqueOrThrow({ where: { id: next.customerId } })).resolves.toMatchObject({ externalCustomerId: ALICE, redactedAt: null });
      await expect(prisma.customer.count()).resolves.toBe(2);
    });

    it("a buyer never seen answers 200 and changes nothing else", async () => {
      const conn = await fullShop(SHOP);
      const before = await rowsOf(conn.merchantId, SHOP);

      expect((await customerRedact(9999)).status).toBe(200);

      await expect(rowsOf(conn.merchantId, SHOP)).resolves.toEqual(before);
    });

    it("a repeated customers/redact answers 200 and adds nothing", async () => {
      const conn = await runningShop();
      const { orderId } = await creditFor(conn, 5001, ALICE);
      await customerRedact(Number(ALICE));
      const ledger = await ledgerOf(orderId);

      expect((await customerRedact(Number(ALICE))).status).toBe(200);

      await expect(ledgerOf(orderId)).resolves.toEqual(ledger);
    });
  });

  describe("customers/data_request", () => {
    it("data_request opens a request due in 30 days and the report holds the ledger", async () => {
      const conn = await runningShop();
      const paid = await creditFor(conn, 5001, ALICE, applied);
      const refundPayout = await takeBack(conn, 5001);
      const pending = await creditFor(conn, 5002, ALICE);
      const bob = await creditFor(conn, 5101, BOB);
      const before = Date.now();

      expect((await dataRequest(31, Number(ALICE), [5001])).status).toBe(200);

      const request = await prisma.privacyRequest.findFirstOrThrow({ where: { shopifyRequestId: "31" } });
      expect(request).toMatchObject({
        merchantId: conn.merchantId,
        connectionId: conn.connectionId,
        externalCustomerId: ALICE,
        ordersRequested: [order(5001)],
        status: "open",
        downloadedAt: null,
      });
      expect(request.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(request.dueAt.getTime() - request.receivedAt.getTime()).toBe(30 * DAY);
      expect(request.expiresAt.getTime() - request.receivedAt.getTime()).toBe(REPORT_RETENTION_DAYS * DAY);
      expect(REPORT_RETENTION_DAYS).toBe(45);

      // Shopify delivers it again: still one request.
      expect((await dataRequest(31, Number(ALICE), [5001])).status).toBe(200);
      await expect(prisma.privacyRequest.count()).resolves.toBe(1);

      const download = await buildPrivacyReport(conn.merchantId, request.id);
      expect(download?.filename).toBe("customer-data-request-31.json");
      const report = JSON.parse(download!.json);
      expect(report.customer).toMatchObject({ id: paid.customerId, externalCustomerId: ALICE });
      expect(report.orders.map((o: { externalOrderId: string }) => o.externalOrderId).sort()).toEqual([order(5001), order(5002)]);
      expect(report.ledgerEntries.map((e: { kind: string; amount: string }) => [e.kind, Number(e.amount)])).toEqual(
        expect.arrayContaining([
          ["cashback", 2.5],
          ["reversal", -0.5],
          ["cashback", 2.5],
        ]),
      );
      expect(report.ledgerEntries).toHaveLength(3);
      expect(report.payouts.map((p: { id: string }) => p.id).sort()).toEqual([paid.payoutId, refundPayout, pending.payoutId].sort());
      // Nothing of the other buyer's.
      expect(download!.json).not.toContain(bob.customerId);
      expect(download!.json).not.toContain(BOB);
      await expect(prisma.privacyRequest.findUniqueOrThrow({ where: { id: request.id } })).resolves.toMatchObject({
        status: "downloaded",
        downloadedAt: expect.any(Date),
      });
    });

    it("the report is the merchant's only, and gone once it has expired", async () => {
      const conn = await runningShop();
      const other = await runningShop(OTHER_SHOP);
      await creditFor(conn, 5001, ALICE);
      await dataRequest(41);
      const request = await prisma.privacyRequest.findFirstOrThrow({ where: { shopifyRequestId: "41" } });

      await expect(buildPrivacyReport(other.merchantId, request.id)).resolves.toBeNull();
      await expect(buildPrivacyReport(conn.merchantId, "not-a-request-id")).resolves.toBeNull();
      await expect(buildPrivacyReport(conn.merchantId, crypto.randomUUID())).resolves.toBeNull();
      await expect(prisma.privacyRequest.findUniqueOrThrow({ where: { id: request.id } })).resolves.toMatchObject({ downloadedAt: null });

      await prisma.privacyRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await expect(buildPrivacyReport(conn.merchantId, request.id)).resolves.toBeNull();
    });

    it("a request for a buyer never seen opens a report that says so", async () => {
      const conn = await runningShop();
      await creditFor(conn, 5001, ALICE);

      expect((await dataRequest(51, 9999)).status).toBe(200);

      const request = await prisma.privacyRequest.findFirstOrThrow({ where: { shopifyRequestId: "51" } });
      const report = JSON.parse((await buildPrivacyReport(conn.merchantId, request.id))!.json);
      expect(report).toMatchObject({ customerFound: false, customer: null, orders: [], ledgerEntries: [], payouts: [] });
    });

    it("the first download time is kept", async () => {
      const conn = await runningShop();
      await creditFor(conn, 5001, ALICE);
      await dataRequest(61);
      const { id } = await prisma.privacyRequest.findFirstOrThrow({ where: { shopifyRequestId: "61" } });

      await buildPrivacyReport(conn.merchantId, id);
      const first = (await prisma.privacyRequest.findUniqueOrThrow({ where: { id } })).downloadedAt;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await buildPrivacyReport(conn.merchantId, id);

      await expect(prisma.privacyRequest.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ downloadedAt: first });
    });
  });
});
