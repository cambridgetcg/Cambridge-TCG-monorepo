/**
 * Subscription Expiry Check Cron Job
 *
 * Detects and handles expired subscriptions that may have been missed by webhooks.
 * Shopify doesn't always fire webhooks for natural subscription expiry.
 *
 * Schedule: Daily at midnight
 * Endpoint: GET /api/cron/subscription-expiry
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  runExpiryCheckJob,
  type ExpiryCheckResult,
} from "~/services/billing/subscription-expiry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();

  // Verify cron secret
  const cronSecret = request.headers.get("X-Cron-Secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn("[SubscriptionExpiryCron] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[SubscriptionExpiryCron] Starting subscription expiry check...");

  try {
    // Run the expiry check job
    const result: ExpiryCheckResult = await runExpiryCheckJob();

    const duration = Date.now() - startTime;

    console.log("[SubscriptionExpiryCron] Job completed:", {
      ...result,
      durationMs: duration,
    });

    return json({
      success: true,
      job: "subscription-expiry",
      result: {
        checked: result.checked,
        expired: result.expired,
        updated: result.updated,
        errors: result.errors.length,
      },
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error("[SubscriptionExpiryCron] Job failed:", error);

    return json({
      success: false,
      job: "subscription-expiry",
      error: error.message,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};
