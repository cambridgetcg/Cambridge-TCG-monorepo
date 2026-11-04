import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily tier-recalculation cron decides which shops are due and stamps
 * each shop's last run. A shop is due again a whole number of days after its
 * last run, and a run that failed for some customers isn't stamped as done.
 * Each due shop gets a share of the run's time, and a pass over a shop's
 * customers can span several runs.
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

const shop = (name: string, frequency: string, lastRun: Date | null, createdAt = ago(365 * DAY)) => ({
  shop: `${name}.myshopify.com`,
  tierRecalculationFrequency: frequency,
  tierRecalculationLastRun: lastRun,
  createdAt,
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

  it("counts customers it couldn't resolve as errors, leaves the shop due and answers 500", async () => {
    db.shopSettings.findMany.mockResolvedValue([shop("flaky", "WEEKLY", null)]);
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ errors: 2 }));

    const { status, body } = await runCron();

    // A failed answer is what the cron monitor and Vercel's logs show as a
    // failed run; a Slack alert needs SLACK_WEBHOOK_URL, which may not be set
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.summary.errorCount).toBe(2);
    expect(db.shopSettings.update).not.toHaveBeenCalled();
  });

  it("leaves a shop that ran out of time due, so the next run carries on", async () => {
    // Installed yesterday
    db.shopSettings.findMany.mockResolvedValue([shop("big", "WEEKLY", null, ago(DAY))]);
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ complete: false }));

    const { status, body } = await runCron();

    expect(tierManagement.recalculateTiersSmart).toHaveBeenCalledWith("big.myshopify.com", {
      deadline: expect.any(Number),
      resolvedBefore: expect.any(Date),
    });
    expect(body.summary.shopsUnfinished).toBe(1);
    expect(body.summary.shopsOverdue).toBe(0);
    expect(status).toBe(200);
    expect(db.shopSettings.update).not.toHaveBeenCalled();
  });

  it("asks for the shops that waited longest first", async () => {
    await runCron();

    expect(db.shopSettings.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tierRecalculationEnabled: true },
      orderBy: { tierRecalculationLastRun: { sort: "asc", nulls: "first" } },
    }));
  });

  it("carries on a pass a run didn't finish: only customers not resolved since the shop became due", async () => {
    const lastRun = ago(8 * DAY);
    db.shopSettings.findMany.mockResolvedValue([
      shop("weekly", "WEEKLY", lastRun),
      shop("new", "DAILY", null),
    ]);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    await runCron();

    // Due an hour before a full week after the last complete run
    expect(tierManagement.recalculateTiersSmart).toHaveBeenNthCalledWith(1, "weekly.myshopify.com", expect.objectContaining({
      resolvedBefore: new Date(lastRun.getTime() + 7 * DAY - 60 * 60 * 1000),
    }));
    // Never finished a pass: customers resolved within the last day and an hour
    // (by an earlier run of this pass, or by an order) are up to date
    expect(tierManagement.recalculateTiersSmart).toHaveBeenNthCalledWith(2, "new.myshopify.com", expect.objectContaining({
      resolvedBefore: new Date(now - DAY - 60 * 60 * 1000),
    }));
  });

  it("gives each due shop its share of the time left, so one big shop can't hold up the rest", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    db.shopSettings.findMany.mockResolvedValue([
      shop("big", "DAILY", null),
      shop("not-due", "WEEKLY", ago(DAY)),
      shop("small", "WEEKLY", null),
    ]);
    tierManagement.recalculateTiersSmart.mockImplementation(async (_shop: string, opts: { deadline: number }) => {
      now = opts.deadline; // uses all the time it is given
      return recalcResult({ complete: false });
    });

    await runCron();

    expect(recalculatedShops()).toEqual(["big.myshopify.com", "small.myshopify.com"]);
    const deadlines = tierManagement.recalculateTiersSmart.mock.calls.map(([, opts]) => opts.deadline);
    expect(deadlines).toEqual([1_000_000 + 120_000, 1_000_000 + 240_000]);
  });

  it("starts no shop once the run's time is up", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    db.shopSettings.findMany.mockResolvedValue([shop("slow", "WEEKLY", null), shop("next", "WEEKLY", null)]);
    tierManagement.recalculateTiersSmart.mockImplementation(async () => {
      now += 240_000; // a slow shop that overran its share
      return recalcResult();
    });

    const { body } = await runCron();

    expect(recalculatedShops()).toEqual(["slow.myshopify.com"]);
    expect(body.summary.shopsUnfinished).toBe(1);
    expect(db.shopSettings.update).toHaveBeenCalledTimes(1);
    expect(db.shopSettings.update).toHaveBeenCalledWith(expect.objectContaining({ where: { shop: "slow.myshopify.com" } }));
  });

  it("refreshes annual spending after the tiers, within the shop's share of the time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    db.shopSettings.findMany.mockResolvedValue([shop("one", "WEEKLY", null), shop("two", "WEEKLY", null)]);

    await runCron();

    expect(tierManagement.recalculateTiersSmart).toHaveBeenNthCalledWith(1, "one.myshopify.com", expect.objectContaining({
      deadline: 1_000_000 + 120_000,
    }));
    expect(tierManagement.refreshAnnualSpending).toHaveBeenNthCalledWith(1, "one.myshopify.com", { deadline: 1_000_000 + 120_000 });
    expect(tierManagement.refreshAnnualSpending.mock.invocationCallOrder[0])
      .toBeGreaterThan(tierManagement.recalculateTiersSmart.mock.invocationCallOrder[0]);
  });

  it("answers 500 when a shop has had no complete pass for two of its periods", async () => {
    db.shopSettings.findMany.mockResolvedValue([
      shop("stuck", "WEEKLY", ago(15 * DAY)),
      shop("late", "WEEKLY", ago(8 * DAY)),
      shop("new-big", "WEEKLY", null, ago(3 * DAY)),
      shop("old-big", "WEEKLY", null, ago(20 * DAY)),
    ]);
    tierManagement.recalculateTiersSmart.mockResolvedValue(recalcResult({ complete: false }));

    const { status, body } = await runCron();

    expect(body.summary.shopsOverdue).toBe(2);
    expect(body.summary.overdueShops).toEqual(["stuck.myshopify.com", "old-big.myshopify.com"]);
    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });
});
