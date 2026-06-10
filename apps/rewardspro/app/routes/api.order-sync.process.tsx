import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { processOrderBatch, resumeOrderSyncJob } from "../services/order-sync-job.server";

/**
 * POST /api/order-sync/process
 * Processes the next batch of orders for a sync job
 *
 * Request body:
 * - jobId: string (required)
 * - resume?: boolean (optional - set to true to resume a failed job)
 *
 * Response:
 * - success: boolean
 * - jobId: string
 * - status: string
 * - progress: { processedCount, totalOrders, ... }
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

    if (!body.jobId) {
      return json({ success: false, error: "jobId is required" }, { status: 400 });
    }

    let result;

    if (body.resume) {
      // Resume a failed job
      result = await resumeOrderSyncJob(body.jobId, admin);
    } else {
      // Process next batch
      result = await processOrderBatch(body.jobId, admin);
    }

    return json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[API] Failed to process order sync batch:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to process batch"
    }, { status: 500 });
  }
}
