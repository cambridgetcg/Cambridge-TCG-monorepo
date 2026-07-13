/**
 * Webhook Cleanup Cron Job
 *
 * Cleans up old processed webhook records to prevent database bloat.
 * Keeps records for 7 days for debugging purposes.
 *
 * Schedule: Weekly on Sunday at 3 AM
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
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

    // Get stats after cleanup
    const statsAfter = await getWebhookStats();

    const duration = Date.now() - startTime;

    console.log("[WebhookCleanupCron] Job completed:", {
      deleted: deletedCount,
      before: statsBefore.total,
      after: statsAfter.total,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "webhook-cleanup",
      result: {
        deleted: deletedCount,
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

    return json({
      success: false,
      job: "webhook-cleanup",
      error: "Webhook cleanup failed",
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};
