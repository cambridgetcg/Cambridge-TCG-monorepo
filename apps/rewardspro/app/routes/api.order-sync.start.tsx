import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { startOrderSyncJob } from "../services/order-sync-job.server";

/**
 * POST /api/order-sync/start
 * Starts a new order sync job
 *
 * Request body (optional):
 * - triggeredBy: string ('manual' | 'install' | 'cron')
 * - startDate?: string (ISO date)
 * - endDate?: string (ISO date)
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
    // Parse request body
    let triggeredBy = 'manual';
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    try {
      const body = await request.json();
      if (body.triggeredBy) {
        triggeredBy = body.triggeredBy;
      }
      if (body.startDate) {
        startDate = new Date(body.startDate);
      }
      if (body.endDate) {
        endDate = new Date(body.endDate);
      }
    } catch {
      // No body provided, use defaults
    }

    const result = await startOrderSyncJob(
      session.shop,
      admin,
      triggeredBy,
      { startDate, endDate }
    );

    return json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[API] Failed to start order sync job:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to start sync"
    }, { status: 500 });
  }
}
