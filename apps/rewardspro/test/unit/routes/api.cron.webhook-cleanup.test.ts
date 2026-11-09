import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The weekly webhook-cleanup cron. The order webhooks' idempotency records
 * (WebhookProcessed) and their error log (WebhookError) grow with every
 * order, so it trims them once Shopify can no longer redeliver: Shopify
 * retries a delivery for four hours and can deliver up to a day late, and a
 * month is kept. A failed delete is a failed run, not "deleted 0".
 */

const DAY = 24 * 60 * 60 * 1000;

const db = vi.hoisted(() => ({
  processedWebhook: { deleteMany: vi.fn(), count: vi.fn() },
  customerDataRequest: { deleteMany: vi.fn() },
  webhookProcessed: { deleteMany: vi.fn() },
  webhookError: { deleteMany: vi.fn() },
  syncStatus: { upsert: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: db, db, prisma: db }));

import { loader } from "~/routes/api.cron.webhook-cleanup";

function runCron(query = "") {
  return loader({
    request: new Request(`https://rewardspro.test/api/cron/webhook-cleanup${query}`, {
      headers: { Authorization: "Bearer the-cron-secret" },
    }),
    params: {},
    context: {},
  });
}

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "the-cron-secret";
  for (const model of Object.values(db)) {
    for (const method of Object.values(model)) method.mockReset().mockResolvedValue({ count: 0 });
  }
  db.processedWebhook.count.mockResolvedValue(0);
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("webhook-cleanup cron", () => {
  it("deletes order webhook records after 30 days and webhook errors after 90", async () => {
    db.webhookProcessed.deleteMany.mockResolvedValue({ count: 12 });
    db.webhookError.deleteMany.mockResolvedValue({ count: 3 });
    const before = Date.now();

    const response = await runCron();

    expect(response.status).toBe(200);
    const processedCutoff = db.webhookProcessed.deleteMany.mock.calls[0][0].where.processedAt.lt as Date;
    const errorCutoff = db.webhookError.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    expect(Math.round((before - processedCutoff.getTime()) / DAY)).toBe(30);
    expect(Math.round((before - errorCutoff.getTime()) / DAY)).toBe(90);
    const body = await response.json();
    expect(body.result).toMatchObject({ webhooksProcessedDeleted: 12, webhookErrorsDeleted: 3 });
  });

  it("answers 500 when deleting old billing webhook records fails", async () => {
    db.processedWebhook.deleteMany.mockRejectedValue(new Error("connection refused"));

    const response = await runCron();

    expect(response.status).toBe(500);
  });

  it("answers 500 when it can't count billing webhook records", async () => {
    db.processedWebhook.count.mockRejectedValue(new Error("connection refused"));

    const response = await runCron();

    expect(response.status).toBe(500);
  });

  it("answers 500 when trimming the order webhook records fails", async () => {
    db.webhookProcessed.deleteMany.mockRejectedValue(new Error("connection refused"));

    const response = await runCron();

    expect(response.status).toBe(500);
  });
});
