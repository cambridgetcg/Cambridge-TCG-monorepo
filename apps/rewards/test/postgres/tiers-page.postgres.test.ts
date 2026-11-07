import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient } from "~/db.server";
import { acquireCronLock, releaseCronLock } from "~/lib/cron.server";
import { type ConnectionContext, ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { deleteTier, lockTier, requestTierPass, resolveTier, tierPassPending } from "~/lib/tiers.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { hasTestDatabase, resetDatabase, waitForLockWaitOr } from "./helpers/database";

/**
 * The Tiers page (spec 4.5): its validation, and what a save, a delete or a
 * change of window does to buyers' tiers and to the widget's app metafield.
 * The admin session is the library's job (requireMerchant), so it is
 * replaced here by the store's connection and a stand-in Admin API client
 * that answers by operation name, as in the Home tests.
 */

vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));
// The real deleteTier, which a test can make lose a deadlock (M3b-F5)
vi.mock("~/lib/tiers.server", async (original) => {
  const actual = await original<typeof import("~/lib/tiers.server")>();
  return { ...actual, deleteTier: vi.fn(actual.deleteTier) };
});

const SHOP = "tiers-page.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;
const APP_INSTALLATION = "gid://shopify/AppInstallation/77";

type Call = { operation: string; variables: Record<string, unknown> };

/** An Admin API client that answers the widget's two documents and records each call. */
function fakeAdmin(): GraphqlClient & { calls: Call[] } {
  const calls: Call[] = [];
  const answers: Record<string, unknown> = {
    RewardsAppInstallation: { data: { currentAppInstallation: { id: APP_INSTALLATION } } },
    RewardsWidgetConfig: { data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } } },
  };
  return {
    calls,
    async graphql(query, options) {
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
      calls.push({ operation, variables: options?.variables ?? {} });
      const answer = answers[operation];
      if (answer === undefined) throw new Error(`The test answers no ${operation}`);
      return { json: async () => answer };
    },
  };
}

/** The widget config each RewardsWidgetConfig call wrote. */
const widgetValues = (admin: { calls: Call[] }) =>
  admin.calls
    .filter((call) => call.operation === "RewardsWidgetConfig")
    .map((call) => JSON.parse((call.variables.metafields as Array<{ value: string }>)[0].value));

type TiersRoute = typeof import("~/routes/app.tiers");
let route: TiersRoute;
let requireMerchant: ReturnType<typeof vi.fn>;

async function signIn(admin: GraphqlClient) {
  const signedIn = (await findConnection(SHOP))!;
  requireMerchant.mockResolvedValue({ admin, session: { shop: SHOP }, conn: signedIn });
}

async function load() {
  await signIn(fakeAdmin());
  return (await route.loader({ request: new Request("https://test.example.com/app/tiers"), params: {}, context: {} } as never)) as Exclude<
    Awaited<ReturnType<TiersRoute["loader"]>>,
    Response
  >;
}

type Result = { ok: boolean; errors?: Record<string, string> };

/** The version of `tierId` the page shows now: what an edit opened now posts (CONCURRENCY-3). */
async function versionOf(tierId: string): Promise<string> {
  const tier = (await load()).tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`no tier ${tierId} on the page`);
  return tier.version;
}

/** Save an edit of `tierId` as a form opened now would: with the version the page shows. */
async function edit(tierId: string, fields: Record<string, string>, admin: GraphqlClient = fakeAdmin()): Promise<Result> {
  return act({ intent: "save", id: tierId, ...fields, version: await versionOf(tierId) }, admin);
}

async function act(fields: Record<string, string>, admin: GraphqlClient = fakeAdmin()): Promise<Result> {
  await signIn(admin);
  const request = new Request("https://test.example.com/app/tiers", { method: "POST", body: new URLSearchParams(fields) });
  const result = await route.action({ request, params: {}, context: {} } as never);
  // A 400 comes back wrapped by data()
  if (result && typeof result === "object" && "type" in result && (result as { type: string }).type === "DataWithResponseInit") {
    const wrapped = result as unknown as { data: Result; init: { status?: number } };
    return { ...wrapped.data, status: wrapped.init.status } as Result;
  }
  return result as Result;
}

let conn: ConnectionContext;
let bronze: { id: string };
let silver: { id: string };
let gold: { id: string };

