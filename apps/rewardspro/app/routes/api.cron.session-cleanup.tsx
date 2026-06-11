/**
 * Session Cleanup Cron Job
 *
 * Cleans up expired Shopify sessions from the database to prevent bloat.
 * Sessions that have passed their expiry date are permanently deleted.
 *
 * Schedule: Daily at 4 AM UTC
 * Endpoint: GET /api/cron/session-cleanup
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getAuroraClient } from "~/utils/aurora-data-api";

// Cleanup configuration
const CONFIG = {
  // Delete sessions expired more than this many hours ago (buffer for timezone issues)
  EXPIRY_BUFFER_HOURS: 24,
  // Maximum sessions to delete per run (prevent timeout)
  BATCH_SIZE: 1000,
  // Also delete sessions without expiry that are older than this many days
  ORPHAN_SESSION_DAYS: 90,
};

interface CleanupStats {
  expiredDeleted: number;
  orphanDeleted: number;
  totalBefore: number;
  totalAfter: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();

  // Verify cron secret
  const cronSecret = request.headers.get("X-Cron-Secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn("[SessionCleanupCron] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";
  const dryRun = url.searchParams.get("dry-run") === "true";

  console.log("[SessionCleanupCron] Starting session cleanup...", {
    statsOnly,
    dryRun,
  });

  try {
    const client = getAuroraClient();

    // Get current session count
    const countResult = await client.executeStatement(
      `SELECT COUNT(*) as total FROM "Session"`,
      []
    );
    const totalBefore = countResult.records?.[0]?.total || 0;

    // Get expired session count
    const expiredCountResult = await client.executeStatement(
      `SELECT COUNT(*) as count FROM "Session"
       WHERE expires IS NOT NULL
       AND expires < NOW() - INTERVAL '${CONFIG.EXPIRY_BUFFER_HOURS} hours'`,
      []
    );
    const expiredCount = expiredCountResult.records?.[0]?.count || 0;

    // Get orphan session count (no expiry, very old)
    const orphanCountResult = await client.executeStatement(
      `SELECT COUNT(*) as count FROM "Session"
       WHERE expires IS NULL
       AND id NOT LIKE 'offline_%'`,
      []
    );
    const orphanCount = orphanCountResult.records?.[0]?.count || 0;

    // If stats only, return current statistics
    if (statsOnly) {
      return json({
        success: true,
        job: "session-cleanup",
        mode: "stats",
        stats: {
          totalSessions: totalBefore,
          expiredSessions: expiredCount,
          orphanSessions: orphanCount,
          config: CONFIG,
        },
        timestamp: new Date().toISOString(),
      });
    }

    let expiredDeleted = 0;
    let orphanDeleted = 0;

    if (!dryRun) {
      // Delete expired sessions (with expiry date in the past)
      const deleteExpiredResult = await client.executeStatement(
        `DELETE FROM "Session"
         WHERE expires IS NOT NULL
         AND expires < NOW() - INTERVAL '${CONFIG.EXPIRY_BUFFER_HOURS} hours'
         RETURNING id`,
        []
      );
      expiredDeleted = deleteExpiredResult.records?.length || 0;

      console.log(`[SessionCleanupCron] Deleted ${expiredDeleted} expired sessions`);

      // Note: We intentionally do NOT delete offline sessions (id LIKE 'offline_%')
      // as these are needed for background operations and webhook processing.
      // Online sessions without expiry that are very old could be cleaned up,
      // but for safety we leave this as a future enhancement.
    }

    // Get final count
    const finalCountResult = await client.executeStatement(
      `SELECT COUNT(*) as total FROM "Session"`,
      []
    );
    const totalAfter = finalCountResult.records?.[0]?.total || 0;

    const duration = Date.now() - startTime;

    const stats: CleanupStats = {
      expiredDeleted,
      orphanDeleted,
      totalBefore,
      totalAfter,
    };

    console.log("[SessionCleanupCron] Job completed:", {
      ...stats,
      dryRun,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "session-cleanup",
      dryRun,
      result: stats,
      config: CONFIG,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[SessionCleanupCron] Job failed:", error);

    return json(
      {
        success: false,
        job: "session-cleanup",
        error: error.message,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};
