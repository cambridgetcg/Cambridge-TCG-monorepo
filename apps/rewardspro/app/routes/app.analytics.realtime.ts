import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { analytics } from "../services/analytics/aggregator.service";

function sseEvent(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Module-level connection tracking
const activeConnections = new Map<string, number>();
const MAX_CONNECTIONS_PER_SHOP = 10;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shopId = session.shop;

  // Enforce connection limit per shop
  const currentCount = activeConnections.get(shopId) || 0;
  if (currentCount >= MAX_CONNECTIONS_PER_SHOP) {
    return new Response("Too many realtime connections for this shop", { status: 429 });
  }
  activeConnections.set(shopId, currentCount + 1);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Heartbeat every 20s
      const hb = setInterval(() => {
        controller.enqueue(encoder.encode(`: keep-alive\n\n`));
      }, 20000);

      // Initial payload — use fresh dates
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0,0,0,0);

      try {
        const revenue = await analytics.getRevenueMetrics(shopId, { start: startOfDay, end: now });
        const cashback = await analytics.getCashbackMetrics(shopId, { start: startOfDay, end: now });
        const customerMetrics = await analytics.getCustomerMetrics(shopId, { start: startOfDay, end: now });

        const initial = {
          activeCustomers: customerMetrics?.active_30d || 0,
          todayRevenue: revenue[revenue.length - 1]?.revenue || 0,
          todayCashback: cashback[cashback.length - 1]?.cashback_earned || 0,
        };
        controller.enqueue(encoder.encode(sseEvent("metrics", initial)));
      } catch (err) {
        console.error("Initial SSE metrics error:", err);
      }

      // Backpressure: skip tick if previous query is still in-flight
      let queryInFlight = false;

      // Update every 30 seconds (was 5s — analytics don't need sub-second freshness)
      const tick = setInterval(async () => {
        if (queryInFlight) return;
        queryInFlight = true;
        try {
          // Use fresh dates each tick so queries aren't stale
          const tickNow = new Date();
          const tickStartOfDay = new Date(tickNow);
          tickStartOfDay.setHours(0,0,0,0);

          const revenue = await analytics.getRevenueMetrics(shopId, { start: tickStartOfDay, end: tickNow });
          const cashback = await analytics.getCashbackMetrics(shopId, { start: tickStartOfDay, end: tickNow });

          controller.enqueue(encoder.encode(sseEvent("metrics", {
            todayRevenue: revenue[revenue.length - 1]?.revenue || 0,
            todayCashback: cashback[cashback.length - 1]?.cashback_earned || 0,
            timestamp: tickNow.toISOString(),
          })));
        } catch (err) {
          console.error("SSE metrics update error:", err);
        } finally {
          queryInFlight = false;
        }
      }, 30000);

      // Cleanup on abort
      const cleanup = () => {
        clearInterval(hb);
        clearInterval(tick);
        // Decrement connection count
        const count = activeConnections.get(shopId) || 1;
        if (count <= 1) {
          activeConnections.delete(shopId);
        } else {
          activeConnections.set(shopId, count - 1);
        }
        try { controller.close(); } catch { /* already closed */ }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
