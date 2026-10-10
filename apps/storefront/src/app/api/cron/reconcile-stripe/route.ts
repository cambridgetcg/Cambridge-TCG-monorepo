/**
 * Hourly Stripe reconciliation cron.
 *
 * Sweeps paid Stripe sessions in the last 48h, routes each locally owned
 * market Session through the settlement ledger, and inserts only retail
 * Sessions that aren't yet in customer_orders. See vercel.json for schedule.
 *
 * Authenticated via CRON_SECRET (same convention as maintenance cron).
 */

import { NextResponse } from "next/server";
import { reconcileStripeOrders } from "@/lib/orders/reconcile";
import { requireCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // sec — list+retrieve loop on a few hundred sessions

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await reconcileStripeOrders();
    console.log("[cron/reconcile-stripe]", summary);
    if (summary.errors > 0) {
      return NextResponse.json({ ok: false, ...summary }, { status: 503 });
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/reconcile-stripe] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
