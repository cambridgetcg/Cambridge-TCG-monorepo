import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily tier-recalculation cron decides which shops are due and stamps
 * each shop's last run. A shop is due again a whole number of days after its
 * last run, and a run that failed for some customers isn't stamped as done.
 */

const db = vi.hoisted(() => ({
  shopSettings: { findMany: vi.fn(), update: vi.fn() },
}));

const tierManagement = vi.hoisted(() => ({
  recalculateTiersSmart: vi.fn(),
  refreshAnnualSpending: vi.fn(),
}));

const cronLock = vi.hoisted(() => ({
  acquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  cleanupExpiredLocks: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/services/tier-management.server", () => tierManagement);
vi.mock("~/services/cron-lock.server", () => cronLock);

import { loader } from "~/routes/api.cron.tier-recalculation";

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

const recalcResult = (overrides: Record<string, unknown> = {}) => ({
  processed: 3,
  upgraded: 1,
  downgraded: 1,
  unchanged: 1,
  errors: 0,
  complete: true,
  bySource: { manualOverride: 0, tierSubscription: 0, tierPurchase: 0, spendingBased: 3, none: 0 },
  timing: { totalMs: 5 },
  engine: "LEGACY",
  optimizedPath: false,
  ...overrides,
});

async function runCron() {
  const response = await loader({
    request: new Request("https://rewardspro.test/api/cron/tier-recalculation", {
      headers: { Authorization: "Bearer the-cron-secret" },
    }),
    params: {},
    context: {},
  });
  return { status: response.status, body: await response.json() };
}

const shop = (name: string, frequency: string, lastRun: Date | null) => ({
  shop: `${name}.myshopify.com`,
  tierRecalculationFrequency: frequency,
  tierRecalculationLastRun: lastRun,
});

const recalculatedShops = () => tierManagement.recalculateTiersSmart.mock.calls.map(([name]) => name);

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  delete process.env.SLACK_WEBHOOK_URL;
  db.shopSettings.findMany.mockReset().mockResolvedValue([]);
  db.shopSettings.update.mockReset().mockResolvedValue({});
  tierManagement.recalculateTiersSmart.mockReset().mockResolvedValue(recalcResult());
  tierManagement.refreshAnnualSpending
    .mockReset()
    .mockResolvedValue({ processed: 3, updated: 0, errors: 0, duration: 1 });
  cronLock.acquireCronLock.mockReset().mockResolvedValue({ acquired: true, lockId: "lock-1" });
  cronLock.releaseCronLock.mockReset().mockResolvedValue(undefined);
  cronLock.cleanupExpiredLocks.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("tier-recalculation cron", () => {
  it("runs a daily shop the day after its last run, and a weekly one a week after", async () => {
    // Yesterday's and last week's runs were stamped a few seconds after the
    // 09:00 cron fired, so slightly less than 1 and 7 days have passed
    db.shopSettings.findMany.mockResolvedValue([
      shop("daily", "DAILY", ago(DAY - 10_000)),
      shop("weekly", "WEEKLY", ago(7 * DAY - 10_000)),
      shop("monthly", "MONTHLY", ago(30 * DAY - 10_000)),
    ]);

    const { status, body } = await runCron();

    expect(status).toBe(200);
    expect(recalculatedShops()).toEqual(["daily.myshopify.com", "weekly.myshopify.com", "monthly.myshopify.com"]);
    expect(body.summary.shopsProcessed).toBe(3);
  });

  it("doesn't run a shop before its time", async () => {
    db.shopSettings.findMany.mockResolvedValue([
      // Someone pressed "Recalculate now" this morning
      shop("daily", "DAILY", ago(2 * 60 * 60 * 1000)),
      shop("weekly", "WEEKLY", ago(6 * DAY)),
      shop("monthly", "MONTHLY", ago(29 * DAY)),
    ]);

    const { body } = await runCron();

    expect(recalculatedShops()).toEqual([]);
    expect(body.summary.shopsSkipped).toBe(3);
  });

  it("runs a shop that has never run", async () => {
    db.shopSettings.findMany.mockResolvedValue([shop("new", "WEEKLY", null)]);

    await runCron();

    expect(recalculatedShops()).toEqual(["new.myshopify.com"]);
    expect(db.shopSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shop: "new.myshopify.com" } }),
    );
  });

  it("counts customers it couldn't resolve as errors and leaves the shop due", async () => {
    db.shopSettings.findMany.mockResolvedValue([shop("flaky", "WEEKLY", null)]);
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ errors: 2 }));

    const { status, body } = await runCron();

    expect(status).toBe(200);
    expect(body.summary.errorCount).toBe(2);
    expect(db.shopSettings.update).not.toHaveBeenCalled();
  });

  it("leaves a shop that ran out of time due, so the next run carries on", async () => {
    db.shopSettings.findMany.mockResolvedValue([shop("big", "WEEKLY", null)]);
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ complete: false }));

    const { body } = await runCron();

    expect(tierManagement.recalculateTiersSmart).toHaveBeenCalledWith("big.myshopify.com", {
      deadline: expect.any(Number),
    });
    expect(body.summary.shopsUnfinished).toBe(1);
    expect(db.shopSettings.update).not.toHaveBeenCalled();
  });
});
