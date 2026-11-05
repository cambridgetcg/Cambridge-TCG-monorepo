import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { Session } from "@shopify/shopify-app-react-router/server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { graphql, http, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { type ConnectionContext, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { runPayoutCheck } from "~/lib/payout-check.server";
import type { OrderSource, PayoutRail } from "~/lib/ports";
import { recordOrder } from "~/lib/record-order.server";
import { recordRefund } from "~/lib/refunds.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import { tierSpend } from "~/lib/tiers.server";
import { parseBulkLines } from "~/shopify/bulk-file";
import { pollImport, pollRunningImports } from "~/shopify/bulk-import.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { onAppOpened } from "~/shopify/install.server";
import { factsFromOrderNode } from "~/shopify/order-source.server";
import { server } from "../setup";
import { hasTestDatabase, resetDatabase } from "./helpers/database";
import { type FixtureAnswer, adminGraphqlUrl, mockOrderFacts, seedOfflineSession, signedWebhook } from "./helpers/shopify";

/**
 * The past-orders import (spec 6.5, rule 11): started on the first app open,
 * read from a Shopify bulk operation's JSONL file, written as `import` orders
 * that count toward tiers and never earn, resumable, and polled by the hourly
 * job. Shopify's GraphQL is a test double answering by operation name; the
 * file is served through MSW.
 */

const SHOP = "import-test.myshopify.com";
const FILE_URL = "https://storage.example.test/bulk/orders.jsonl";
const CRON_SECRET = "cron-secret-for-tests";
const DAY = 24 * 60 * 60 * 1000;
const FAR = () => Date.now() + 60_000;

const FILE = readFileSync(new URL("../fixtures/bulk/orders.jsonl", import.meta.url), "utf8");
/** The orders the fixture file holds that the import keeps: paid, not test, not cancelled, with a buyer, readable. */
const KEPT = ["gid://shopify/Order/9001", "gid://shopify/Order/9002", "gid://shopify/Order/9007"];

const session = new Session({ id: `offline_${SHOP}`, shop: SHOP, state: "state", isOnline: false, accessToken: "shpat_import_test" });

type Bulk = { status: string; errorCode: string | null; url: string | null; objectCount: string; rootObjectCount: string };

/** When the fake Shopify says each bulk query began: a minute before the test's install, plus a second per query. */
const bulkCreatedAt = (n: number) => new Date(Date.now() - 60_000 + n * 1000).toISOString();

/**
 * Shopify as the import sees it: the shop, the app's scopes, bulk operations
 * started (numbered from 1) and the latest one's status, which a test sets.
 */
function fakeShopify(o: { scopes?: string[] } = {}) {
  const scopes = o.scopes ?? ["read_customers", "read_orders", "read_all_orders", "write_store_credit_account_transactions"];
  const started: string[] = [];
  const bulk: Bulk = { status: "RUNNING", errorCode: null, url: null, objectCount: "0", rootObjectCount: "0" };
  const createdAt: string[] = [];
  const answer = (query: string, variables: Record<string, unknown> = {}): unknown => {
    const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    switch (name) {
      case "RewardsShopDetails":
        return { data: { shop: { name: "Import Test", currencyCode: "GBP", ianaTimezone: "Europe/London" } } };
      case "RewardsAccessScopes":
        return { data: { currentAppInstallation: { accessScopes: scopes.map((handle) => ({ handle })) } } };
      case "RewardsBulkOrders":
        started.push(String(variables.query));
        createdAt.push(bulkCreatedAt(started.length));
        return {
          data: {
            bulkOperationRunQuery: {
              bulkOperation: { id: `gid://shopify/BulkOperation/${started.length}`, status: "CREATED", createdAt: createdAt.at(-1) },
              userErrors: [],
            },
          },
        };
      case "RewardsBulkStatus":
        return { data: { bulkOperation: { id: variables.id, ...bulk } } };
      default:
        throw new Error(`Unexpected query ${name}`);
    }
  };
  const graphqlCall = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    const body = answer(query, options?.variables);
    return { json: async () => body };
  });
  const admin: GraphqlClient = { graphql: graphqlCall };
  return { admin, started, createdAt, bulk, graphqlCall };
}

