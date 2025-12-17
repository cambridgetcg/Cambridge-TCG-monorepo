import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getSyncJobStatus, getSyncJobById, cancelSyncJob } from "../services/customer-sync-job.server";

/**
 * GET /api/customer-sync/status
 * Gets the current sync job status for the shop
 *
 * Query params:
 * - jobId?: string (optional - get specific job, otherwise returns latest)
 *
 * Response:
 * - success: boolean
 * - jobId: string
 * - status: string
 * - progress: { processedCount, totalCustomers, ... }
 * - hasMore: boolean
 * - error?: string
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');

    let result;
    if (jobId) {
      result = await getSyncJobById(jobId);
    } else {
      result = await getSyncJobStatus(session.shop);
    }

    if (!result) {
      return json({
        success: true,
        jobId: null,
        status: 'NO_JOB',
        progress: {
          processedCount: 0,
          totalCustomers: null,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: 0,
          percentComplete: 0
        },
        hasMore: false
      });
    }

    return json(result);
  } catch (error) {
    console.error("[API] Failed to get sync status:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get status"
    }, { status: 500 });
  }
}

/**
 * POST /api/customer-sync/status
 * Cancel a sync job
 *
 * Request body:
 * - action: 'cancel'
 * - jobId: string
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();

    if (body.action === 'cancel' && body.jobId) {
      const cancelled = await cancelSyncJob(body.jobId);
      return json({
        success: cancelled,
        error: cancelled ? undefined : "Failed to cancel job or job not in progress"
      });
    }

    return json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[API] Failed to perform action:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Action failed"
    }, { status: 500 });
  }
}
