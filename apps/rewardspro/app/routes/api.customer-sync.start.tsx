import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { startSyncJob } from "../services/customer-sync-job.server";

/**
 * POST /api/customer-sync/start
 * Starts a new customer sync job
 *
 * Request body (optional):
 * - triggeredBy: string ('manual' | 'install' | 'cron')
 *
 * Response:
 * - success: boolean
 * - jobId: string
 * - status: string
 * - progress: { processedCount, totalCustomers, ... }
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

    const result = await startSyncJob(session.shop, admin, triggeredBy);

    return json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[API] Failed to start sync job:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start sync"
    }, { status: 500 });
  }
}
