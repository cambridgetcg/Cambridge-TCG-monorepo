import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The scheduled-campaigns cron's answer to Vercel. Who gets a campaign, and
 * when, is covered on Postgres (test/integration/postgres/scheduled-campaigns).
 */

const db = vi.hoisted(() => ({
  emailCampaign: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
}));

const cronLock = vi.hoisted(() => ({
  acquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  cleanupExpiredLocks: vi.fn(),
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/services/cron-lock.server", () => cronLock);

import { loader } from "~/routes/api.cron.scheduled-campaigns";

function runCron() {
  return loader({
    request: new Request("https://rewardspro.test/api/cron/scheduled-campaigns", {
      headers: { Authorization: "Bearer the-cron-secret" },
    }),
    params: {},
    context: {},
  });
}

const env = { ...process.env };

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY = "test-verification-key";
  cronLock.acquireCronLock.mockReset().mockResolvedValue({ acquired: true, lockId: "lock-1" });
  cronLock.releaseCronLock.mockReset().mockResolvedValue(undefined);
  cronLock.cleanupExpiredLocks.mockReset().mockResolvedValue(undefined);
  db.emailCampaign.updateMany.mockReset().mockResolvedValue({ count: 0 });
  db.emailCampaign.count.mockReset().mockResolvedValue(0);
  db.emailCampaign.findMany.mockReset().mockResolvedValue([]);
  for (const method of ["log", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe("scheduled-campaigns cron", () => {
  it("answers 500 when the run fails, so Vercel shows it as failed", async () => {
    db.emailCampaign.findMany.mockRejectedValue(new Error("connection lost"));

    const response = await runCron();

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false });
    expect(cronLock.releaseCronLock).toHaveBeenCalledWith("lock-1");
  });

  it("answers 200 when there is nothing to send", async () => {
    const response = await runCron();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
  });

  it("leaves campaigns alone while marketing email is off", async () => {
    delete process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

    const response = await runCron();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: true });
    expect(db.emailCampaign.findMany).not.toHaveBeenCalled();
    expect(db.emailCampaign.updateMany).not.toHaveBeenCalled();
  });
});
