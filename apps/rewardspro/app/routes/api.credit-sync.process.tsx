import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  processCreditSyncBatch,
  resumeCreditSyncJob
} from "../services/credit-sync-job.server";

/**
 * POST /api/credit-sync/process
 * Processes the next batch of customers for a credit sync job
 *
 * Request body:
 * - jobId: string (required)
 * - resume?: boolean (optional, set to true to resume a failed/cancelled job)
 *
 * Response:
 * - success: boolean
 * - jobId: string
 * - status: string (IN_PROGRESS | COMPLETED | FAILED | CANCELLED)
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
    const body = await request.json();
    const { jobId, resume } = body;

    if (!jobId) {
      return json({
        success: false,
        error: "jobId is required"
      }, { status: 400 });
    }

    let result;
    if (resume) {
      // Resume a failed/cancelled job
      result = await resumeCreditSyncJob(jobId, admin);
    } else {
      // Process next batch
      result = await processCreditSyncBatch(jobId, admin);
    }

    return json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[API] Failed to process credit sync batch:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to process batch"
    }, { status: 500 });
  }
}
