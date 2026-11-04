import { json } from "@remix-run/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { CRON_RECORD_SHOP, cronFailed, cronHealth, monitoredCron } from "~/services/cron-monitor.server";
import { loader as webhookCleanup } from "~/routes/api.cron.webhook-cleanup";
import { hasTestDatabase, resetDatabase } from "./database";

const DAY = 24 * 60 * 60 * 1000;
const SHOP = "cron-monitor.myshopify.com";
const originalSecret = process.env.CRON_SECRET;

function cronRequest(job: string) {
  return new Request(`https://rewardspro.test/api/cron/${job}`, {
    headers: { Authorization: "Bearer the-cron-secret" },
  });
}

describe.skipIf(!hasTestDatabase)("cron run records on Postgres", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.CRON_SECRET = "the-cron-secret";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("keeps one row per job and outcome, and readiness reads them", async () => {
    const ok = monitoredCron("mission-status", async () => json({ success: true }));
    const failing = monitoredCron("mission-status", async ({ request }) => {
      cronFailed(request, new Error("challenge table locked"));
      return json({ success: false }, { status: 500 });
    });

    await ok({ request: cronRequest("mission-status"), params: {}, context: {} });
    await ok({ request: cronRequest("mission-status"), params: {}, context: {} });
    await failing({ request: cronRequest("mission-status"), params: {}, context: {} });

    const rows = await prisma.syncStatus.findMany({ where: { shop: CRON_RECORD_SHOP }, orderBy: { syncType: "asc" } });
    expect(rows.map((row) => [row.syncType, row.status])).toEqual([
      ["mission-status:failed", "FAILED"],
      ["mission-status:started", "RUNNING"],
      ["mission-status:succeeded", "COMPLETED"],
    ]);
    expect(rows[0].errorMessage).toBe("Error: challenge table locked");

    const health = await cronHealth();
    expect(health.jobs["mission-status"]).toMatchObject({ stale: false });
    expect(health.jobs["mission-status"].lastFailedAt).toBe(rows[0].lastSyncAt.toISOString());
  });

  it("webhook-cleanup deletes order webhook records after 30 days and errors after 90", async () => {
    const now = Date.now();
    await prisma.webhookProcessed.createMany({
      data: [
        { webhookId: "old", topic: "ORDERS_PAID", shop: SHOP, processedAt: new Date(now - 31 * DAY) },
        { webhookId: "recent", topic: "ORDERS_PAID", shop: SHOP, processedAt: new Date(now - 29 * DAY) },
      ],
    });
    await prisma.webhookError.createMany({
      data: [
        { shop: SHOP, topic: "ORDERS_PAID", error: "old", createdAt: new Date(now - 91 * DAY) },
        { shop: SHOP, topic: "ORDERS_PAID", error: "recent", createdAt: new Date(now - 89 * DAY) },
      ],
    });

    const response = await webhookCleanup({ request: cronRequest("webhook-cleanup"), params: {}, context: {} });

    expect(response.status).toBe(200);
    await expect(prisma.webhookProcessed.findMany({ select: { webhookId: true } })).resolves.toEqual([{ webhookId: "recent" }]);
    await expect(prisma.webhookError.findMany({ select: { error: true } })).resolves.toEqual([{ error: "recent" }]);
    await expect(
      prisma.syncStatus.count({ where: { shop: CRON_RECORD_SHOP, syncType: "webhook-cleanup:succeeded" } }),
    ).resolves.toBe(1);
  });
});
