import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma, { createPrismaClient, databaseSchema } from "~/db.server";
import { ensureMerchant, findConnection, markUninstalled, setRunning } from "~/lib/merchant.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

const SHOP = "merchant-test.myshopify.com";
const OPENED = new Date("2026-11-05T09:00:00Z");

function open(overrides: Partial<Parameters<typeof ensureMerchant>[0]> = {}) {
  return ensureMerchant({
    shop: SHOP,
    name: "Merchant Test",
    currency: "GBP",
    timezone: "Europe/London",
    now: OPENED,
    ...overrides,
  });
}

/** Resolves once another session is waiting on a row lock (up to 5 s). */
async function waitForLockWait(tx: Prisma.TransactionClient): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const [{ waiting }] = await tx.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The racing open never waited on the unique key");
}

describe.skipIf(!hasTestDatabase)("merchants and connections", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates one merchant and connection, and a second open updates the shop details", async () => {
    const first = await open();

    // With the import's state and boundary, so the open needs no second read (A17-F7)
    expect(first).toEqual({
      merchantId: expect.any(String),
      connectionId: expect.any(String),
      created: true,
      reactivated: false,
      importState: "not_started",
      installedAt: OPENED,
    });
    expect(await findConnection(SHOP)).toEqual({
      connectionId: first.connectionId,
      merchantId: first.merchantId,
      shop: SHOP,
      running: false,
      currency: "GBP",
      timezone: "Europe/London",
      notifyBuyers: false,
      tierWindow: "rolling_12_months",
      installedAt: OPENED,
      activatedAt: OPENED,
      uninstalledAt: null,
    });

    const second = await open({
      name: "Renamed Shop",
      currency: "EUR",
      timezone: "Europe/Paris",
      now: new Date("2026-11-06T09:00:00Z"),
    });

    expect(second).toEqual({
      merchantId: first.merchantId,
      connectionId: first.connectionId,
      created: false,
      reactivated: false,
      importState: "not_started",
      installedAt: OPENED,
    });
    expect(await prisma.merchant.count()).toBe(1);
    expect(await prisma.connection.count()).toBe(1);
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: first.merchantId } });
    expect(merchant).toMatchObject({ name: "Renamed Shop", currency: "EUR", timezone: "Europe/Paris" });
    // The install boundary is the first open's, not this one's.
    expect((await findConnection(SHOP))?.installedAt).toEqual(OPENED);
  });

  it("an open that races another's first insert finds the winner's rows", async () => {
    let racing!: ReturnType<typeof open>;
    // The client would log a refused insert (log: ["error"]) through console.log.
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    // The test pool has one connection (connection_limit=1), so the winner
    // holds its own.
    const winnerClient = createPrismaClient(process.env.REWARDS_DATABASE_URL);

    // The winner's insert is held uncommitted until the racing open is
    // blocked on the same (platform, external account id) key.
    let winner: { merchantId: string; connectionId: string };
    try {
      winner = await winnerClient.$transaction(async (tx) => {
        const merchant = await tx.merchant.create({
          data: { name: "Merchant Test", currency: "GBP", timezone: "Europe/London" },
        });
        const connection = await tx.connection.create({
          data: {
            merchantId: merchant.id,
            platform: "shopify",
            externalAccountId: SHOP,
            status: "active",
            installedAt: OPENED,
            activatedAt: OPENED,
          },
        });
        racing = open();
        racing.catch(() => {});
        await waitForLockWait(tx);
        return { merchantId: merchant.id, connectionId: connection.id };
      });
    } finally {
      await winnerClient.$disconnect();
    }

    // It really raced (waitForLockWait saw it blocked on the key), and its
    // insert did nothing rather than fail: no error raised or logged.
    expect(await racing).toEqual({ ...winner, created: false, reactivated: false, importState: "not_started", installedAt: OPENED });
    for (const spy of logs) {
      expect(spy.mock.calls.flat().map(String).join("\n")).not.toMatch(/prisma:error|Unique constraint/);
    }
    // No orphan merchant from the open that lost.
    expect(await prisma.merchant.count()).toBe(1);
    expect(await prisma.connection.count()).toBe(1);
  });

  // Ruling 77 (CONCURRENCY-6): an open whose shop details are unchanged writes no merchant row
  it("an open with unchanged shop details doesn't wait on the merchant row a tier change holds", async () => {
    const first = await open();
    const later = new Date(OPENED.getTime() + 60_000);
    // A tier change (a long delete, say) holds the merchant's row, on a client of its own
    const tierChange = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    let reopened: Awaited<ReturnType<typeof open>> | "waited";
    try {
      reopened = await tierChange.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM ${Prisma.raw(`"${databaseSchema}"."merchant"`)} WHERE id = ${first.merchantId}::uuid FOR NO KEY UPDATE`;
          const racing = open({ now: later });
          racing.catch(() => {});
          return Promise.race([racing, new Promise<"waited">((resolve) => setTimeout(() => resolve("waited"), 2000))]);
        },
        { timeout: 10_000 },
      );
    } finally {
      await tierChange.$disconnect();
    }

    expect(reopened).toMatchObject({ merchantId: first.merchantId, created: false, reactivated: false });
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({ lastAuthAt: later });
    // A real change of details is still written
    await open({ name: "Renamed", now: new Date(later.getTime() + 1000) });
    expect(await prisma.merchant.findUniqueOrThrow({ where: { id: first.merchantId } })).toMatchObject({ name: "Renamed", currency: "GBP" });
  });

  it("an uninstalled store has no connection until it is opened again, which reactivates it", async () => {
    const first = await open();
    const uninstalledAt = new Date("2026-11-07T10:00:00Z");

    expect(await markUninstalled(SHOP, uninstalledAt)).toBe("uninstalled");
    expect(await findConnection(SHOP)).toBeNull();
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({
      status: "uninstalled",
      uninstalledAt,
    });
    // A second delivery of app/uninstalled keeps the first time.
    expect(await markUninstalled(SHOP, new Date("2026-11-07T11:00:00Z"))).toBe("already_uninstalled");
    expect(
      (await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).uninstalledAt,
    ).toEqual(uninstalledAt);

    const reopened = new Date("2026-11-08T09:00:00Z");
    const again = await open({ now: reopened });

    expect(again).toEqual({
      merchantId: first.merchantId,
      connectionId: first.connectionId,
      created: false,
      reactivated: true,
      importState: "not_started",
      installedAt: OPENED,
    });
    // A reactivation starts a new install and keeps the last uninstall, so
    // [uninstalledAt, activatedAt) is the gap.
    expect(await findConnection(SHOP)).toMatchObject({
      connectionId: first.connectionId,
      installedAt: OPENED,
      activatedAt: reopened,
      uninstalledAt,
    });
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({
      status: "active",
      activatedAt: reopened,
      uninstalledAt,
    });
    // Only the open that brought it back says so.
    expect((await open()).reactivated).toBe(false);
  });

  it("an uninstall dated before the reactivation leaves the live store active", async () => {
    const first = await open();
    const uninstalledAt = new Date("2026-11-07T10:00:00Z");
    await markUninstalled(SHOP, uninstalledAt);
    const reopened = new Date("2026-11-08T09:00:00Z");
    await open({ now: reopened });

    // A late retry of that app/uninstalled, or any uninstall the reinstall overtook.
    expect(await markUninstalled(SHOP, uninstalledAt)).toBe("stale");
    expect(await markUninstalled(SHOP, new Date("2026-11-08T08:59:59Z"))).toBe("stale");
    // At the very instant of reactivation counts as before it, too.
    expect(await markUninstalled(SHOP, reopened)).toBe("stale");

    expect(await findConnection(SHOP)).toMatchObject({
      connectionId: first.connectionId,
      activatedAt: reopened,
      uninstalledAt,
    });
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({
      status: "active",
      uninstalledAt,
    });
  });

  it("an uninstall dated after the reactivation marks the store uninstalled", async () => {
    const first = await open();
    await markUninstalled(SHOP, new Date("2026-11-07T10:00:00Z"));
    await open({ now: new Date("2026-11-08T09:00:00Z") });
    const uninstalledAgain = new Date("2026-11-08T09:00:01Z");

    expect(await markUninstalled(SHOP, uninstalledAgain)).toBe("uninstalled");

    expect(await findConnection(SHOP)).toBeNull();
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({
      status: "uninstalled",
      uninstalledAt: uninstalledAgain,
    });
  });

  it("records each open's time, apart from activatedAt", async () => {
    const first = await open();
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({
      activatedAt: OPENED,
      lastAuthAt: OPENED,
    });

    const later = new Date("2026-11-06T09:00:00Z");
    await open({ now: later });

    // An open of an active store is not a new install: the gap rule's bound stays.
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: first.connectionId } })).toMatchObject({
      activatedAt: OPENED,
      lastAuthAt: later,
    });
  });

  it("an uninstall that failed before it committed and is retried after a reinstall leaves the live store active (Ruling 13)", async () => {
    const first = await open();
    // The first app/uninstalled never committed, so the connection is still
    // active and the reinstall's open does not reactivate it.
    const uninstalledAt = new Date("2026-11-07T10:00:00Z");
    const reopened = new Date("2026-11-07T11:00:00Z");
    expect((await open({ now: reopened })).reactivated).toBe(false);

    expect(await markUninstalled(SHOP, uninstalledAt)).toBe("stale");
    expect(await markUninstalled(SHOP, reopened)).toBe("stale");

    expect(await findConnection(SHOP)).toMatchObject({ connectionId: first.connectionId, activatedAt: OPENED, uninstalledAt: null });
    // An uninstall after that open is a real one.
    expect(await markUninstalled(SHOP, new Date("2026-11-07T11:00:01Z"))).toBe("uninstalled");
    expect(await findConnection(SHOP)).toBeNull();
  });

  it("markUninstalled on a shop it has never seen changes nothing", async () => {
    await open();

    expect(await markUninstalled("unknown-shop.myshopify.com")).toBe("unknown");
    expect(await findConnection("unknown-shop.myshopify.com")).toBeNull();
    expect(await findConnection(SHOP)).not.toBeNull();
  });

  it.each(["merchant-test.com", "Merchant-Test.myshopify.com", "evil.myshopify.com.example.com", ""])(
    "refuses a shop that isn't a canonical *.myshopify.com domain: %j",
    async (shop) => {
      await expect(open({ shop })).rejects.toThrow(/myshopify\.com/);
      expect(await prisma.merchant.count()).toBe(0);
    },
  );

  it("refuses a currency that isn't an ISO code", async () => {
    await expect(open({ currency: "" })).rejects.toThrow(/currency/i);
    await expect(open({ currency: "gbp" })).rejects.toThrow(/currency/i);
    expect(await prisma.merchant.count()).toBe(0);
  });

  it("will not switch cashback on without tiers, and switches it on and off with them", async () => {
    const { merchantId } = await open();

    expect(await setRunning(merchantId, true)).toEqual({ ok: false, reason: "no_tiers" });
    expect((await findConnection(SHOP))?.running).toBe(false);

    await prisma.tier.create({
      data: {
        merchantId,
        name: "Bronze",
        minSpend: new Prisma.Decimal("0"),
        cashbackPercent: new Prisma.Decimal("2.00"),
        position: 0,
      },
    });

    expect(await setRunning(merchantId, true)).toEqual({ ok: true });
    expect((await findConnection(SHOP))?.running).toBe(true);
    expect(await setRunning(merchantId, false)).toEqual({ ok: true });
    expect((await findConnection(SHOP))?.running).toBe(false);
  });

  it("another merchant's tiers don't count", async () => {
    const { merchantId } = await open();
    const other = await open({ shop: "other-shop.myshopify.com" });
    await prisma.tier.create({
      data: {
        merchantId: other.merchantId,
        name: "Gold",
        minSpend: new Prisma.Decimal("100"),
        cashbackPercent: new Prisma.Decimal("5.00"),
        position: 0,
      },
    });

    expect(await setRunning(merchantId, true)).toEqual({ ok: false, reason: "no_tiers" });
  });

  it("setRunning on a merchant that doesn't exist throws", async () => {
    await expect(setRunning("00000000-0000-4000-8000-000000000000", false)).rejects.toThrow(/no merchant/i);
    await expect(setRunning("00000000-0000-4000-8000-000000000000", true)).rejects.toThrow(/no merchant/i);
  });
});
