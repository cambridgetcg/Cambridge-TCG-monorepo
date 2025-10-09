import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { analytics } from "../services/analytics/aggregator.service";

function sseEvent(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shopId = session.shop;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Heartbeat every 20s
      const hb = setInterval(() => {
        controller.enqueue(encoder.encode(`: keep-alive\n\n`));
      }, 20000);

      // Initial payload
      const initialNow = new Date();
      const startOfDay = new Date(initialNow);
      startOfDay.setHours(0,0,0,0);

      try {
        const revenue = await analytics.getRevenueMetrics(shopId, { start: startOfDay, end: initialNow });
        const cashback = await analytics.getCashbackMetrics(shopId, { start: startOfDay, end: initialNow });
        const customerMetrics = await analytics.getCustomerMetrics(shopId, { start: startOfDay, end: initialNow });

        const initial = {
          activeCustomers: customerMetrics?.active_30d || 0,
          todayRevenue: revenue[revenue.length - 1]?.revenue || 0,
          todayCashback: cashback[cashback.length - 1]?.cashback_earned || 0,
        };
        controller.enqueue(encoder.encode(sseEvent("metrics", initial)));
      } catch (err) {
        console.error("Initial SSE metrics error:", err);
      }

      // Update every 5 seconds
      const tick = setInterval(async () => {
        try {
          const now = new Date();
          const revenue = await analytics.getRevenueMetrics(shopId, { start: startOfDay, end: now });
          const cashback = await analytics.getCashbackMetrics(shopId, { start: startOfDay, end: now });

          controller.enqueue(encoder.encode(sseEvent("metrics", {
            todayRevenue: revenue[revenue.length - 1]?.revenue || 0,
            todayCashback: cashback[cashback.length - 1]?.cashback_earned || 0,
            timestamp: now.toISOString(),
          })));
        } catch (err) {
          console.error("SSE metrics update error:", err);
        }
      }, 5000);

      // Cleanup on abort
      const cleanup = () => {
        clearInterval(hb);
        clearInterval(tick);
        controller.close();
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