/** The bulk file at FILE_URL (or, with `status`, that answer instead); returns how often it was fetched. */
function serveFile(text = FILE, o: { status?: number } = {}): { fetches: number } {
  const seen = { fetches: 0 };
  server.use(
    http.get(FILE_URL, () => {
      seen.fetches++;
      if (o.status) return new HttpResponse(null, { status: o.status });
      return new HttpResponse(text, { headers: { "Content-Type": "application/jsonl" } });
    }),
  );
  return seen;
}

/**
 * Runs `then` after each prisma.connection.updateMany that moves the import's
 * cursor, as a poll saves it after each chunk; returns the undo. vi.spyOn
 * can't wrap a Prisma model method (its restore leaves it undefined).
 */
function afterCursorSave(then: (cursor: number) => void): () => void {
  const delegate = prisma.connection as unknown as Record<string, (args: { data?: { importCursor?: unknown } }) => Promise<unknown>>;
  const original = delegate.updateMany;
  delegate.updateMany = async (args) => {
    const result = await original(args);
    if (typeof args.data?.importCursor === "number") then(args.data.importCursor);
    return result;
  };
  return () => {
    delegate.updateMany = original;
  };
}

/** The merchant opens the app for the first time; returns the connection and the Shopify double. */
async function firstOpen(o: { scopes?: string[] } = {}) {
  const shopify = fakeShopify(o);
  await onAppOpened({ session, admin: shopify.admin as unknown as AdminApiContext });
  const conn = await findConnection(SHOP);
  if (!conn) throw new Error("no connection");
  return { conn, shopify };
}

const connectionRow = () => prisma.connection.findFirstOrThrow();

function complete(shopify: ReturnType<typeof fakeShopify>) {
  Object.assign(shopify.bulk, { status: "COMPLETED", url: FILE_URL, objectCount: "17", rootObjectCount: "8" });
}

async function addTiers(merchantId: string) {
  const tier = (name: string, minSpend: string, percent: string, position: number) =>
    prisma.tier.create({
      data: { merchantId, name, minSpend: new Prisma.Decimal(minSpend), cashbackPercent: new Prisma.Decimal(percent), position },
    });
  return { everyone: await tier("Everyone", "0", "5.00", 0), silver: await tier("Silver", "60", "7.00", 1) };
}

/** Order `gid` of the fixture file, as a live read (orders/paid, the sweep) would give it. */
function liveFacts(gid: string) {
  const node = parseBulkLines(FILE.split("\n")).find((n) => (n as { id: string }).id === gid);
  return factsFromOrderNode(node, "GBP", { refunds: [] });
}

