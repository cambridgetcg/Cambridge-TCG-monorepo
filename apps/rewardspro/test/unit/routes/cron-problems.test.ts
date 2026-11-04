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
  shopSettings: { findMany: vi.fn() },
  storeCreditLedger: { findMany: vi.fn(), groupBy: vi.fn() },
  challenge: { findMany: vi.fn(), update: vi.fn() },
  emailCampaign: { updateMany: vi.fn(), findMany: vi.fn() },
}));
const shopify = vi.hoisted(() => ({ unauthenticated: { admin: vi.fn() } }));
const stuck = vi.hoisted(() => ({ reconcileStuckCashback: vi.fn() }));
const campaigns = vi.hoisted(() => ({ sendCampaign: vi.fn(), notSentMetrics: vi.fn(() => ({})) }));
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
vi.mock("~/services/monitoring/sentry.service", () => ({ SentryService: sentryService }));

import { loader as cashbackReconciliation } from "~/routes/api.cron.cashback-reconciliation";
import { loader as missionStatus } from "~/routes/api.cron.mission-status";
import { loader as scheduledCampaigns } from "~/routes/api.cron.scheduled-campaigns";

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
    for (const method of Object.values(table)) method.mockReset();
  }
  db.cronLock.create.mockImplementation(async ({ data }) => data);
  db.cronLock.deleteMany.mockResolvedValue({ count: 0 });
  db.cronLock.delete.mockResolvedValue({});
  db.syncStatus.upsert.mockResolvedValue({});
  db.syncStatus.findMany.mockResolvedValue([]);
  shopify.unauthenticated.admin.mockReset();
  stuck.reconcileStuckCashback.mockReset();
  campaigns.sendCampaign.mockReset();
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

  it("scheduled-campaigns: a campaign that failed to send reaches Sentry", async () => {
    db.emailCampaign.updateMany.mockResolvedValue({ count: 0 });
    db.emailCampaign.findMany.mockResolvedValue([
      { id: "c1", shop: "one.myshopify.com", name: "November", scheduledFor: new Date(Date.now() - 1000) },
    ]);
    campaigns.sendCampaign.mockRejectedValue(new Error("SendGrid answered 401"));

    const response = await run(scheduledCampaigns, "scheduled-campaigns");

    expect(response.status).toBe(200);
    expect(outcome("scheduled-campaigns")).toEqual({
      type: "scheduled-campaigns:partial",
      errorMessage: "1 failed; first: Error: SendGrid answered 401",
    });
    expect(problemReport("scheduled-campaigns")?.[2]).toMatchObject({ tags: { "cron.job": "scheduled-campaigns" } });
  });
});
