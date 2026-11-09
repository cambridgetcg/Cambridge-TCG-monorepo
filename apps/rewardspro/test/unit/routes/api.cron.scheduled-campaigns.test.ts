import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CampaignSend from "~/services/campaign-send.server";

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

const campaigns = vi.hoisted(() => ({ sendCampaign: vi.fn(), markCutOffSends: vi.fn() }));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));
vi.mock("~/services/cron-lock.server", () => cronLock);
vi.mock("~/services/campaign-send.server", async (importOriginal) => ({
  ...(await importOriginal<typeof CampaignSend>()),
  sendCampaign: campaigns.sendCampaign,
  markCutOffSends: campaigns.markCutOffSends,
}));

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
  campaigns.sendCampaign.mockReset();
  campaigns.markCutOffSends.mockReset().mockResolvedValue(0);
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

  it("tries every due campaign, then answers 500 when any of them couldn't be sent", async () => {
    db.emailCampaign.findMany.mockResolvedValue([
      { id: "c1", shop: "a.myshopify.com", name: "One", scheduledFor: new Date() },
      { id: "c2", shop: "b.myshopify.com", name: "Two", scheduledFor: new Date() },
    ]);
    campaigns.sendCampaign.mockRejectedValue(new Error("connection lost"));

    const response = await runCron();

    expect(campaigns.sendCampaign).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, summary: { failed: 2, errorCount: 2 } });
    expect(cronLock.releaseCronLock).toHaveBeenCalledWith("lock-1");
  });

  it("answers 500 when the email service refuses a campaign, but 200 when the shop's own limits stop one", async () => {
    db.emailCampaign.findMany.mockResolvedValue([{ id: "c1", shop: "a.myshopify.com", name: "One", scheduledFor: new Date() }]);

    campaigns.sendCampaign.mockResolvedValue({ status: "not_sent", reason: "RewardsPro couldn't send this campaign", cause: "failed" });
    expect((await runCron()).status).toBe(500);

    campaigns.sendCampaign.mockResolvedValue({ status: "not_sent", reason: "over the monthly limit", cause: "refused" });
    expect((await runCron()).status).toBe(200);
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
