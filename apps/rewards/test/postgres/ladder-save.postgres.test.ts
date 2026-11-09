import { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma, { createPrismaClient, databaseSchema } from "~/db.server";
import { type ConnectionContext, ensureMerchant, findConnection, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { type LadderRowInput, TIER_ERRORS, saveLadder } from "~/lib/tiers.server";
import { hasTestDatabase, resetDatabase, waitForLockWaitOr } from "./helpers/database";

/**
 * The guide's save of three tiers (RP-24): every row checked at once, the
 * starts rising, and the whole ladder written in one transaction under the
 * merchant's row, only for a store with no tiers or with Home's lone
 * "Everyone" tier and cashback off.
 */

const SHOP = "ladder-save.myshopify.com";

let conn: ConnectionContext;

const addTier = (merchantId: string, name: string, minSpend: string, percent: string, position: number) =>
  prisma.tier.create({
    data: { merchantId, name, minSpend: new Prisma.Decimal(minSpend), cashbackPercent: new Prisma.Decimal(percent), position },
    select: { id: true },
  });

/** The merchant's tiers, lowest first, as plain values. */
const tierValues = async (merchantId = conn.merchantId) =>
  (await prisma.tier.findMany({ where: { merchantId }, orderBy: { minSpend: "asc" } })).map((t) => ({
    name: t.name,
    minSpend: new Money(t.minSpend.toString()).toFixed(),
    percent: new Money(t.cashbackPercent.toString()).toFixed(),
  }));

const LADDER: LadderRowInput[] = [
  { name: "Bronze", minSpend: "", percent: "3" },
  { name: "Silver", minSpend: "200", percent: "5" },
  { name: "Gold", minSpend: "500", percent: "8" },
];

const ladder = (starts: [string, string, string]): LadderRowInput[] => LADDER.map((row, i) => ({ ...row, minSpend: starts[i] }));

const stale = { ok: false, errors: { rows: [{}, {}, {}], form: TIER_ERRORS.ladderStale } };

describe.skipIf(!hasTestDatabase)("saveLadder", () => {
  beforeEach(async () => {
    await resetDatabase();
    await ensureMerchant({ shop: SHOP, name: "Ladder Save", currency: "GBP", timezone: "Europe/London", now: new Date("2024-01-01T00:00:00Z") });
    conn = (await findConnection(SHOP))!;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("saves three tiers for a store with none, the first at 0", async () => {
    const saved = await saveLadder(conn.merchantId, [
      { name: "Bronze", minSpend: "", percent: "3" },
      { name: "Silver", minSpend: "200", percent: "5" },
      { name: "Gold", minSpend: "500", percent: "8" },
    ]);
    expect(saved.ok).toBe(true);
    expect(await tierValues()).toEqual([
      { name: "Bronze", minSpend: "0", percent: "3" },
      { name: "Silver", minSpend: "200", percent: "5" },
      { name: "Gold", minSpend: "500", percent: "8" },
    ]);
    const tiers = await prisma.tier.findMany({ where: { merchantId: conn.merchantId }, orderBy: { minSpend: "asc" } });
    expect(saved.ok && saved.tierIds).toEqual(tiers.map((t) => t.id));
    expect(tiers.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("keeps Home's lone Everyone tier by id, renaming it and adding two above", async () => {
    const everyone = await addTier(conn.merchantId, "Everyone", "0", "5", 0);

    // Tier 1's start is 0 whatever the row says
    const saved = await saveLadder(conn.merchantId, [
      { name: "  Bronze  ", minSpend: "150", percent: "3" },
      { name: "Silver", minSpend: "200", percent: "5" },
      { name: "Gold", minSpend: "500", percent: "8" },
    ]);

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.tierIds[0]).toBe(everyone.id);
    expect(await tierValues()).toEqual([
      { name: "Bronze", minSpend: "0", percent: "3" },
      { name: "Silver", minSpend: "200", percent: "5" },
      { name: "Gold", minSpend: "500", percent: "8" },
    ]);
    const tiers = await prisma.tier.findMany({ where: { merchantId: conn.merchantId }, orderBy: { minSpend: "asc" } });
    expect(tiers.map((t) => t.id)).toEqual(saved.tierIds);
    expect(tiers.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("reports every row's problems at once and writes nothing", async () => {
    const saved = await saveLadder(conn.merchantId, [
      { name: "", minSpend: "", percent: "101" },
      { name: "Silver", minSpend: "abc", percent: "5" },
      { name: "x".repeat(41), minSpend: "500", percent: "8" },
    ]);
    expect(saved).toEqual({
      ok: false,
      errors: {
        rows: [
          { name: "Enter a name.", percent: "Enter a whole number from 0 to 100." },
          { minSpend: "Enter a whole number of 0 or more." },
          { name: "Use 40 characters or fewer." },
        ],
      },
    });
    expect(await tierValues()).toEqual([]);
  });

  it("refuses starts that don't rise", async () => {
    for (const starts of [
      ["", "500", "500"],
      ["", "500", "200"],
    ] as const) {
      const saved = await saveLadder(conn.merchantId, ladder([...starts]));
      expect(saved).toEqual({ ok: false, errors: { rows: [{}, {}, { minSpend: "Start each tier above the one before." }] } });
    }
    const flat = await saveLadder(conn.merchantId, ladder(["", "0", "500"]));
    expect(flat).toEqual({ ok: false, errors: { rows: [{}, { minSpend: "Start each tier above the one before." }, {}] } });
    expect(await tierValues()).toEqual([]);
  });

  it("refuses anything but three rows", async () => {
    for (const rows of [LADDER.slice(0, 2), [...LADDER, { name: "Platinum", minSpend: "900", percent: "10" }]]) {
      const saved = await saveLadder(conn.merchantId, rows);
      expect(saved).toEqual({ ok: false, errors: { rows: [{}, {}, {}], form: "Set up exactly three tiers." } });
    }
    expect(await tierValues()).toEqual([]);
  });

  it("refuses a store whose ladder isn't fresh, writing nothing", async () => {
    // a) two tiers already
    await addTier(conn.merchantId, "Everyone", "0", "5", 0);
    await addTier(conn.merchantId, "Regulars", "300", "6", 1);
    expect(await saveLadder(conn.merchantId, LADDER)).toEqual(stale);
    expect(await tierValues()).toEqual([
      { name: "Everyone", minSpend: "0", percent: "5" },
      { name: "Regulars", minSpend: "300", percent: "6" },
    ]);

    // b) one tier, not named Everyone
    await prisma.tier.deleteMany({ where: { merchantId: conn.merchantId } });
    await addTier(conn.merchantId, "Members", "0", "4", 0);
    expect(await saveLadder(conn.merchantId, LADDER)).toEqual(stale);
    expect(await tierValues()).toEqual([{ name: "Members", minSpend: "0", percent: "4" }]);

    // c) Everyone alone, with cashback running
    await prisma.tier.deleteMany({ where: { merchantId: conn.merchantId } });
    await addTier(conn.merchantId, "Everyone", "0", "5", 0);
    expect(await setRunning(conn.merchantId, true)).toEqual({ ok: true });
    expect(await saveLadder(conn.merchantId, LADDER)).toEqual(stale);
    expect(await tierValues()).toEqual([{ name: "Everyone", minSpend: "0", percent: "5" }]);
  });

  it("is decided under the merchant lock, so a tier added meanwhile wins", async () => {
    const adder = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    const watcher = createPrismaClient(process.env.REWARDS_DATABASE_URL);
    try {
      let saving: ReturnType<typeof saveLadder> | null = null;
      await adder.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM ${Prisma.raw(`"${databaseSchema}"."merchant"`)} WHERE id = ${conn.merchantId}::uuid FOR UPDATE`;
        saving = saveLadder(conn.merchantId, LADDER);
        saving.catch(() => {});
        await waitForLockWaitOr(watcher, saving);
        await tx.tier.create({
          data: { merchantId: conn.merchantId, name: "Raced", minSpend: new Prisma.Decimal(300), cashbackPercent: new Prisma.Decimal(4), position: 0 },
        });
      });
      expect(await saving).toEqual(stale);
      expect(await tierValues()).toEqual([{ name: "Raced", minSpend: "300", percent: "4" }]);
    } finally {
      await adder.$disconnect();
      await watcher.$disconnect();
    }
  });
});