describe.skipIf(!hasTestDatabase)("the past-orders import", () => {
  beforeAll(() => {
    // ~/shopify.server (unauthenticated.admin, the cron route) logs the library's version when it loads
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SHOPIFY_API_KEY = "test-api-key";
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(console.error).mockClear();
  });

  afterAll(() => {
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("starts one bulk query of the 12 months before install, however often the app is opened", async () => {
    const { conn, shopify } = await firstOpen();
    await onAppOpened({ session, admin: shopify.admin as unknown as AdminApiContext });

    expect(shopify.started).toHaveLength(1);
    const from = new Date(conn.installedAt.getTime() - 365 * DAY).toISOString();
    // Sorted by its created_at range, as the bulk guide asks (docs check Q4)
    expect(shopify.started[0]).toContain(
      `orders(query: "created_at:>='${from}' AND created_at:<'${conn.installedAt.toISOString()}'", sortKey: CREATED_AT)`,
    );
    expect(shopify.started[0]).toMatch(/^\{\s+orders\(/);
    expect(shopify.started[0]).toContain("totalTipReceivedSet");
    expect(shopify.started[0]).not.toMatch(/\brefunds\b|\bshop\b/);
    await expect(connectionRow()).resolves.toMatchObject({
      importState: "running",
      importOperationId: "gid://shopify/BulkOperation/1",
      importHorizonDays: 365,
      importAttempts: 1,
      importCursor: 0,
      // Shopify's own start time of the bulk query (Ruling 49)
      importStartedAt: new Date(shopify.createdAt[0]),
    });
  });

  it("covers 60 days when Shopify hasn't granted read_all_orders", async () => {
    const { conn, shopify } = await firstOpen({ scopes: ["read_customers", "read_orders"] });

    const from = new Date(conn.installedAt.getTime() - 60 * DAY).toISOString();
    expect(shopify.started[0]).toContain(`created_at:>='${from}' AND created_at:<'${conn.installedAt.toISOString()}'`);
    await expect(connectionRow()).resolves.toMatchObject({ importHorizonDays: 60, importState: "running" });
  });

  it("waits while Shopify runs the bulk query", async () => {
    const { conn, shopify } = await firstOpen();

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("running");

    await expect(prisma.order.count()).resolves.toBe(0);
    expect(shopify.started).toHaveLength(1);
  });

  it("writes the paid orders as imports with no ledger entry, skipping test, cancelled, guest, unpaid and unreadable orders", async () => {
    const { conn, shopify } = await firstOpen();
    await addTiers(conn.merchantId);
    expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
    complete(shopify);
    serveFile();

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");

    const orders = await prisma.order.findMany({ orderBy: { externalOrderId: "asc" } });
    expect(orders.map((o) => o.externalOrderId)).toEqual(KEPT);
    for (const order of orders) expect(order).toMatchObject({ source: "import", noCashbackReason: "import" });
    await expect(prisma.ledgerEntry.count()).resolves.toBe(0);
    await expect(prisma.payout.count()).resolves.toBe(0);
    // The unreadable order is counted where Home and the operator see it, by its id only
    await expect(connectionRow()).resolves.toMatchObject({
      importState: "done",
      importedCount: 3,
      importCursor: 8,
      importError: "1 of 8 past orders could not be read, so their spend is not counted: 9008",
    });
    // and logged by its id only
    const logged = vi.mocked(console.error).mock.calls.map((call) => call.map(String).join(" "));
    expect(logged).toEqual([expect.stringContaining("gid://shopify/Order/9008")]);
  });

  it("counts refunded items off the buyer's spend", async () => {
    const { conn, shopify } = await firstOpen();
    complete(shopify);
    serveFile();

    await pollImport(shopify.admin, conn.connectionId, FAR());

    const partly = await prisma.order.findFirstOrThrow({ where: { externalOrderId: "gid://shopify/Order/9002" } });
    expect(partly.shopProductAmount.toFixed(2)).toBe("30.00");
    expect(partly.shopRefundedProductAmount.toFixed(2)).toBe("20.00");
    const buyer = await prisma.customer.findFirstOrThrow({ where: { externalCustomerId: "7001" } });
    // £55 + (£30 − £20)
    expect((await tierSpend(buyer.id, "lifetime", new Date())).toFixed(2)).toBe("65.00");
  });

  it("places the buyers in tiers when it finishes", async () => {
    const { conn, shopify } = await firstOpen();
    await prisma.merchant.update({ where: { id: conn.merchantId }, data: { tierWindow: "lifetime" } });
    const { everyone, silver } = await addTiers(conn.merchantId);
    complete(shopify);
    serveFile();

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");

    const buyers = await prisma.customer.findMany({ orderBy: { externalCustomerId: "asc" } });
    expect(buyers.map((b) => [b.externalCustomerId, b.tierId])).toEqual([
      ["7001", silver.id],
      ["7002", everyone.id],
    ]);
    for (const buyer of buyers) expect(buyer.resolvedAt).not.toBeNull();
  });

  it("stops at the deadline between two chunks, saving the cursor, and carries on from it on the next poll", async () => {
    const { conn, shopify } = await firstOpen();
    complete(shopify);
    const file = serveFile();
    const realNow = Date.now.bind(Date);
    let late = false;
    const now = vi.spyOn(Date, "now").mockImplementation(() => (late ? realNow() + 60 * 60_000 : realNow()));
    // The deadline passes as soon as the first chunk is saved
    const undo = afterCursorSave(() => {
      late = true;
    });
    try {
      await expect(pollImport(shopify.admin, conn.connectionId, FAR(), { chunkSize: 2 })).resolves.toBe("running");
    } finally {
      undo();
      now.mockRestore();
    }

    // The first chunk (9001 and 9002) is written and its cursor saved; nothing after it
    await expect(connectionRow()).resolves.toMatchObject({ importState: "running", importCursor: 2 });
    const first = await prisma.order.findMany({ select: { externalOrderId: true }, orderBy: { externalOrderId: "asc" } });
    expect(first.map((o) => o.externalOrderId)).toEqual(["gid://shopify/Order/9001", "gid://shopify/Order/9002"]);

    await expect(pollImport(shopify.admin, conn.connectionId, FAR(), { chunkSize: 2 })).resolves.toBe("done");

    const orders = await prisma.order.findMany({ select: { externalOrderId: true }, orderBy: { externalOrderId: "asc" } });
    expect(orders.map((o) => o.externalOrderId)).toEqual(KEPT);
    await expect(connectionRow()).resolves.toMatchObject({ importState: "done", importCursor: 8, importedCount: 3 });
    expect(file.fetches).toBe(2);
    expect(shopify.started).toHaveLength(1);
  });

  it("runs only the tier pass, without downloading the file again, once every order is written", async () => {
    const { conn, shopify } = await firstOpen();
    complete(shopify);
    const file = serveFile();
    const realNow = Date.now.bind(Date);
    let late = false;
    const now = vi.spyOn(Date, "now").mockImplementation(() => (late ? realNow() + 60 * 60_000 : realNow()));
    // The last chunk is saved, and then the deadline passes before the tier pass
    const undo = afterCursorSave((cursor) => {
      if (cursor === 8) late = true;
    });
    try {
      await expect(pollImport(shopify.admin, conn.connectionId, FAR(), { chunkSize: 2 })).resolves.toBe("running");
    } finally {
      undo();
      now.mockRestore();
    }
    await expect(connectionRow()).resolves.toMatchObject({ importState: "running", importCursor: 8 });

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");

    expect(file.fetches).toBe(1);
    // The unreadable order its last chunk met is still counted
    await expect(connectionRow()).resolves.toMatchObject({
      importState: "done",
      importedCount: 3,
      importError: "1 of 8 past orders could not be read, so their spend is not counted: 9008",
    });
  });

  it("uses up an attempt when the file's address answers 4xx on two polls in a row", async () => {
    const { conn, shopify } = await firstOpen();
    complete(shopify);
    const file = serveFile(FILE, { status: 403 });

    // The first refusal may pass: the next poll fetches again
    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).rejects.toThrow(/HTTP 403/);
    await expect(connectionRow()).resolves.toMatchObject({ importAttempts: 1, importFileRefusals: 1 });

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("running");

    expect(file.fetches).toBe(2);
    expect(shopify.started).toHaveLength(2);
    await expect(connectionRow()).resolves.toMatchObject({
      importAttempts: 2,
      importFileRefusals: 0,
      importOperationId: "gid://shopify/BulkOperation/2",
      importError: expect.stringContaining("HTTP 403"),
    });
  });

  it("forgets a refusal once the file answers", async () => {
    const { conn, shopify } = await firstOpen();
    complete(shopify);
    serveFile(FILE, { status: 404 });
    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).rejects.toThrow(/HTTP 404/);

    serveFile();
    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");

    await expect(connectionRow()).resolves.toMatchObject({ importAttempts: 1, importFileRefusals: 0, importState: "done" });
  });

  it("uses up an attempt on a file that can't be read, whatever was written before the bad line", async () => {
    const { conn, shopify } = await firstOpen();
    complete(shopify);
    const [first, ...rest] = FILE.split("\n");
    serveFile([first, "{not json", ...rest].join("\n"));

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("running");

    expect(shopify.started).toHaveLength(2);
    await expect(connectionRow()).resolves.toMatchObject({
      importAttempts: 2,
      importCursor: 0,
      importError: "The bulk file's line 2 is not JSON",
    });
  });

  it("restarts a bulk query Shopify failed up to 3 times, then fails with Shopify's error", async () => {
    const { conn, shopify } = await firstOpen();
    Object.assign(shopify.bulk, { status: "FAILED", errorCode: "TIMEOUT" });

    for (let restart = 1; restart <= 3; restart++) {
      await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("running");
      expect(shopify.started).toHaveLength(1 + restart);
      await expect(connectionRow()).resolves.toMatchObject({
        importState: "running",
        importOperationId: `gid://shopify/BulkOperation/${1 + restart}`,
        importAttempts: 1 + restart,
        importError: expect.stringContaining("TIMEOUT"),
      });
    }

    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("failed");
    expect(shopify.started).toHaveLength(4);
    await expect(connectionRow()).resolves.toMatchObject({ importState: "failed", importError: expect.stringContaining("TIMEOUT") });
    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("failed");
  });

  it("leaves an order from before install that the sweep recorded first earning nothing, and the import skips it", async () => {
    const { conn, shopify } = await firstOpen();
    await addTiers(conn.merchantId);
    expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
    const facts = liveFacts("gid://shopify/Order/9001");
    const orders: OrderSource = {
      readOrder: async () => facts,
      readRefund: async () => null,
      recentlyUpdatedOrders: async () => [
        { orderGid: facts.externalOrderId, hasCustomer: true, test: false, orderedAt: facts.orderedAt, cancelledAt: null, refunds: [] },
      ],
    };
    const rail = { credit: vi.fn(), debit: vi.fn(), balance: vi.fn(), creditHistory: vi.fn() } as unknown as PayoutRail;

    const swept = await runPayoutCheck({ now: new Date(), railFor: async () => ({ rail, orders }), deadline: FAR() });

    expect(swept).toMatchObject({ swept: 1, problems: 0 });
    await expect(prisma.order.findFirstOrThrow()).resolves.toMatchObject({ source: "live", noCashbackReason: "before_install" });
    await expect(prisma.ledgerEntry.count()).resolves.toBe(0);

    complete(shopify);
    serveFile();
    await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");

    const rows = await prisma.order.findMany({ where: { externalOrderId: "gid://shopify/Order/9001" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("live");
    await expect(prisma.ledgerEntry.count()).resolves.toBe(0);
    expect(rail.credit).not.toHaveBeenCalled();
    await expect(connectionRow()).resolves.toMatchObject({ importState: "done", importedCount: 2 });
  });

  it("answers an imported order that orders/paid delivers later as already recorded, earning nothing", async () => {
    const { conn, shopify } = await firstOpen();
    await addTiers(conn.merchantId);
    complete(shopify);
    serveFile();
    await pollImport(shopify.admin, conn.connectionId, FAR());
    expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
    const running: ConnectionContext = { ...conn, running: true };

    const delivered = await recordOrder(running, liveFacts("gid://shopify/Order/9001"), "live");

    expect(delivered).toMatchObject({ status: "already_recorded" });
    await expect(prisma.ledgerEntry.count()).resolves.toBe(0);
    await expect(prisma.order.count({ where: { externalOrderId: "gid://shopify/Order/9001" } })).resolves.toBe(1);
  });

  describe("refunds made while the import runs (Ruling 49)", () => {
    const REFUND = "gid://shopify/Refund/9901";

    /** Fixture order `gid` as RewardsOrderFacts answers it now, with `refunds` on it. */
    function orderAnswer(gid: string, refunds: string[]): FixtureAnswer {
      const node = parseBulkLines(FILE.split("\n")).find((n) => (n as { id: string }).id === gid) as Record<string, unknown>;
      const lineItems = node.lineItems as { nodes: unknown[] };
      return {
        data: {
          shop: { currencyCode: "GBP" },
          order: { ...node, lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: lineItems.nodes }, refunds: refunds.map((id) => ({ id })) },
        },
      };
    }

    /** A refund of £10 of money (no items, no shipping) of order 9001, made at `at`. */
    function moneyRefund(at: Date): FixtureAnswer {
      return {
        data: {
          refund: {
            id: REFUND,
            createdAt: at.toISOString(),
            order: { id: "gid://shopify/Order/9001" },
            refundLineItems: { pageInfo: { hasNextPage: false }, nodes: [] },
            transactions: { nodes: [{ kind: "REFUND", status: "SUCCESS", amountSet: { shopMoney: { amount: "10.00" }, presentmentMoney: { amount: "10.00" } } }] },
            refundShippingLines: { nodes: [] },
          },
        },
      };
    }

    const refundOf9001 = () =>
      prisma.order.findFirstOrThrow({ where: { externalOrderId: "gid://shopify/Order/9001" }, select: { shopRefundedProductAmount: true, refundedProductAmount: true } });

    it("answers 503 for a refund of a past order not written yet, and counts it once the import has written the order", async () => {
      const { conn, shopify } = await firstOpen();
      await seedOfflineSession(SHOP);
      mockOrderFacts(SHOP, { orders: [orderAnswer("gid://shopify/Order/9001", [REFUND])], refunds: [moneyRefund(new Date())] });
      const { action } = await import("~/routes/webhooks.orders.refunded");
      const deliver = () =>
        action({ request: signedWebhook("refunds/create", SHOP, { id: 9901, order_id: 9001 }), params: {}, context: {} } as never);

      // The order is months old, but the import that will write it is still running
      await expect(deliver()).resolves.toMatchObject({ status: 503 });
      await expect(prisma.refund.count()).resolves.toBe(0);

      complete(shopify);
      serveFile();
      await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");
      await expect(refundOf9001()).resolves.toMatchObject({ shopRefundedProductAmount: new Prisma.Decimal(0) });

      // Shopify's retry, after the import: made after the bulk query began, so it is not in the quantities
      await expect(deliver()).resolves.toMatchObject({ status: 200 });
      await flushWaitUntil();
      const order = await refundOf9001();
      expect(order.shopRefundedProductAmount.toFixed(2)).toBe("10.00");
      await expect(prisma.refund.count()).resolves.toBe(1);
    });

    it("answers 200 for a refund of a past order once the import is done", async () => {
      const { conn, shopify } = await firstOpen();
      await seedOfflineSession(SHOP);
      await prisma.connection.update({ where: { id: conn.connectionId }, data: { importState: "done" } });
      mockOrderFacts(SHOP, { orders: [orderAnswer("gid://shopify/Order/9001", [REFUND])], refunds: [moneyRefund(new Date())] });
      const { action } = await import("~/routes/webhooks.orders.refunded");

      const response = await action({ request: signedWebhook("refunds/create", SHOP, { id: 9901, order_id: 9001 }), params: {}, context: {} } as never);

      expect(response.status).toBe(200);
      expect(shopify.started).toHaveLength(1);
    });

    it("records a refund made before the bulk query began without counting it again", async () => {
      const { conn, shopify } = await firstOpen();
      complete(shopify);
      serveFile();
      await expect(pollImport(shopify.admin, conn.connectionId, FAR())).resolves.toBe("done");
      const { importStartedAt } = await connectionRow();
      const facts = (at: Date) => ({
        externalRefundId: REFUND,
        refundedAt: at,
        completesOrder: false,
        productValue: { amount: new Money("10.00"), shopAmount: new Money("10.00") },
      });

      // Its webhook delivered late: the bulk file's quantities already count it
      await expect(recordRefund(conn, "gid://shopify/Order/9001", facts(new Date(importStartedAt!.getTime() - 1000)))).resolves.toMatchObject({
        status: "recorded",
      });

      expect((await refundOf9001()).shopRefundedProductAmount.toFixed(2)).toBe("0.00");
      await expect(prisma.refund.findFirstOrThrow()).resolves.toMatchObject({ externalRefundId: REFUND });
      // A redelivery writes nothing
      await expect(recordRefund(conn, "gid://shopify/Order/9001", facts(new Date()))).resolves.toEqual({ status: "already_recorded" });
      expect((await refundOf9001()).shopRefundedProductAmount.toFixed(2)).toBe("0.00");
    });
  });

  describe("polled by the hourly job", () => {
    /** Shopify's Admin GraphQL for SHOP through MSW, as unauthenticated.admin reaches it. */
    function mockShopifyForCron(bulk: Partial<Bulk>) {
      const asked: string[] = [];
      const link = graphql.link(adminGraphqlUrl(SHOP));
      server.use(
        link.query("RewardsBulkStatus", ({ variables }) => {
          asked.push(String(variables.id));
          return HttpResponse.json({
            data: {
              bulkOperation: { id: variables.id, status: "COMPLETED", errorCode: null, url: FILE_URL, objectCount: "17", rootObjectCount: "8", ...bulk },
            },
          });
        }),
        link.query("RewardsUpdatedOrders", () =>
          HttpResponse.json({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } }),
        ),
      );
      return asked;
    }

    it("polls each running import through the store's offline session", async () => {
      await firstOpen();
      await seedOfflineSession(SHOP);
      const asked = mockShopifyForCron({});
      serveFile();

      await expect(pollRunningImports(FAR())).resolves.toEqual({ polled: 1, failed: 0 });

      expect(asked).toEqual(["gid://shopify/BulkOperation/1"]);
      await expect(connectionRow()).resolves.toMatchObject({ importState: "done", importedCount: 3 });
      // Nothing left running
      await expect(pollRunningImports(FAR())).resolves.toEqual({ polled: 0, failed: 0 });
    });

    it("counts a poll that fails as a problem of the hourly run (A17-F3)", async () => {
      await firstOpen();
      await seedOfflineSession(SHOP);
      mockShopifyForCron({});
      server.use(
        graphql.link(adminGraphqlUrl(SHOP)).query("RewardsBulkStatus", () => HttpResponse.json({ errors: [{ message: "Internal error" }] })),
      );
      process.env.CRON_SECRET = CRON_SECRET;
      const { loader } = await import("~/routes/api.cron.payouts");

      await expect(pollRunningImports(FAR())).resolves.toMatchObject({ polled: 0, failed: 1, firstProblem: expect.any(Error) });

      const response = await loader({
        request: new Request("https://test.example.com/api/cron/payouts", { headers: { Authorization: `Bearer ${CRON_SECRET}` } }),
        params: {},
        context: {},
      } as never);
      await expect(response.json()).resolves.toMatchObject({ success: true, importsPolled: 0, importsFailed: 1, problems: 1 });
      const partial = await prisma.cronRun.findUniqueOrThrow({ where: { job_outcome: { job: "payouts", outcome: "partial" } } });
      expect(partial.errorMessage).toMatch(/^1 failed; first: .*Internal error/);
    });

    it("runs after the payout check in the hourly route", async () => {
      await firstOpen();
      await seedOfflineSession(SHOP);
      mockShopifyForCron({ status: "RUNNING", url: null });
      process.env.CRON_SECRET = CRON_SECRET;
      const { loader } = await import("~/routes/api.cron.payouts");

      const response = await loader({
        request: new Request("https://test.example.com/api/cron/payouts", { headers: { Authorization: `Bearer ${CRON_SECRET}` } }),
        params: {},
        context: {},
      } as never);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ success: true, importsPolled: 1 });
      await expect(connectionRow()).resolves.toMatchObject({ importState: "running" });
    });
  });
});
