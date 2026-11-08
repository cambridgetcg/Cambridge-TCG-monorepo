import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "~/db.server";
import { dismissGuide, guideDue } from "~/lib/guide.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * The first-time setup guide's gate (RP-24): a store is sent to the guide
 * while it has no tiers and has not pressed "Finish later", and the first
 * "Finish later" is kept.
 */

const SHOP = "guide-test.myshopify.com";
const INSTALLED = new Date("2026-11-01T00:00:00Z");

async function seedShop(shop = SHOP): Promise<ConnectionContext> {
  await ensureMerchant({ shop, name: "Guide Test", currency: "GBP", timezone: "Europe/London", now: INSTALLED });
  return (await findConnection(shop))!;
}

async function seedTier(conn: ConnectionContext, name: string, minSpend: string, percent: string, position: number) {
  return prisma.tier.create({ data: { merchantId: conn.merchantId, name, minSpend, cashbackPercent: percent, position } });
}

const merchantOf = (conn: ConnectionContext) => prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } });

describe.skipIf(!hasTestDatabase)("the setup guide's gate", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is due for a store with no tiers that hasn't finished later", async () => {
    const conn = await seedShop();
    expect(await guideDue(conn.merchantId)).toBe(true);
  });

  it("is not due once the store has a tier, or once Finish later was pressed", async () => {
    const a = await seedShop("a.myshopify.com");
    await seedTier(a, "Everyone", "0", "3", 0);
    expect(await guideDue(a.merchantId)).toBe(false);
    const b = await seedShop("b.myshopify.com");
    await dismissGuide(b.merchantId, new Date("2026-11-09T10:00:00Z"));
    expect(await guideDue(b.merchantId)).toBe(false);
  });

  it("keeps the first Finish later", async () => {
    const conn = await seedShop();
    await dismissGuide(conn.merchantId, new Date("2026-11-09T10:00:00Z"));
    await dismissGuide(conn.merchantId, new Date("2026-11-10T10:00:00Z"));
    expect((await merchantOf(conn)).guideDismissedAt).toEqual(new Date("2026-11-09T10:00:00Z"));
  });

  it("is not due for an unknown merchant", async () => {
    expect(await guideDue(crypto.randomUUID())).toBe(false);
  });
});
