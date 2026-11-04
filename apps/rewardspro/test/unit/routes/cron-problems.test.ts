import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A cron run that finishes but fails part of its work (a shop, an entry, a
 * mission) still answers 200, so Vercel shows it as a success. The cron
 * monitor records it as partial and Sentry gets a warning tagged cron.job,
 * which the "cron.job is set" issue alert catches.
 */

const db = vi.hoisted(() => ({
  cronLock: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  syncStatus: { upsert: vi.fn(), findMany: vi.fn() },
  shopSettings: { findMany: vi.fn(), update: vi.fn() },
  storeCreditLedger: { findMany: vi.fn(), groupBy: vi.fn() },
  challenge: { findMany: vi.fn(), update: vi.fn() },
  emailCampaign: { updateMany: vi.fn(), findMany: vi.fn() },
  tierSubscription: { findMany: vi.fn(), update: vi.fn() },
  tierPurchase: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
const shopify = vi.hoisted(() => ({ unauthenticated: { admin: vi.fn() } }));
const stuck = vi.hoisted(() => ({ reconcileStuckCashback: vi.fn() }));
const campaigns = vi.hoisted(() => ({ sendCampaign: vi.fn(), markCutOffSends: vi.fn(), notSentMetrics: vi.fn(() => ({})) }));
const tierResolution = vi.hoisted(() => ({ updateCustomerToEffectiveTier: vi.fn() }));
const tierManagement = vi.hoisted(() => ({ recalculateTiersSmart: vi.fn(), refreshAnnualSpending: vi.fn() }));
const sentryService = vi.hoisted(() => ({
  isEnabled: vi.fn(() => false),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, ...shopify }));
vi.mock("~/services/stuck-cashback.server", () => stuck);
vi.mock("~/services/campaign-send.server", () => campaigns);
vi.mock("~/services/marketing-email.server", () => ({ marketingEmailBlockedReason: () => null }));
vi.mock("~/services/tier-resolution.server", () => tierResolution);
vi.mock("~/services/tier-management.server", () => tierManagement);
vi.mock("~/services/monitoring/sentry.service", () => ({ SentryService: sentryService }));

import { loader as cashbackReconciliation } from "~/routes/api.cron.cashback-reconciliation";
import { loader as missionStatus } from "~/routes/api.cron.mission-status";
import { loader as scheduledCampaigns } from "~/routes/api.cron.scheduled-campaigns";
import { loader as tierMaintenance } from "~/routes/api.cron.tier-maintenance";
import { loader as tierRecalculation } from "~/routes/api.cron.tier-recalculation";

type CronLoader = (args: { request: Request; params: object; context: object }) => Promise<Response>;

function run(loader: CronLoader, job: string) {
  return loader({
    request: new Request(`https://rewardspro.test/api/cron/${job}`, {
      headers: { Authorization: "Bearer the-cron-secret" },
    }),
    params: {},
    context: {},
  });
}

// The run's own record, after its start
function outcome(job: string) {
  const [, ended] = db.syncStatus.upsert.mock.calls.map(([args]) => args.where.shop_syncType.syncType as string)
    .filter((type) => type.startsWith(`${job}:`));
  const row = db.syncStatus.upsert.mock.calls.find(([args]) => args.where.shop_syncType.syncType === ended)?.[0];
  return { type: ended, errorMessage: row?.update.errorMessage as string | null };
}

function problemReport(job: string) {
  return sentryService.captureMessage.mock.calls.find(([message]) => message === `Cron ${job} finished with problems`);
}

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  for (const table of Object.values(db)) {
    if (typeof table === "function") continue;
    for (const method of Object.values(table)) method.mockReset();
  }
  db.$queryRaw.mockReset().mockResolvedValue([]);
  db.cronLock.create.mockImplementation(async ({ data }) => data);
  db.cronLock.deleteMany.mockResolvedValue({ count: 0 });
  db.cronLock.delete.mockResolvedValue({});
  db.syncStatus.upsert.mockResolvedValue({});
  db.syncStatus.findMany.mockResolvedValue([]);
  shopify.unauthenticated.admin.mockReset();
  stuck.reconcileStuckCashback.mockReset();
  campaigns.sendCampaign.mockReset();
  campaigns.markCutOffSends.mockReset().mockResolvedValue(0);
  tierResolution.updateCustomerToEffectiveTier.mockReset();
  tierManagement.recalculateTiersSmart.mockReset();
  tierManagement.refreshAnnualSpending.mockReset().mockResolvedValue({ processed: 0, updated: 0, errors: 0, duration: 1, complete: true });
  sentryService.captureException.mockReset();
  sentryService.captureMessage.mockReset();
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("a cron run that fails part of its work", () => {
  it("cashback-reconciliation: no shop's Admin API and a failed stuck-cashback check reach Sentry", async () => {
    stuck.reconcileStuckCashback.mockRejectedValue(new Error("store credit history unreadable"));
    db.shopSettings.findMany.mockResolvedValue([
      { shop: "one.myshopify.com", storeCurrency: "GBP" },
      { shop: "two.myshopify.com", storeCurrency: "GBP" },
    ]);
    db.storeCreditLedger.findMany.mockResolvedValue([
      { id: "entry-1", shop: "one.myshopify.com" },
      { id: "entry-2", shop: "one.myshopify.com" },
      { id: "entry-3", shop: "two.myshopify.com" },
    ]);
    db.storeCreditLedger.groupBy.mockResolvedValue([]);
    shopify.unauthenticated.admin.mockRejectedValue(new Error("Could not find a session for the shop"));

    const response = await run(cashbackReconciliation, "cashback-reconciliation");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ synced: 0, failed: 3 });
    expect(outcome("cashback-reconciliation")).toEqual({
      type: "cashback-reconciliation:partial",
      errorMessage: "4 failed; first: Error: store credit history unreadable",
    });
    expect(problemReport("cashback-reconciliation")).toEqual([
      "Cron cashback-reconciliation finished with problems",
      "warning",
      {
        tags: { "cron.job": "cashback-reconciliation", "cron.partial": "true" },
        extra: { problems: 4, firstProblem: "Error: store credit history unreadable" },
      },
    ]);
    expect(sentryService.captureException).not.toHaveBeenCalled();
  });

  it("cashback-reconciliation: stuck cashback whose check failed counts too", async () => {
    stuck.reconcileStuckCashback.mockResolvedValue({ checked: 2, issued: 0, returned: 0, needsReview: 0, waiting: 0, failed: 2, clawbacksSettled: 0 });
    db.shopSettings.findMany.mockResolvedValue([]);

    const response = await run(cashbackReconciliation, "cashback-reconciliation");

    expect(response.status).toBe(200);
    expect(outcome("cashback-reconciliation").type).toBe("cashback-reconciliation:partial");
    expect(problemReport("cashback-reconciliation")?.[2]).toMatchObject({ extra: { problems: 2 } });
  });

  it("cashback-reconciliation: a run with nothing failing is a success", async () => {
    stuck.reconcileStuckCashback.mockResolvedValue({ checked: 0, issued: 0, returned: 0, needsReview: 0, waiting: 0, failed: 0, clawbacksSettled: 0 });
    db.shopSettings.findMany.mockResolvedValue([]);

    const response = await run(cashbackReconciliation, "cashback-reconciliation");

    expect(response.status).toBe(200);
    expect(outcome("cashback-reconciliation").type).toBe("cashback-reconciliation:succeeded");
    expect(problemReport("cashback-reconciliation")).toBeUndefined();
  });

  it("mission-status: a mission that couldn't be started reaches Sentry", async () => {
    db.challenge.findMany
      .mockResolvedValueOnce([
        { id: "m1", shop: "one.myshopify.com", name: "Spring", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 86_400_000) },
      ])
      .mockResolvedValueOnce([]);
    db.challenge.update.mockRejectedValue(new Error("challenge row locked"));

    const response = await run(missionStatus, "mission-status");

    expect(response.status).toBe(200);
    expect(outcome("mission-status")).toEqual({
      type: "mission-status:partial",
      errorMessage: "1 failed; first: Error: challenge row locked",
    });
    expect(problemReport("mission-status")?.[2]).toMatchObject({ tags: { "cron.job": "mission-status" } });
  });

  // scheduled-campaigns answers 500 for any campaign it failed to send (#138); Sentry gets the real error
  it.each([
    ["threw", () => campaigns.sendCampaign.mockRejectedValue(new Error("SendGrid answered 401")), "Error: SendGrid answered 401"],
    [
      "came back not sent",
      () => campaigns.sendCampaign.mockResolvedValue({ status: "not_sent", cause: "failed", reason: "Something went wrong while this campaign was sending" }),
      "Error: Something went wrong while this campaign was sending",
    ],
    [
      "got no answer from the email service",
      () => campaigns.sendCampaign.mockResolvedValue({ status: "may_have_sent", reason: "Some or all customers may have received it" }),
      "Error: Some or all customers may have received it",
    ],
  ])("scheduled-campaigns: a campaign whose sending %s fails the run with that error", async (_case, setUp, expected) => {
    db.emailCampaign.updateMany.mockResolvedValue({ count: 0 });
    db.emailCampaign.findMany.mockResolvedValue([
      { id: "c1", shop: "one.myshopify.com", name: "November", scheduledFor: new Date(Date.now() - 1000) },
    ]);
    setUp();

    const response = await run(scheduledCampaigns, "scheduled-campaigns");

    expect(response.status).toBe(500);
    expect(outcome("scheduled-campaigns")).toEqual({ type: "scheduled-campaigns:failed", errorMessage: expected });
    expect(sentryService.captureException).toHaveBeenCalledTimes(1);
    expect(String(sentryService.captureException.mock.calls[0][0])).toBe(expected);
    expect(sentryService.captureException.mock.calls[0][1]).toMatchObject({ tags: { "cron.job": "scheduled-campaigns" } });
  });

  it("scheduled-campaigns: sends cut off part way fail the run with what happened to them", async () => {
    db.emailCampaign.updateMany.mockResolvedValue({ count: 0 });
    db.emailCampaign.findMany.mockResolvedValue([]);
    campaigns.markCutOffSends.mockResolvedValue(2);

    const response = await run(scheduledCampaigns, "scheduled-campaigns");

    const expected = "Error: 2 campaigns were cut off while sending; marked failed, as they may have gone out";
    expect(response.status).toBe(500);
    expect(outcome("scheduled-campaigns")).toEqual({ type: "scheduled-campaigns:failed", errorMessage: expected });
    expect(sentryService.captureException).toHaveBeenCalledTimes(1);
    expect(String(sentryService.captureException.mock.calls[0][0])).toBe(expected);
  });

  it("scheduled-campaigns: a campaign its audience held back is not a problem", async () => {
    db.emailCampaign.updateMany.mockResolvedValue({ count: 0 });
    db.emailCampaign.findMany.mockResolvedValue([
      { id: "c1", shop: "one.myshopify.com", name: "November", scheduledFor: new Date(Date.now() - 1000) },
    ]);
    campaigns.sendCampaign.mockResolvedValue({ status: "not_sent", cause: "refused", reason: "No customer has agreed to marketing email" });

    const response = await run(scheduledCampaigns, "scheduled-campaigns");

    expect(response.status).toBe(200);
    expect(outcome("scheduled-campaigns").type).toBe("scheduled-campaigns:succeeded");
    expect(sentryService.captureException).not.toHaveBeenCalled();
    expect(problemReport("scheduled-campaigns")).toBeUndefined();
  });

  // The tier crons answer 500 for any customer or shop they failed on; Sentry gets what failed
  it.each([
    [
      "a membership it couldn't end",
      () => {
        db.tierSubscription.findMany.mockResolvedValue([
          { id: "sub-1", shop: "one.myshopify.com", customerId: "customer-1", endDate: new Date(Date.now() - 1000), tier: { name: "Gold" } },
        ]);
        db.tierSubscription.update.mockResolvedValue({});
        tierResolution.updateCustomerToEffectiveTier.mockRejectedValue(new Error("customer row locked"));
      },
      "Error: customer row locked",
    ],
    [
      "a tier it couldn't repair",
      () => {
        db.$queryRaw.mockResolvedValue([{ id: "customer-1", shop: "one.myshopify.com", currentTierId: "gold", effectiveTierId: null }]);
        tierResolution.updateCustomerToEffectiveTier.mockResolvedValue({ success: false, error: "Customer not found" });
      },
      "Error: Failed to repair customer customer-1: Customer not found",
    ],
  ])("tier-maintenance: %s fails the run with what failed", async (_case, setUp, expected) => {
    db.tierSubscription.findMany.mockResolvedValue([]);
    db.tierPurchase.findMany.mockResolvedValue([]);
    setUp();

    const response = await run(tierMaintenance, "tier-maintenance");

    expect(response.status).toBe(500);
    expect(outcome("tier-maintenance")).toEqual({ type: "tier-maintenance:failed", errorMessage: expected });
    expect(sentryService.captureException).toHaveBeenCalledTimes(1);
    expect(String(sentryService.captureException.mock.calls[0][0])).toBe(expected);
    expect(sentryService.captureException.mock.calls[0][1]).toMatchObject({ tags: { "cron.job": "tier-maintenance" } });
  });

  const dueShop = (createdAt = new Date()) => ({ shop: "one.myshopify.com", tierRecalculationFrequency: "DAILY", tierRecalculationLastRun: null, createdAt });
  const recalculated = (overrides: Record<string, unknown>) => ({
    processed: 3, remaining: 0, upgraded: 0, downgraded: 0, unchanged: 3, errors: 0, complete: true,
    bySource: { manualOverride: 0, tierSubscription: 0, tierPurchase: 0, spendingBased: 3, none: 0 },
    engine: "LEGACY", optimizedPath: false, ...overrides,
  });

  it.each([
    [
      "a shop it couldn't recalculate",
      () => tierManagement.recalculateTiersSmart.mockRejectedValue(new Error("customer table unreadable")),
      "Error: customer table unreadable",
    ],
    [
      "customers it couldn't recalculate",
      () => tierManagement.recalculateTiersSmart.mockResolvedValue(recalculated({ errors: 2 })),
      "Error: 2 customers failed tier recalculation in one.myshopify.com",
    ],
    [
      "a shop that has fallen behind",
      () => {
        db.shopSettings.findMany.mockResolvedValue([dueShop(new Date(Date.now() - 30 * 86_400_000))]);
        tierManagement.recalculateTiersSmart.mockResolvedValue(recalculated({ complete: false, remaining: 5 }));
      },
      "Error: 1 shops overdue for tier recalculation: one.myshopify.com",
    ],
  ])("tier-recalculation: %s fails the run with what failed", async (_case, setUp, expected) => {
    db.shopSettings.findMany.mockResolvedValue([dueShop()]);
    db.shopSettings.update.mockResolvedValue({});
    setUp();

    const response = await run(tierRecalculation, "tier-recalculation");

    expect(response.status).toBe(500);
    expect(outcome("tier-recalculation")).toEqual({ type: "tier-recalculation:failed", errorMessage: expected });
    expect(sentryService.captureException).toHaveBeenCalledTimes(1);
    expect(String(sentryService.captureException.mock.calls[0][0])).toBe(expected);
    expect(sentryService.captureException.mock.calls[0][1]).toMatchObject({ tags: { "cron.job": "tier-recalculation" } });
  });
});
