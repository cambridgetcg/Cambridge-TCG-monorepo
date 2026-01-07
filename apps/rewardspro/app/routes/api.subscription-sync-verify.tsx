/**
 * API Endpoint: Subscription Sync Verification
 *
 * Diagnostic endpoint to verify subscription state synchronization between
 * local database and Shopify.
 *
 * Part of Neural Network Optimization - Debugging Infrastructure
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  SubscriptionSyncVerificationService,
  getSubscriptionHealthMetrics,
  findPotentialIssues,
} from "../services/subscription/subscription-sync-verification.server";

/**
 * GET /api/subscription-sync-verify
 *
 * Query params:
 * - action: 'health' | 'issues' | 'orphaned' | 'mismatches'
 * - subscriptionId: specific subscription to verify
 * - limit: number of results (default 50)
 * - onlyActive: only check active subscriptions
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "health";
  const subscriptionId = url.searchParams.get("subscriptionId");
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const onlyActive = url.searchParams.get("onlyActive") === "true";

  try {
    switch (action) {
      case "health":
        const healthMetrics = await getSubscriptionHealthMetrics(shop);
        return json({
          success: true,
          action: "health",
          data: healthMetrics,
        });

      case "issues":
        const issues = await findPotentialIssues(shop);
        return json({
          success: true,
          action: "issues",
          data: issues,
        });

      case "verify":
        if (subscriptionId) {
          const result = await SubscriptionSyncVerificationService.verifySubscription(
            admin,
            shop,
            subscriptionId
          );
          return json({
            success: true,
            action: "verify",
            data: result,
          });
        }
        // Bulk verify
        const bulkResult = await SubscriptionSyncVerificationService.verifyAllForShop(
          admin,
          shop,
          { limit, onlyActive, onlyWithContract: true }
        );
        return json({
          success: true,
          action: "verify",
          data: {
            summary: {
              totalChecked: bulkResult.totalChecked,
              inSync: bulkResult.inSync,
              outOfSync: bulkResult.outOfSync,
              errors: bulkResult.errors,
              criticalIssueCount: bulkResult.criticalIssues.length,
            },
            criticalIssues: bulkResult.criticalIssues,
            verifiedAt: bulkResult.verifiedAt,
          },
        });

      case "orphaned":
        const orphaned = await SubscriptionSyncVerificationService.findOrphanedSubscriptions(
          admin,
          shop,
          limit
        );
        return json({
          success: true,
          action: "orphaned",
          data: {
            count: orphaned.length,
            subscriptions: orphaned,
          },
        });

      case "mismatches":
        const mismatches = await SubscriptionSyncVerificationService.findStatusMismatches(
          admin,
          shop,
          limit
        );
        return json({
          success: true,
          action: "mismatches",
          data: {
            count: mismatches.length,
            subscriptions: mismatches,
          },
        });

      default:
        return json({
          success: false,
          error: `Unknown action: ${action}`,
          availableActions: ["health", "issues", "verify", "orphaned", "mismatches"],
        }, { status: 400 });
    }
  } catch (error) {
    console.error("[SyncVerifyAPI] Error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};

/**
 * POST /api/subscription-sync-verify
 *
 * Body:
 * - action: 'repair' | 'bulk-verify'
 * - subscriptionIds: array of IDs to process
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const body = await request.json();
    const { action: reqAction, subscriptionIds } = body;

    switch (reqAction) {
      case "bulk-verify":
        if (!subscriptionIds || !Array.isArray(subscriptionIds)) {
          return json({
            success: false,
            error: "subscriptionIds array required",
          }, { status: 400 });
        }

        const results = await Promise.all(
          subscriptionIds.slice(0, 50).map(id =>
            SubscriptionSyncVerificationService.verifySubscription(admin, shop, id)
          )
        );

        return json({
          success: true,
          action: "bulk-verify",
          data: {
            verified: results.length,
            inSync: results.filter(r => r.inSync).length,
            outOfSync: results.filter(r => !r.inSync).length,
            results,
          },
        });

      default:
        return json({
          success: false,
          error: `Unknown action: ${reqAction}`,
          availableActions: ["bulk-verify"],
        }, { status: 400 });
    }
  } catch (error) {
    console.error("[SyncVerifyAPI] POST Error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
