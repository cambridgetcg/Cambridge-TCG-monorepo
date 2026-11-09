/**
 * Webhook Cleanup Cron Job
 *
 * Deletes webhook records the app no longer needs:
 * - the order webhooks' idempotency records (WebhookProcessed) after 30
 *   days. Shopify retries a failed delivery for up to four hours and can
 *   deliver up to a day late, so a month is well past any redelivery;
 * - the order webhooks' error log (WebhookError) after 90 days (the
 *   dashboard reads the last 24 hours);
 * - billing webhook records (ProcessedWebhook) after 7 days;
 * - customer data request reports past their retention period
 *   (services/customer-data-request.server.ts).
 *
 * Schedule: Sundays at 05:00 UTC ("0 5 * * 0" in vercel.json)
 * Endpoint: GET /api/cron/webhook-cleanup
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  cleanupOldWebhooks,
  getWebhookStats,
} from "~/services/billing/webhook-processing.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";
import { deleteExpiredDataRequests } from "~/services/customer-data-request.server";
import { cronFailed, monitoredCron } from "~/services/cron-monitor.server";
import prisma from "~/db.server";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_PROCESSED_KEEP_DAYS = 30;
const WEBHOOK_ERROR_KEEP_DAYS = 90;

export const loader = monitoredCron("webhook-cleanup", async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";

  // If stats only, just return current statistics
  if (statsOnly) {
    try {
      const stats = await getWebhookStats();
      return json({
        success: true,
        job: "webhook-cleanup",
        mode: "stats",
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[WebhookCleanupCron] Stats failed:", error);
      return json({
        success: false,
        error: "Unable to read webhook statistics",
      }, { status: 500 });
    }
  }

  console.log("[WebhookCleanupCron] Starting webhook cleanup...");

  try {
    // Get stats before cleanup
    const statsBefore = await getWebhookStats();

    // Run cleanup
    const deletedCount = await cleanupOldWebhooks();
    const { count: webhooksProcessedDeleted } = await prisma.webhookProcessed.deleteMany({
      where: { processedAt: { lt: new Date(startTime - WEBHOOK_PROCESSED_KEEP_DAYS * DAY_MS) } },
    });
    const { count: webhookErrorsDeleted } = await prisma.webhookError.deleteMany({
      where: { createdAt: { lt: new Date(startTime - WEBHOOK_ERROR_KEEP_DAYS * DAY_MS) } },
    });
    const expiredDataRequests = await deleteExpiredDataRequests();

    // Get stats after cleanup
    const statsAfter = await getWebhookStats();

    const duration = Date.now() - startTime;

    console.log("[WebhookCleanupCron] Job completed:", {
      deleted: deletedCount,
      webhooksProcessedDeleted,
      webhookErrorsDeleted,
      expiredDataRequests,
      before: statsBefore.total,
      after: statsAfter.total,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "webhook-cleanup",
      result: {
        deleted: deletedCount,
        webhooksProcessedDeleted,
        webhookErrorsDeleted,
        expiredDataRequests,
        recordsBefore: statsBefore.total,
        recordsAfter: statsAfter.total,
        currentStats: statsAfter,
      },
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[WebhookCleanupCron] Job failed:", error);
    cronFailed(request, error);

    return json({
      success: false,
      job: "webhook-cleanup",
      error: "Webhook cleanup failed",
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
});
