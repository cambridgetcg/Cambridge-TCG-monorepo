import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Raffles, mystery boxes and instant wins are paused by one code constant
 * (app/constants/chance-mechanics.ts). Nothing may enter, open, draw or win
 * while it is set, and nothing outside the code may unset it.
 */

// Any database access on a paused path is a failure
const prisma = vi.hoisted(() => {
  const forbidden = (): never => {
    throw new Error("database touched on a paused path");
  };
  return new Proxy({ pointsConfig: { findUnique: vi.fn() } } as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : new Proxy({}, { get: () => forbidden })),
  });
});
vi.mock("~/db.server", () => ({ default: prisma, db: prisma, databaseSchema: "rewardspro" }));
vi.mock("~/shopify.server", () => ({
  authenticate: { public: { appProxy: vi.fn(async () => ({ session: { shop: "chance.myshopify.com" } })) } },
  unauthenticated: {},
}));

import { CHANCE_MECHANICS_PAUSED } from "~/constants/chance-mechanics";
import { SECTION_NAVIGATION } from "~/navigation/registry";
import { getEnabledFeatures } from "~/services/points-config.server";
import { claimDailyFreeEntry, purchaseRaffleEntries } from "~/services/raffle-entry.server";
import { openMysteryBox } from "~/services/mystery-box-open.server";
import { executeRaffleDraw } from "~/services/raffle-drawing.server";
import { processInstantWin } from "~/services/raffle-instant-win.server";
import { action as proxyAction } from "~/routes/api.proxy.$";
import { loader as raffleDraw } from "~/routes/api.cron.raffle-draw";
import { loader as raffleStatus } from "~/routes/api.cron.raffle-status";
import { loader as mysteryBoxStatus } from "~/routes/api.cron.mystery-box-status";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const SHOP = "chance.myshopify.com";
const PAUSED = { success: false, code: "CHANCE_MECHANICS_PAUSED", error: "Raffles and mystery boxes are paused." };

describe("chance mechanics switch", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a code constant, not a setting or environment variable", () => {
    expect(CHANCE_MECHANICS_PAUSED).toBe(true);
    const source = read("app/constants/chance-mechanics.ts");
    expect(source).toContain("export const CHANCE_MECHANICS_PAUSED = true;");
    expect(source).not.toMatch(/process\.env|prisma|import /);
  });

  it("refuses entries, opens, draws and instant wins without touching the database", async () => {
    await expect(purchaseRaffleEntries({ shop: SHOP, customerId: "c", raffleId: "r", quantity: 1 })).resolves.toEqual(PAUSED);
    await expect(claimDailyFreeEntry(SHOP, "c", "r")).resolves.toEqual(PAUSED);
    await expect(openMysteryBox({ shop: SHOP, customerId: "c", boxId: "b" })).resolves.toEqual(PAUSED);
    await expect(executeRaffleDraw("r", SHOP)).resolves.toMatchObject({ ...PAUSED, winnersSelected: 0, winners: [] });
    await expect(processInstantWin("r", SHOP, "c", "e")).resolves.toEqual([]);
  });

  it("reports the games as off whatever the merchant enabled", async () => {
    vi.mocked(prisma.pointsConfig as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({
      isEnabled: true,
      rafflesEnabled: true,
      mysteryBoxesEnabled: true,
      spinWheelEnabled: true,
      challengesEnabled: true,
      scratchCardsEnabled: true,
      givebackPoolsEnabled: false,
      dailySpinEnabled: true,
      streakBonusEnabled: false,
    });

    await expect(getEnabledFeatures(SHOP)).resolves.toMatchObject({
      pointsSystem: true,
      challenges: true,
      raffles: false,
      mysteryBoxes: false,
      spinWheel: false,
      scratchCards: false,
      dailySpin: false,
    });
  });

  it.each(["raffles", "raffles/enter", "mystery-boxes/open"])(
    "the storefront proxy refuses POST %s with 503 before reading the request body",
    async (path) => {
      const request = new Request(`https://test.example.com/api/proxy/${path}?shop=${SHOP}&logged_in_customer_id=1`, {
        method: "POST",
        body: "{not json",
      });

      const response = await proxyAction({ request, params: { "*": path }, context: {} });

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject(PAUSED);
    },
  );

  it.each([
    ["raffle-draw", raffleDraw],
    ["raffle-status", raffleStatus],
    ["mystery-box-status", mysteryBoxStatus],
  ])("the %s cron does nothing", async (_name, loader) => {
    process.env.CRON_SECRET = "chance-cron";
    const response = await loader({
      request: new Request("https://test.example.com/api/cron/x", { headers: { Authorization: "Bearer chance-cron" } }),
      params: {},
      context: {},
    });
    await expect(response.json()).resolves.toEqual({ success: true, skipped: true, reason: "CHANCE_MECHANICS_PAUSED" });
  });

  it("hides raffles and mystery boxes from the admin navigation", () => {
    const labels = SECTION_NAVIGATION.rewards.map((item) => item.label);
    expect(labels).not.toContain("Raffles");
    expect(labels).not.toContain("Mystery boxes");
    expect(labels).toContain("Missions");
  });

  it("never tells a shopper they almost won", () => {
    for (const path of ["app/services/raffle-instant-win.server.ts", "app/services/mystery-box-open.server.ts"]) {
      const source = read(path);
      expect(source, path).not.toMatch(/nearMiss|almost won|So close/i);
    }
  });
});
