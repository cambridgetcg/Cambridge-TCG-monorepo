/**
 * API Endpoint: Subscription Diagnostics
 *
 * Provides access to comprehensive diagnostic queries for debugging
 * and monitoring subscription health.
 *
 * Part of Neural Network Optimization - Debugging Infrastructure
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  generateAuditReport,
  getCustomerSubscriptionHistory,
  getBillingHealthReport,
  findUpcomingRenewals,
  findSubscriptionsInGracePeriod,
} from "../services/subscription/subscription-diagnostic-queries.server";

/**
 * GET /api/subscription-diagnostics
 *
 * Query params:
 * - action: 'audit' | 'customer-history' | 'billing-health' | 'renewals' | 'grace-period'
 * - customerId: for customer-history action
 * - days: number of days for billing-health (default 30) or renewals (default 7)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "audit";
  const customerId = url.searchParams.get("customerId");
  const days = parseInt(url.searchParams.get("days") || "30", 10);

  try {
    switch (action) {
      case "audit":
        const auditReport = await generateAuditReport(shop);
        return json({
          success: true,
          action: "audit",
          data: auditReport,
        });

      case "customer-history":
        if (!customerId) {
          return json({
            success: false,
            error: "customerId parameter required",
          }, { status: 400 });
        }
        const customerHistory = await getCustomerSubscriptionHistory(shop, customerId);
        if (!customerHistory) {
          return json({
            success: false,
            error: "Customer not found",
          }, { status: 404 });
        }
        return json({
          success: true,
          action: "customer-history",
          data: customerHistory,
        });

      case "billing-health":
        const billingReport = await getBillingHealthReport(shop, days);
        return json({
          success: true,
          action: "billing-health",
          data: billingReport,
        });

      case "renewals":
        const renewals = await findUpcomingRenewals(shop, days);
        return json({
          success: true,
          action: "renewals",
          data: {
            daysAhead: days,
            count: renewals.length,
            subscriptions: renewals,
            totalExpectedRevenue: renewals.reduce((sum, r) => sum + r.amount, 0),
          },
        });

      case "grace-period":
        const inGracePeriod = await findSubscriptionsInGracePeriod(shop);
        return json({
          success: true,
          action: "grace-period",
          data: {
            count: inGracePeriod.length,
            subscriptions: inGracePeriod,
          },
        });

      default:
        return json({
          success: false,
          error: `Unknown action: ${action}`,
          availableActions: [
            "audit",
            "customer-history",
            "billing-health",
            "renewals",
            "grace-period",
          ],
        }, { status: 400 });
    }
  } catch (error) {
    console.error("[DiagnosticsAPI] Error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