const addTier = (merchantId: string, name: string, minSpend: string, percent: string, position: number) =>
  prisma.tier.create({
    data: { merchantId, name, minSpend: new Prisma.Decimal(minSpend), cashbackPercent: new Prisma.Decimal(percent), position },
    select: { id: true },
  });

let buyerNumber = 0;
const addBuyer = (o: { tierId?: string | null; lockedTierId?: string | null } = {}) =>
  prisma.customer.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      externalCustomerId: String(8000 + ++buyerNumber),
      tierId: o.tierId === undefined ? bronze.id : o.tierId,
      tierSince: new Date("2025-01-01T00:00:00Z"),
      lockedTierId: o.lockedTierId ?? null,
    },
    select: { id: true },
  });

let orderNumber = 0;
/** An order of `amount` of products in the shop's currency, `daysAgo` days ago. */
async function addOrder(customerId: string, amount: string, daysAgo: number) {
  orderNumber++;
  const at = new Date(Date.now() - daysAgo * DAY);
  await prisma.order.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${5000 + orderNumber}`,
      name: `#${5000 + orderNumber}`,
      source: "live",
      currency: "GBP",
      totalAmount: amount,
      productAmount: amount,
      shopProductAmount: amount,
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: amount,
      orderedAt: at,
      paidAt: at,
      test: false,
    },
  });
}

const buyerRow = (id: string) =>
  prisma.customer.findUniqueOrThrow({ where: { id }, select: { tierId: true, lockedTierId: true, tierSince: true } });

/** The merchant's tiers, lowest first, as plain values. */
const tierValues = async (merchantId = conn.merchantId) =>
  (await prisma.tier.findMany({ where: { merchantId }, orderBy: { minSpend: "asc" } })).map((t) => ({
    name: t.name,
    minSpend: new Money(t.minSpend.toString()).toFixed(),
    percent: new Money(t.cashbackPercent.toString()).toFixed(),
  }));

const passRequestedAt = async () =>
  (await prisma.connection.findUniqueOrThrow({ where: { id: conn.connectionId } })).tierPassRequestedAt;

/** What the console printed until the test ends, kept out of the test output. */
function captureLogs(): string[] {
  const logged: string[] = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => void logged.push(parts.map(String).join(" ")));
  }
  return logged;
}

type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };
const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    (value) => ({ status: "fulfilled", value }) as const,
    (reason: unknown) => ({ status: "rejected", reason }) as const,
  );

/**
 * Delete `tierId` on a client of its own (the app's pool has one
 * connection), held once it has read the tier's members, while `race()`
 * starts on the app's client, until that is waiting on a lock or has
 * finished. Both results, settled.
 */
async function deleteRacing<T>(tierId: string, race: () => Promise<T>) {
  const deleteClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);
  const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
  let raced: Promise<T> | null = null;
  const held = deleteClient.$extends({
    query: {
      customer: {
        async findMany({ args, query }) {
          const members = await query(args);
          if (!raced) {
            raced = race();
            raced.catch(() => {});
            await waitForLockWaitOr(watcher, raced);
          }
          return members;
        },
      },
    },
  }) as unknown as PrismaClient;
  try {
    const deleted = await settle(deleteTier(conn.merchantId, tierId, held));
    if (!raced) throw new Error("the delete never read its members");
    return { deleted, raced: await settle<T>(raced) };
  } finally {
    await deleteClient.$disconnect();
    await watcher.$disconnect();
  }
}

