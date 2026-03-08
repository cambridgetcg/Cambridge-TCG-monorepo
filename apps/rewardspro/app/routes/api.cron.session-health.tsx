/**
 * Session Health Cron Job
 *
 * Detects shops whose Shopify session tokens may be revoked by monitoring
 * the gap between recent orders (from incremental sync) and webhook processing.
 *
 * If a shop has orders arriving but no corresponding WebhookProcessed entries,
 * the offline session token is likely revoked — Shopify stops delivering webhooks
 * when the app token becomes invalid.
 *
 * Schedule: Daily at 7:30 AM UTC (after session-cleanup at 6 AM)
 * Endpoint: GET /api/cron/session-health
 *
 * @security Requires CRON_SECRET header
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getAuroraClient } from "~/utils/aurora-data-api";
import { createDataAPIPrismaClient } from "~/utils/prisma-data-api-adapter";

const CONFIG = {
  // If a shop has no WebhookProcessed entry in this many days, flag it
  WEBHOOK_SILENCE_DAYS: 7,
  // Minimum number of orders newer than last webhook to confirm active store
  MIN_NEW_ORDERS: 1,
};

interface ShopHealthStatus {
  shop: string;
  lastWebhookDate: string | null;
  newOrdersSinceWebhook: number;
  sessionExists: boolean;
  sessionActive: boolean;
  status: "healthy" | "warning" | "critical";
  reason: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();

  const cronSecret = request.headers.get("X-Cron-Secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn("[SessionHealthCron] Unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const aurora = getAuroraClient();
  const db = createDataAPIPrismaClient();
  const results: ShopHealthStatus[] = [];
  const alerts: string[] = [];

  try {
    // Get all shops with an active offline session
    const sessionRows = await aurora.executeStatement(
      `SELECT shop, "isActive", LEFT("accessToken", 15) AS tok
       FROM "Session"
       WHERE "isOnline" = false
       ORDER BY shop ASC`
    );

    if (!sessionRows.records || sessionRows.records.length === 0) {
      return json({
        success: true,
        message: "No offline sessions found",
        results: [],
        durationMs: Date.now() - startTime,
      });
    }

    for (const row of sessionRows.records as any[]) {
      // executeStatement returns typed objects keyed by column name
      const shop: string = row.shop ?? "";
      const isActive: boolean = row.isActive ?? false;
      const hasToken: boolean = typeof row.tok === "string" && row.tok.length > 0;

      // Check last WebhookProcessed for this shop
      const lastWebhookRows = await aurora.executeStatement(
        `SELECT MAX("processedAt")::text as last_processed
         FROM "WebhookProcessed"
         WHERE shop = :shop AND topic = 'ORDERS_PAID'`,
        [{ name: "shop", value: { stringValue: shop } }]
      );
      const lastWebhookRaw = (lastWebhookRows.records?.[0] as any)?.last_processed;
      const lastWebhookDate: string | null =
        lastWebhookRaw instanceof Date
          ? lastWebhookRaw.toISOString()
          : typeof lastWebhookRaw === "string"
          ? lastWebhookRaw
          : null;

      // Count orders newer than last webhook (indicating active store)
      const newOrdersRows = await aurora.executeStatement(
        lastWebhookDate
          ? `SELECT COUNT(*)::int as cnt FROM "Order"
             WHERE shop = :shop
               AND "customerId" IS NOT NULL
               AND "createdAt" > :last_webhook::timestamp`
          : `SELECT COUNT(*)::int as cnt FROM "Order"
             WHERE shop = :shop AND "customerId" IS NOT NULL`,
        lastWebhookDate
          ? [
              { name: "shop", value: { stringValue: shop } },
              { name: "last_webhook", value: { stringValue: lastWebhookDate } },
            ]
          : [{ name: "shop", value: { stringValue: shop } }]
      );
      const newOrderCount: number = Number((newOrdersRows.records?.[0] as any)?.cnt ?? 0);

      // Determine health status
      let status: ShopHealthStatus["status"] = "healthy";
      let reason = "Webhooks processing normally";

      if (!hasToken || !isActive) {
        status = "critical";
        reason = "Session token missing or inactive";
      } else if (newOrderCount >= CONFIG.MIN_NEW_ORDERS && !lastWebhookDate) {
        status = "critical";
        reason = `${newOrderCount} orders with NO webhook history — session likely revoked`;
      } else if (lastWebhookDate) {
        const lastDate = new Date(lastWebhookDate);
        const daysSinceWebhook = Math.floor(
          (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (
          daysSinceWebhook >= CONFIG.WEBHOOK_SILENCE_DAYS &&
          newOrderCount >= CONFIG.MIN_NEW_ORDERS
        ) {
          status = "critical";
          reason = `${daysSinceWebhook}d webhook silence with ${newOrderCount} new orders — session likely revoked`;
        } else if (daysSinceWebhook >= CONFIG.WEBHOOK_SILENCE_DAYS) {
          status = "warning";
          reason = `${daysSinceWebhook}d webhook silence (no new orders to confirm)`;
        }
      }

      results.push({
        shop,
        lastWebhookDate,
        newOrdersSinceWebhook: newOrderCount,
        sessionExists: true,
        sessionActive: isActive,
        status,
        reason,
      });

      // Create SystemAlert for critical shops
      if (status === "critical") {
        alerts.push(shop);

        const alertType = "SESSION_TOKEN_REVOKED";
        const alertMessage = `[${shop}] Session token may be revoked. ${reason}. Merchant must re-authenticate the app.`;

        // Upsert: one unresolved alert per shop
        const existing = await db.systemAlert.findFirst({
          where: { type: alertType, resolved: false, message: { contains: shop } } as any,
        });

        if (existing) {
          await db.systemAlert.update({
            where: { id: existing.id },
            data: {
              severity: "CRITICAL",
              message: alertMessage,
              details: {
                shop,
                lastWebhookDate,
                newOrdersSinceWebhook: newOrderCount,
                reason,
                checkedAt: new Date().toISOString(),
              },
              updatedAt: new Date(),
            },
          });
        } else {
          await db.systemAlert.create({
            data: {
              id: `session-health-${shop}-${Date.now()}`,
              type: alertType,
              severity: "CRITICAL",
              message: alertMessage,
              details: {
                shop,
                lastWebhookDate,
                newOrdersSinceWebhook: newOrderCount,
                reason,
                checkedAt: new Date().toISOString(),
              },
              createdAt: new Date(),
            },
          });
        }

        console.error(`[SessionHealthCron] CRITICAL: ${alertMessage}`);
      } else {
        // Resolve any existing alert for this shop if now healthy
        const existingAlert = await db.systemAlert.findFirst({
          where: { type: "SESSION_TOKEN_REVOKED", resolved: false, message: { contains: shop } } as any,
        });
        if (existingAlert) {
          await db.systemAlert.update({
            where: { id: existingAlert.id },
            data: {
              resolved: true,
              resolvedAt: new Date(),
              updatedAt: new Date(),
            },
          });
          console.log(`[SessionHealthCron] Resolved alert for ${shop} — now healthy`);
        }
      }
    }

    const summary = {
      healthy: results.filter((r) => r.status === "healthy").length,
      warning: results.filter((r) => r.status === "warning").length,
      critical: results.filter((r) => r.status === "critical").length,
    };

    console.log(
      `[SessionHealthCron] Complete. ${summary.healthy} healthy, ${summary.warning} warning, ${summary.critical} critical. Shops flagged: ${alerts.join(", ") || "none"}`
    );

    return json({
      success: true,
      summary,
      results,
      alertsFired: alerts,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[SessionHealthCron] Failed:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
};
