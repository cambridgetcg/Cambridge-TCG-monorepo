/**
 * App Uninstalled Webhook Handler
 *
 * Handles the APP_UNINSTALLED webhook from Shopify.
 * Performs comprehensive cleanup of all shop data for GDPR compliance.
 *
 * IMPORTANT: This webhook may be triggered multiple times.
 * The cleanup is idempotent - running it multiple times is safe. It runs in
 * one transaction, and a failure answers 5xx so Shopify redelivers.
 *
 * Data Deleted:
 * - All customer records and their associated data
 * - All order records and ledger entries
 * - All tier configurations
 * - All billing and subscription data
 * - All sessions and authentication data
 * - All webhook processing records
 * - All analytics and email data
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { cleanupShopData, type CleanupResult } from "../services/shop-data-cleanup.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  // We still attempt cleanup to ensure all data is removed.

  // Perform comprehensive data cleanup (atomic: all or nothing)
  let result: CleanupResult | null = null;
  try {
    result = await cleanupShopData(shop);
  } catch (error) {
    console.error(`[Webhook] Cleanup threw for ${shop}:`, error);
  }

  if (result?.success) {
    console.log(
      `[Webhook] Successfully cleaned up data for ${shop}:`,
      `${Object.values(result.deletedCounts).reduce((a, b) => a + b, 0)} records deleted`,
      `in ${result.durationMs}ms`
    );

    // Log summary of deleted records for audit trail
    const significantDeletes = Object.entries(result.deletedCounts)
      .filter(([, count]) => count > 0)
      .map(([model, count]) => `${model}: ${count}`)
      .join(", ");

    if (significantDeletes) {
      console.log(`[Webhook] Deleted records summary: ${significantDeletes}`);
    }
    return new Response();
  }

  if (result) {
    console.error(`[Webhook] Cleanup failed for ${shop}:`, result.errors);
  }

  // At least delete sessions (the minimum required for security), then
  // answer 5xx so Shopify redelivers and the full cleanup is retried.
  if (session) {
    try {
      await db.session.deleteMany({ where: { shop } });
      console.log(`[Webhook] Fallback: Deleted sessions for ${shop}`);
    } catch (sessionError) {
      console.error(`[Webhook] Failed to delete sessions:`, sessionError);
    }
  }
  return new Response("Cleanup failed", { status: 500 });
};
