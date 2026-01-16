/**
 * Points Maintenance Cron Job
 *
 * Handles scheduled maintenance for the Points Engagement System:
 * - Points expiration processing
 * - Expiration warning emails
 * - Streak updates
 *
 * Schedule: Daily at 1:00 AM UTC
 * Endpoint: GET /api/cron/points-maintenance
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  runAllShopsMaintenance,
  type AllShopsMaintenanceResult,
} from "~/services/points-maintenance.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();

  // Verify cron secret
  const cronSecret = request.headers.get("X-Cron-Secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn("[PointsMaintenanceCron] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[PointsMaintenanceCron] Starting points maintenance job...");

  try {
    // Run the maintenance job for all shops
    const result: AllShopsMaintenanceResult = await runAllShopsMaintenance();

    const duration = Date.now() - startTime;

    console.log("[PointsMaintenanceCron] Job completed:", {
      shopsProcessed: result.shopsProcessed,
      totalCustomersAffected: result.totalCustomersAffected,
      totalPointsExpired: result.totalPointsExpired,
      totalWarningsSent: result.totalWarningsSent,
      errorsCount: result.errors.length,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "points-maintenance",
      result: {
        shopsProcessed: result.shopsProcessed,
        totalCustomersAffected: result.totalCustomersAffected,
        totalPointsExpired: result.totalPointsExpired,
        totalWarningsSent: result.totalWarningsSent,
        errors: result.errors,
        shopResults: result.results.map((r) => ({
          shop: r.shop,
          expiredPoints: r.expiration.totalPointsExpired,
          customersAffected: r.expiration.customersAffected,
          warningsSent: r.warnings.customersSentWarning,
          streaksUpdated: r.streaks.streaksIncremented + r.streaks.streaksReset,
          errors: r.errors,
        })),
      },
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[PointsMaintenanceCron] Job failed:", error);

    return json({
      success: false,
      job: "points-maintenance",
      error: error.message,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};
