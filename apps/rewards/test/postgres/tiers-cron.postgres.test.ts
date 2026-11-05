import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { ensureMerchant, findConnection, markUninstalled } from "~/lib/merchant.server";
import { failNextCall, hasTestDatabase, resetDatabase, restoreFailedCalls } from "./helpers/database";

/**
 * The nightly tier pass through its cron route (api.cron.tiers), carried
 * from apps/rewardspro's tier-recalculation cron: which buyers a pass
 * resolves, when a store's pass is stamped, and when the run fails.
 */

const SHOP = "tiers-cron.myshopify.com";
const OTHER_SHOP = "tiers-cron-other.myshopify.com";
const CRON_SECRET = "cron-secret-for-tests";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A store with one tier and buyers last resolved at the given times (null: never). */
async function storeWithBuyers(shop: string, resolvedAt: Array<Date | null>, connection: Prisma.ConnectionUpdateInput = {}) {
  await ensureMerchant({ shop, name: "Tiers Cron", currency: "GBP", timezone: "Europe/London", now: new Date(Date.now() - 30 * DAY) });
  const conn = (await findConnection(shop))!;
  await prisma.connection.update({ where: { id: conn.connectionId }, data: connection });
  const tier = await prisma.tier.create({
    data: { merchantId: conn.merchantId, name: "Everyone", minSpend: new Prisma.Decimal(0), cashbackPercent: new Prisma.Decimal("5.00"), position: 0 },
  });
  const buyers = [];
  for (const [n, at] of resolvedAt.entries()) {
    buyers.push(
      await prisma.customer.create({
        data: { merchantId: conn.merchantId, connectionId: conn.connectionId, externalCustomerId: `${n + 1}`, tierId: tier.id, resolvedAt: at },
      }),
    );
  }
  return { conn, buyers };
}

const resolvedAtOf = async (id: string) => (await prisma.customer.findUniqueOrThrow({ where: { id } })).resolvedAt;
const lastPassOf = async (id: string) => (await prisma.connection.findUniqueOrThrow({ where: { id } })).lastTierPassAt;

describe.skipIf(!hasTestDatabase)("the nightly tier pass", () => {
  let loader: typeof import("~/routes/api.cron.tiers").loader;

  const run = async () => {
    const response = await loader({
      request: new Request("https://test.example.com/api/cron/tiers", { headers: { Authorization: `Bearer ${CRON_SECRET}` } }),
      params: {},
      context: {},
    } as never);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    ({ loader } = await import("~/routes/api.cron.tiers"));
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterAll(() => {
    restoreFailedCalls();
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("resolves the buyers not resolved since the store became due, and stamps its pass", async () => {
    // Last pass 23.5 hours ago: the store became due half an hour ago
    const { conn, buyers } = await storeWithBuyers(SHOP, [null, new Date(Date.now() - HOUR), new Date(Date.now() - 10 * MINUTE)], {
      lastTierPassAt: new Date(Date.now() - 23.5 * HOUR),
    });
    const upToDate = await resolvedAtOf(buyers[2].id);
    const before = Date.now();

    await expect(run()).resolves.toMatchObject({ status: 200, body: { success: true, stores: 1, complete: 1, processed: 2, errors: 0 } });

    expect((await resolvedAtOf(buyers[0].id))!.getTime()).toBeGreaterThanOrEqual(before);
    expect((await resolvedAtOf(buyers[1].id))!.getTime()).toBeGreaterThanOrEqual(before);
    expect(await resolvedAtOf(buyers[2].id)).toEqual(upToDate);
    expect((await lastPassOf(conn.connectionId))!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("resolves everyone again after the merchant asked for a pass", async () => {
    const { buyers } = await storeWithBuyers(SHOP, [new Date(Date.now() - 10 * MINUTE)], {
      lastTierPassAt: new Date(Date.now() - 23.5 * HOUR),
      tierPassRequestedAt: new Date(Date.now() - MINUTE),
    });
    const before = Date.now();

    await expect(run()).resolves.toMatchObject({ status: 200, body: { processed: 1 } });

    expect((await resolvedAtOf(buyers[0].id))!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("leaves a store with a buyer it could not resolve unstamped, and fails once it is over 2 days behind", async () => {
    const lastPass = new Date(Date.now() - 3 * DAY);
    const { conn } = await storeWithBuyers(SHOP, [null], { lastTierPassAt: lastPass });
    failNextCall("customer", "findUniqueOrThrow", new Error("connection reset"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(run()).resolves.toMatchObject({ status: 500, body: { success: false, errors: 1, overdue: [SHOP] } });

    expect(await lastPassOf(conn.connectionId)).toEqual(lastPass);
    errors.mockRestore();
  });

  it("passes over uninstalled stores", async () => {
    const { conn } = await storeWithBuyers(OTHER_SHOP, [null]);
    await markUninstalled(OTHER_SHOP, new Date());

    await expect(run()).resolves.toMatchObject({ status: 200, body: { stores: 0, processed: 0 } });
    expect(await lastPassOf(conn.connectionId)).toBeNull();
  });
});
