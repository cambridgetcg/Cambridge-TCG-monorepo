/**
 * Billing Reconciliation Cron Job
 *
 * Detects and fixes inconsistencies between local subscription state
 * and Shopify's billing data.
 *
 * Schedule: Daily at 2 AM
 * Endpoint: GET /api/cron/billing-reconciliation
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  runReconciliationJob,
  getReconciliationStats,
  type ReconciliationJobResult,
} from "~/services/billing/reconciliation.server";
import { acquireCronLock, releaseCronLock, cleanupExpiredLocks } from "~/services/cron-lock.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const JOB_NAME = "billing-reconciliation";
const LOCK_TTL_MINUTES = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!verifyCronAuth(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  let lockId: string | undefined;

  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";

  // If stats only, just return current statistics (no lock needed)
  if (statsOnly) {
    try {
      const stats = await getReconciliationStats();
      return json({
        success: true,
        job: "billing-reconciliation",
        mode: "stats",
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[BillingReconciliationCron] Stats failed:", error);
      return json({
        success: false,
        error: "Unable to read reconciliation statistics",
      }, { status: 500 });
    }
  }

  // Acquire distributed lock for the actual reconciliation
  await cleanupExpiredLocks();
  const lock = await acquireCronLock(JOB_NAME, LOCK_TTL_MINUTES);

  if (!lock.acquired) {
    console.warn("[BillingReconciliationCron] Skipping - another instance is running");
    return json({
      success: false,
      skipped: true,
      reason: "Another instance is already running",
      existingLock: lock.existingLock,
    });
  }

  lockId = lock.lockId;
  console.log("[BillingReconciliationCron] Starting billing reconciliation...");

  try {
    // Run the reconciliation job
    const result: ReconciliationJobResult = await runReconciliationJob();

    const duration = Date.now() - startTime;

    console.log("[BillingReconciliationCron] Job completed:", {
      shopsChecked: result.shopsChecked,
      issuesFound: result.issuesFound,
      autoFixed: result.autoFixed,
      manualReviewRequired: result.manualReviewRequired,
      errors: result.errors.length,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "billing-reconciliation",
      result: {
        shopsChecked: result.shopsChecked,
        issuesFound: result.issuesFound,
        autoFixed: result.autoFixed,
        manualReviewRequired: result.manualReviewRequired,
        errorCount: result.errors.length,
      },
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[BillingReconciliationCron] Job failed:", error);

    return json({
      success: false,
      job: "billing-reconciliation",
      error: "Billing reconciliation failed",
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  } finally {
    // Always release the lock
    if (lockId) {
      await releaseCronLock(lockId);
    }
  }
};
