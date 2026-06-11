import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getCreditSyncJobStatus,
  getCreditSyncJobById,
  cancelCreditSyncJob,
  getCreditSyncStats
} from "../services/credit-sync-job.server";

/**
 * GET /api/credit-sync/status
 * Gets the status of the most recent credit sync job
 *
 * Query params:
 * - jobId?: string (optional, to get specific job status)
 *
 * Response:
 * - success: boolean
 * - jobId: string
 * - status: string
 * - progress: { ... }
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
    const jobId = url.searchParams.get("jobId");

    let result;
    if (jobId) {
      result = await getCreditSyncJobById(jobId);
    } else {
      result = await getCreditSyncJobStatus(session.shop);
    }

    if (!result) {
      // No sync job found - return stats instead
      const stats = await getCreditSyncStats(session.shop);
      return json({
        success: true,
        jobId: null,
        status: 'NONE',
        progress: null,
        hasMore: false,
        stats
      });
    }

    return json(result);
  } catch (error) {
    console.error("[API] Failed to get credit sync status:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get status"
    }, { status: 500 });
  }
}

/**
 * POST /api/credit-sync/status
 * Performs actions on a credit sync job (cancel)
 *
 * Request body:
 * - action: 'cancel'
 * - jobId: string
 *
 * Response:
 * - success: boolean
 * - error?: string
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
    const { action: actionType, jobId } = body;

    if (!jobId) {
      return json({
        success: false,
        error: "jobId is required"
      }, { status: 400 });
    }

    if (actionType === 'cancel') {
      const success = await cancelCreditSyncJob(jobId);
      return json({
        success,
        error: success ? undefined : "Failed to cancel job or job not in progress"
      });
    }

    return json({
      success: false,
      error: `Unknown action: ${actionType}`
    }, { status: 400 });

  } catch (error) {
    console.error("[API] Failed to perform credit sync action:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to perform action"
    }, { status: 500 });
  }
}
