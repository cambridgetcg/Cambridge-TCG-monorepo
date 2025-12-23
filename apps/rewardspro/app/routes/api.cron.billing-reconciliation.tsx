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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();

  // Verify cron secret
  const cronSecret = request.headers.get("X-Cron-Secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn("[BillingReconciliationCron] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";

  // If stats only, just return current statistics
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
      return json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }
  }

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
        errors: result.errors.length,
        errorDetails: result.errors.slice(0, 10), // First 10 errors
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
      error: error.message,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};
