import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { startCreditSyncJob } from "../services/credit-sync-job.server";

/**
 * POST /api/credit-sync/start
 * Starts a new store credit sync job
 *
 * Syncs Shopify store credit balances to local database for all customers.
 * Use this when first installing the app or to reconcile discrepancies.
 *
 * Request body (optional):
 * - triggeredBy: string ('manual' | 'install')
 *
 * Response:
 * - success: boolean
 * - jobId: string
 * - status: string
 * - progress: { processedCount, totalCustomers, updatedCount, skippedCount, ... }
 * - hasMore: boolean
 * - error?: string
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Parse request body for triggeredBy
    let triggeredBy = 'manual';
    try {
      const body = await request.json();
      if (body.triggeredBy) {
        triggeredBy = body.triggeredBy;
      }
    } catch {
      // No body provided, use defaults
    }

    const result = await startCreditSyncJob(session.shop, admin, triggeredBy);

    return json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[API] Failed to start credit sync job:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start credit sync"
    }, { status: 500 });
  }
}