describe.skipIf(!hasTestDatabase)("Tiers page", () => {
  beforeEach(async () => {
    await resetDatabase();
    await ensureMerchant({ shop: SHOP, name: "Tiers Page", currency: "GBP", timezone: "Europe/London", now: new Date("2024-01-01T00:00:00Z") });
    conn = (await findConnection(SHOP))!;
    bronze = await addTier(conn.merchantId, "Bronze", "0", "5", 0);
    silver = await addTier(conn.merchantId, "Silver", "200", "7", 1);
    gold = await addTier(conn.merchantId, "Gold", "500", "10", 2);
    if (!route) {
      route = await import("~/routes/app.tiers");
      ({ requireMerchant } = (await import("~/admin/require-merchant.server")) as unknown as { requireMerchant: ReturnType<typeof vi.fn> });
    }
  });

  afterEach(async () => {
    await flushWaitUntil();
    requireMerchant?.mockReset();
    vi.mocked(deleteTier).mockClear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists the tiers lowest first with their members, and the window", async () => {
    await addBuyer();
    await addBuyer({ tierId: gold.id });
    await addBuyer({ tierId: gold.id });
    // A buyer erased by customers/redact keeps their row, but is no member (TRUTH-9)
    await prisma.customer.create({ data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId: null, tierId: gold.id } });

    const page = await load();

    expect(page.currency).toBe("GBP");
    expect(page.tierWindow).toBe("rolling_12_months");
    expect(page.tiers).toEqual([
      { id: bronze.id, name: "Bronze", minSpend: "0", percent: "5", members: 1, lowest: true, version: expect.any(String) },
      { id: silver.id, name: "Silver", minSpend: "200", percent: "7", members: 0, lowest: false, version: expect.any(String) },
      { id: gold.id, name: "Gold", minSpend: "500", percent: "10", members: 2, lowest: false, version: expect.any(String) },
    ]);
    expect(page.moving).toBe(false);
  });

  describe("validation", () => {
    it("needs a name of at most 40 characters", async () => {
      for (const name of ["", "   "]) {
        expect(await act({ intent: "save", name, minSpend: "800", percent: "12" })).toEqual({ ok: false, errors: { name: "Enter a name." } });
      }
      expect(await act({ intent: "save", name: "x".repeat(41), minSpend: "800", percent: "12" })).toEqual({
        ok: false,
        errors: { name: "Use 40 characters or fewer." },
      });
      expect(await tierValues()).toHaveLength(3);

      expect(await act({ intent: "save", name: ` ${"P".repeat(40)} `, minSpend: "800", percent: "12" })).toEqual({ ok: true });
      expect((await tierValues()).at(-1)).toEqual({ name: "P".repeat(40), minSpend: "800", percent: "12" });
    });

    it("needs a whole minimum spend of at least 0", async () => {
      for (const minSpend of ["", "-1", "10.5", "1e3", "abc"]) {
        expect(await act({ intent: "save", name: "Platinum", minSpend, percent: "12" })).toEqual({
          ok: false,
          errors: { minSpend: "Enter a whole number of 0 or more." },
        });
      }
      expect(await tierValues()).toHaveLength(3);
    });

    it("keeps each minimum spend unique within the merchant, in the form and in the database", async () => {
      expect(await act({ intent: "save", name: "Gold too", minSpend: "500", percent: "12" })).toEqual({
        ok: false,
        errors: { minSpend: "Another tier has this minimum spend." },
      });
      // Moving Silver onto Gold's minimum, or onto the lowest tier's 0
      for (const minSpend of ["500", "0"]) {
        expect(await edit(silver.id, { name: "Silver", minSpend, percent: "7" })).toEqual({
          ok: false,
          errors: { minSpend: "Another tier has this minimum spend." },
        });
      }
      expect(await tierValues()).toEqual([
        { name: "Bronze", minSpend: "0", percent: "5" },
        { name: "Silver", minSpend: "200", percent: "7" },
        { name: "Gold", minSpend: "500", percent: "10" },
      ]);

      // The database refuses a second tier at the same minimum (500.0000 is 500); Prisma logs the refusal
      const logged = captureLogs();
      await expect(addTier(conn.merchantId, "Gold again", "500.0000", "12", 3)).rejects.toMatchObject({ code: "P2002" });
      expect(logged.join("\n")).toMatch(/Unique constraint failed on the fields: \(`merchant_id`,`min_spend`\)/);

      // Another merchant may use the same minimums
      await ensureMerchant({ shop: "other-tiers-page.myshopify.com", name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection("other-tiers-page.myshopify.com"))!;
      await expect(addTier(other.merchantId, "Theirs", "500", "3", 0)).resolves.toBeTruthy();
    });

    it("fixes the lowest tier's minimum at 0", async () => {
      // An edit of the lowest tier keeps its minimum, whatever the form sends
      expect(await edit(bronze.id, { name: "Everyone", minSpend: "100", percent: "4" })).toEqual({ ok: true });
      expect(await edit(bronze.id, { name: "Everyone", percent: "4" })).toEqual({ ok: true });
      expect((await tierValues())[0]).toEqual({ name: "Everyone", minSpend: "0", percent: "4" });

      // A store's first tier starts at 0
      await prisma.customer.deleteMany({});
      await prisma.tier.deleteMany({ where: { merchantId: conn.merchantId } });
      expect(await act({ intent: "save", name: "Members", minSpend: "250", percent: "3" })).toEqual({ ok: true });
      expect(await tierValues()).toEqual([{ name: "Members", minSpend: "0", percent: "3" }]);
    });

    it("needs the minimum spend of any other tier", async () => {
      expect(await edit(silver.id, { name: "Silver", percent: "7" })).toEqual({
        ok: false,
        errors: { minSpend: "Enter a whole number of 0 or more." },
      });
    });

    it("takes a whole cashback percent from 0 to 100", async () => {
      for (const percent of ["", "-1", "4.5", "101", "ten"]) {
        expect(await act({ intent: "save", name: "Platinum", minSpend: "900", percent })).toEqual({
          ok: false,
          errors: { percent: "Enter a whole number from 0 to 100." },
        });
      }
      expect(await act({ intent: "save", name: "Free", minSpend: "800", percent: "0" })).toEqual({ ok: true });
      expect(await act({ intent: "save", name: "All", minSpend: "900", percent: "100" })).toEqual({ ok: true });
      expect((await tierValues()).slice(3)).toEqual([
        { name: "Free", minSpend: "800", percent: "0" },
        { name: "All", minSpend: "900", percent: "100" },
      ]);
    });

    it("says every field's problem at once", async () => {
      expect(await act({ intent: "save", name: "", minSpend: "x", percent: "200" })).toEqual({
        ok: false,
        errors: { name: "Enter a name.", minSpend: "Enter a whole number of 0 or more.", percent: "Enter a whole number from 0 to 100." },
      });
    });

    it("can't delete the lowest tier, nor so the last tier while cashback is on", async () => {
      expect(await act({ intent: "delete", id: bronze.id })).toEqual({
        ok: false,
        errors: { form: "The lowest tier can't be deleted: every buyer starts there." },
      });

      // The store's only tier, with the switch on
      await prisma.customer.deleteMany({});
      await prisma.tier.deleteMany({ where: { id: { in: [silver.id, gold.id] } } });
      expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
      expect(await act({ intent: "delete", id: bronze.id })).toEqual({
        ok: false,
        errors: { form: "The lowest tier can't be deleted: every buyer starts there." },
      });
      expect(await tierValues()).toEqual([{ name: "Bronze", minSpend: "0", percent: "5" }]);
      expect((await prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } })).running).toBe(true);
      expect(await passRequestedAt()).toBeNull();
    });

    it("refuses another merchant's tier or one that is gone, and changes nothing", async () => {
      await ensureMerchant({ shop: "other-tiers-page.myshopify.com", name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection("other-tiers-page.myshopify.com"))!;
      const theirs = await addTier(other.merchantId, "Theirs", "0", "3", 0);
      const theirsToo = await addTier(other.merchantId, "Theirs too", "100", "4", 1);
      const gone = { form: "This tier is no longer there. Reload the page." };

      for (const id of [theirsToo.id, "00000000-0000-4000-8000-000000000000", "not-a-tier"]) {
        expect(await act({ intent: "save", id, name: "Mine now", minSpend: "700", percent: "50" })).toEqual({ ok: false, errors: gone });
        expect(await act({ intent: "delete", id })).toEqual({ ok: false, errors: gone });
      }
      expect(await tierValues(other.merchantId)).toEqual([
        { name: "Theirs", minSpend: "0", percent: "3" },
        { name: "Theirs too", minSpend: "100", percent: "4" },
      ]);
      expect(theirs).toBeTruthy();
      expect(await tierValues()).toHaveLength(3);
    });

    // CONCURRENCY-3: an edit says which version of the tier it was made on
    it("refuses an edit made on a tier another save changed since, and keeps that save", async () => {
      const tabA = await versionOf(gold.id);

      expect(await edit(gold.id, { name: "Gold", minSpend: "500", percent: "12" })).toEqual({ ok: true });
      expect(await act({ intent: "save", id: gold.id, name: "Gold+", minSpend: "500", percent: "10", version: tabA })).toEqual({
        ok: false,
        errors: { form: "This tier changed since you opened it. Reload the page." },
      });
      // An edit with no version is refused the same way
      expect(await act({ intent: "save", id: gold.id, name: "Gold+", minSpend: "500", percent: "10" })).toEqual({
        ok: false,
        errors: { form: "This tier changed since you opened it. Reload the page." },
      });
      expect((await tierValues()).at(-1)).toEqual({ name: "Gold", minSpend: "500", percent: "12" });
    });

    it("answers 400 to an unknown action or window", async () => {
      expect(await act({ intent: "recalculate" })).toMatchObject({ ok: false, status: 400 });
      expect(await act({ intent: "window", tierWindow: "monthly" })).toMatchObject({ ok: false, status: 400 });
    });
  });

  describe("after a save, a delete or a window change", () => {
    it("deleting a tier moves its members, buyers locked to it included, in the delete's own transaction", async () => {
      const member = await addBuyer({ tierId: silver.id });
      await addOrder(member.id, "300.00", 30);
      // Locked to Silver while spending enough for Gold
      const locked = await addBuyer({ tierId: silver.id, lockedTierId: silver.id });
      await addOrder(locked.id, "600.00", 30);
      // Locked to Silver, but not yet resolved into it
      const lockedOnly = await addBuyer({ tierId: bronze.id, lockedTierId: silver.id });
      const bystander = await addBuyer({ tierId: gold.id });
      await addOrder(bystander.id, "700.00", 30);

      // A delete that fails at its last step moves no one
      const failing = createPrismaClient(process.env.REWARDS_DATABASE_URL);
      try {
        const broken = failing.$extends({
          query: { tier: { delete: async () => Promise.reject(new Error("connection dropped")) } },
        }) as unknown as PrismaClient;
        await expect(deleteTier(conn.merchantId, silver.id, broken)).rejects.toThrow("connection dropped");
      } finally {
        await failing.$disconnect();
      }
      expect(await buyerRow(member.id)).toMatchObject({ tierId: silver.id, lockedTierId: null });
      expect(await buyerRow(locked.id)).toMatchObject({ tierId: silver.id, lockedTierId: silver.id });
      expect(await buyerRow(lockedOnly.id)).toMatchObject({ tierId: bronze.id, lockedTierId: silver.id });

      expect(await deleteTier(conn.merchantId, silver.id)).toEqual({ ok: true, moved: 3 });
      // Moved before any pass runs
      expect(await buyerRow(member.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
      expect(await buyerRow(locked.id)).toMatchObject({ tierId: gold.id, lockedTierId: null });
      expect(await buyerRow(lockedOnly.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
      expect(await buyerRow(bystander.id)).toMatchObject({ tierId: gold.id });
      expect(await tierValues()).toEqual([
        { name: "Bronze", minSpend: "0", percent: "5" },
        { name: "Gold", minSpend: "500", percent: "10" },
      ]);
    });

    it("deleting through the page asks for a pass and tells the widget", async () => {
      const member = await addBuyer({ tierId: silver.id });
      const admin = fakeAdmin();
      const before = new Date();

      expect(await act({ intent: "delete", id: silver.id }, admin)).toEqual({ ok: true });
      await flushWaitUntil();

      expect(await buyerRow(member.id)).toMatchObject({ tierId: bronze.id });
      expect((await passRequestedAt())!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(widgetValues(admin)).toEqual([{ running: false, basePercent: 5 }]);
    });

    // M3b-F5: Postgres picks the delete to abort when it deadlocks with a resolve (Ruling 61)
    describe("a delete Postgres aborts to break a deadlock", () => {
      const deadlock = () =>
        new Prisma.PrismaClientUnknownRequestError("Error occurred during query execution: ConnectorError(... code: \"40P01\", message: \"deadlock detected\" ...)", {
          clientVersion: Prisma.prismaVersion.client,
        });

      it("is tried once more, and then deletes the tier", async () => {
        const member = await addBuyer({ tierId: silver.id });
        vi.mocked(deleteTier).mockRejectedValueOnce(deadlock());

        expect(await act({ intent: "delete", id: silver.id })).toEqual({ ok: true });
        await flushWaitUntil();

        expect(vi.mocked(deleteTier)).toHaveBeenCalledTimes(2);
        expect(await buyerRow(member.id)).toMatchObject({ tierId: bronze.id });
        expect((await tierValues()).map((t) => t.name)).toEqual(["Bronze", "Gold"]);
      });

      it("says so in the form's plain words when it loses twice, with nothing changed", async () => {
        const member = await addBuyer({ tierId: silver.id });
        vi.mocked(deleteTier).mockRejectedValueOnce(deadlock()).mockRejectedValueOnce(deadlock());
        const admin = fakeAdmin();
        const logged = captureLogs();

        expect(await act({ intent: "delete", id: silver.id }, admin)).toEqual({ ok: false, errors: { form: "The tier couldn't be deleted just now. Try again." } });

        expect(vi.mocked(deleteTier)).toHaveBeenCalledTimes(2);
        expect(await buyerRow(member.id)).toMatchObject({ tierId: silver.id });
        expect((await tierValues()).map((t) => t.name)).toEqual(["Bronze", "Silver", "Gold"]);
        expect(await passRequestedAt()).toBeNull();
        expect(widgetValues(admin)).toEqual([]);
        expect(logged).toEqual([expect.stringMatching(/deadlocked twice/)]);
      });

      it("isn't tried again for any other failure", async () => {
        vi.mocked(deleteTier).mockRejectedValueOnce(new Error("Connection reset"));
        await expect(act({ intent: "delete", id: silver.id })).rejects.toThrow("Connection reset");
        expect(vi.mocked(deleteTier)).toHaveBeenCalledTimes(1);
      });
    });

    it("raising a minimum re-places buyers", async () => {
      const buyer = await addBuyer({ tierId: silver.id });
      await addOrder(buyer.id, "300.00", 30);
      const admin = fakeAdmin();
      const before = new Date();

      expect(await edit(silver.id, { name: "Silver", minSpend: "400", percent: "7" }, admin)).toEqual({ ok: true });
      await flushWaitUntil();

      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id });
      expect((await passRequestedAt())!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(widgetValues(admin)).toEqual([{ running: false, basePercent: 5 }]);
    });

    it("adding a tier re-places buyers, and a new base rate reaches the widget", async () => {
      const buyer = await addBuyer({ tierId: gold.id });
      await addOrder(buyer.id, "1200.00", 30);

      expect(await act({ intent: "save", name: "Platinum", minSpend: "1000", percent: "15" })).toEqual({ ok: true });
      await flushWaitUntil();
      const platinum = await prisma.tier.findFirstOrThrow({ where: { merchantId: conn.merchantId, name: "Platinum" } });
      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: platinum.id });
      expect(platinum.position).toBe(3);

      const admin = fakeAdmin();
      expect(await edit(bronze.id, { name: "Bronze", percent: "6" }, admin)).toEqual({ ok: true });
      expect(widgetValues(admin)).toEqual([{ running: false, basePercent: 6 }]);
    });

    it("changing the window re-places buyers", async () => {
      const buyer = await addBuyer({ tierId: bronze.id });
      // Spent 400 days ago: all time counts it, the last 12 months don't
      await addOrder(buyer.id, "600.00", 400);
      const admin = fakeAdmin();

      expect(await act({ intent: "window", tierWindow: "lifetime" }, admin)).toEqual({ ok: true });
      await flushWaitUntil();
      expect((await prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } })).tierWindow).toBe("lifetime");
      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: gold.id });
      expect(widgetValues(admin)).toHaveLength(1);

      // A20-F5: the pass takes buyers resolved strictly before it asked (A12's
      // resolvedBefore is a strict `<`), so a buyer resolved in the same
      // millisecond as the request waits for the nightly pass. That is A12's
      // behaviour, kept on purpose: the 1 s backdate keeps this test clear of
      // that rare collision rather than hiding it.
      await prisma.customer.update({ where: { id: buyer.id }, data: { resolvedAt: new Date(Date.now() - 1000) } });
      expect(await act({ intent: "window", tierWindow: "rolling_12_months" })).toEqual({ ok: true });
      await flushWaitUntil();
      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id });
    });
  });

  describe("races", () => {
    it("a resolve writing the tier being deleted waits for the delete, then starts over (CONCURRENCY-6)", async () => {
      // Spends enough for Silver; not yet resolved
      const buyer = await addBuyer({ tierId: bronze.id });
      await addOrder(buyer.id, "300.00", 30);
      // Prisma logs the resolve's refused write before it starts over
      const logged = captureLogs();

      const { deleted, raced } = await deleteRacing(silver.id, () => resolveTier(buyer.id));

      expect(deleted).toEqual({ status: "fulfilled", value: { ok: true, moved: 0 } });
      expect(raced).toEqual({ status: "fulfilled", value: { changed: false, tierId: bronze.id } });
      expect(logged.join("\n")).toMatch(/customer_merchant_id_tier_id_fkey/);
      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id });
      expect(await prisma.tier.count({ where: { id: silver.id } })).toBe(0);
    });

    it("two deletes at once each move the other's members", async () => {
      // Locked to Silver, spends enough for Gold
      const first = await addBuyer({ tierId: silver.id, lockedTierId: silver.id });
      await addOrder(first.id, "600.00", 30);
      // Locked to Gold, spends enough for Silver
      const second = await addBuyer({ tierId: gold.id, lockedTierId: gold.id });
      await addOrder(second.id, "300.00", 30);

      const { deleted, raced } = await deleteRacing(silver.id, () => deleteTier(conn.merchantId, gold.id));

      expect(deleted).toEqual({ status: "fulfilled", value: { ok: true, moved: 1 } });
      expect(raced).toEqual({ status: "fulfilled", value: { ok: true, moved: 2 } });
      expect(await buyerRow(first.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
      expect(await buyerRow(second.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
      expect(await tierValues()).toEqual([{ name: "Bronze", minSpend: "0", percent: "5" }]);
    });

    // Ruling 61 (A20-F1): a resolve that deadlocks with the delete starts over
    it("an outside resolve of a buyer locked to the tier being deleted starts over instead of failing", async () => {
      // Locked to Silver, not yet holding it, with no spend
      const lockedOnly = await addBuyer({ tierId: bronze.id, lockedTierId: silver.id });
      // Prisma logs the refused statement before the resolve starts over
      const logged = captureLogs();

      const { deleted, raced } = await deleteRacing(silver.id, () => resolveTier(lockedOnly.id));

      expect(deleted).toEqual({ status: "fulfilled", value: { ok: true, moved: 1 } });
      expect(raced).toEqual({ status: "fulfilled", value: { changed: false, tierId: bronze.id } });
      expect(logged.join("\n")).toMatch(/deadlock/i);
      expect(await buyerRow(lockedOnly.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
      expect(await prisma.tier.count({ where: { id: silver.id } })).toBe(0);
    });

    // Ruling 61 (A20 concern 2): lockTier waits for the delete, then finds the tier gone
    it("a lock to the tier being deleted waits for the delete and is refused as gone", async () => {
      const buyer = await addBuyer({ tierId: bronze.id });

      const { deleted, raced } = await deleteRacing(silver.id, () => lockTier(conn.merchantId, buyer.id, silver.id));

      expect(deleted).toEqual({ status: "fulfilled", value: { ok: true, moved: 0 } });
      expect(raced).toEqual({ status: "fulfilled", value: { ok: false } });
      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
    });

    // Ruling 61 (CONCURRENCY-4): Return to automatic during a delete resolves against the tiers left
    it("Return to automatic for a buyer whose spend qualifies for the tier being deleted waits, then resolves", async () => {
      const buyer = await addBuyer({ tierId: bronze.id, lockedTierId: bronze.id });
      // Qualifies for Silver
      await addOrder(buyer.id, "300.00", 30);

      const { deleted, raced } = await deleteRacing(silver.id, () => lockTier(conn.merchantId, buyer.id, null));

      expect(deleted).toEqual({ status: "fulfilled", value: { ok: true, moved: 0 } });
      expect(raced).toEqual({ status: "fulfilled", value: { ok: true } });
      expect(await buyerRow(buyer.id)).toMatchObject({ tierId: bronze.id, lockedTierId: null });
    });
  });

  // Ruling 77 (OPERATIONS-3): a pass only for a change that can move buyers, one at a time per store
  describe("tier passes", () => {
    it("asks for no pass after a rename or a rate change, and for one after a new minimum, a new tier or a new window", async () => {
      expect(await edit(gold.id, { name: "Gold+", minSpend: "500", percent: "10" })).toEqual({ ok: true });
      expect(await edit(gold.id, { name: "Gold+", minSpend: "500", percent: "11" })).toEqual({ ok: true });
      expect(await edit(bronze.id, { name: "Bronze", percent: "6" })).toEqual({ ok: true });
      // The window it already has
      expect(await act({ intent: "window", tierWindow: "rolling_12_months" })).toEqual({ ok: true });
      await flushWaitUntil();
      expect(await passRequestedAt()).toBeNull();

      const asked = async (change: () => Promise<Result>) => {
        await prisma.connection.update({ where: { id: conn.connectionId }, data: { tierPassRequestedAt: null } });
        expect(await change()).toEqual({ ok: true });
        await flushWaitUntil();
        return passRequestedAt();
      };
      expect(await asked(() => edit(gold.id, { name: "Gold+", minSpend: "600", percent: "11" }))).toBeInstanceOf(Date);
      expect(await asked(() => act({ intent: "save", name: "Platinum", minSpend: "1000", percent: "15" }))).toBeInstanceOf(Date);
      expect(await asked(() => act({ intent: "window", tierWindow: "lifetime" }))).toBeInstanceOf(Date);
      expect(await asked(() => act({ intent: "delete", id: silver.id }))).toBeInstanceOf(Date);
    });

    it("skips the after-save pass while another holds the store's lease, and says buyers are moving until a pass has run", async () => {
      const buyers = [await addBuyer(), await addBuyer(), await addBuyer()];
      const lease = await acquireCronLock(`tier-pass:${conn.connectionId}`, 1);
      expect(lease.acquired).toBe(true);

      expect(await edit(gold.id, { name: "Gold", minSpend: "450", percent: "10" })).toEqual({ ok: true });
      await flushWaitUntil();

      // Nothing ran: the request waits for the next pass, and the page says so
      const resolved = async () => (await prisma.customer.findMany({ where: { id: { in: buyers.map((b) => b.id) } } })).map((b) => b.resolvedAt);
      expect(await resolved()).toEqual([null, null, null]);
      expect(await passRequestedAt()).toBeInstanceOf(Date);
      expect(await tierPassPending(conn.connectionId)).toBe(true);
      expect((await load()).moving).toBe(true);

      // The next pass finishes the work
      await releaseCronLock(lease.lockId!);
      await requestTierPass(conn.connectionId);
      await flushWaitUntil();
      expect((await resolved()).every((at) => at instanceof Date)).toBe(true);
      expect(await tierPassPending(conn.connectionId)).toBe(false);
      expect((await load()).moving).toBe(false);
    });

    it("runs one pass for two changes in a row, resolving each buyer once", async () => {
      for (let i = 0; i < 5; i++) await addBuyer();
      // Each resolve writes the buyer's row once (resolveTier's conditional
      // update). Counted on the app's shared client, and put back after.
      const customers = prisma.customer;
      const updateMany = customers.updateMany;
      let resolves = 0;
      customers.updateMany = ((args: Prisma.CustomerUpdateManyArgs) => {
        resolves++;
        return updateMany.call(customers, args);
      }) as unknown as typeof updateMany;
      try {
        await requestTierPass(conn.connectionId);
        await requestTierPass(conn.connectionId);
        await flushWaitUntil();
      } finally {
        customers.updateMany = updateMany;
      }

      expect(resolves).toBe(5);
      expect(await tierPassPending(conn.connectionId)).toBe(false);
    });

    // M3b-F6: on one clock, the app's, which stamps both the request and each resolve
    it("counts a pass pending for each buyer it hasn't reached: resolved before it was asked for, or never", async () => {
      expect(await tierPassPending(conn.connectionId)).toBe(false);
      const before = await addBuyer();
      const asked = new Date(Date.now() - 60_000);
      await prisma.connection.update({ where: { id: conn.connectionId }, data: { tierPassRequestedAt: asked } });
      expect(await tierPassPending(conn.connectionId)).toBe(true);

      // Resolved since it was asked for
      await prisma.customer.update({ where: { id: before.id }, data: { resolvedAt: new Date() } });
      expect(await tierPassPending(conn.connectionId)).toBe(false);
      // A buyer never resolved waits for the pass, whenever the database says it was first seen
      const unresolved = await addBuyer();
      await prisma.customer.update({ where: { id: unresolved.id }, data: { createdAt: new Date(asked.getTime() + 30_000) } });
      expect(await tierPassPending(conn.connectionId)).toBe(true);
      await prisma.customer.update({ where: { id: unresolved.id }, data: { resolvedAt: new Date() } });
      expect(await tierPassPending(conn.connectionId)).toBe(false);
      // One resolved before it was asked for still waits
      await prisma.customer.update({ where: { id: before.id }, data: { resolvedAt: new Date(asked.getTime() - 1) } });
      expect(await tierPassPending(conn.connectionId)).toBe(true);
    });
  });
});
