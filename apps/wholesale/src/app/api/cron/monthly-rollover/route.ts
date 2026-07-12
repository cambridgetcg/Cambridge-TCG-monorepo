import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, orders } from "@/lib/db/schema";
import { eq, sql, and, inArray, gte } from "drizzle-orm";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Recalculates volume discount spend for all clients using a rolling 30-day window.
 *
 * - prior_month_spend   = SUM(total) of paid+ orders created in the last 30 days
 *                         (this is the discount basis — read by calcDiscountPct)
 * - current_month_spend = same value (displayed on discount page)
 *
 * Runs daily via Vercel Cron, or manually with a Bearer CRON_SECRET header.
 */

const PAID_STATUSES: ("paid" | "ordered" | "shipped" | "delivered")[] = ["paid", "ordered", "shipped", "delivered"];

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await recalculateAllClients();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await recalculateAllClients();
  return NextResponse.json(result);
}

async function recalculateAllClients() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all clients
  const allClients = await db
    .select({ id: clients.id, email: clients.email })
    .from(clients);

  const updates: { id: number; email: string; rolling30DaySpend: number }[] = [];

  for (const client of allClients) {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)`.as("total") })
      .from(orders)
      .where(
        and(
          eq(orders.clientId, client.id),
          inArray(orders.status, PAID_STATUSES),
          gte(orders.createdAt, thirtyDaysAgo),
        ),
      );

    const rolling30DaySpend = Number(row.total);

    await db.update(clients)
      .set({ priorMonthSpend: rolling30DaySpend, currentMonthSpend: rolling30DaySpend })
      .where(eq(clients.id, client.id));

    updates.push({ id: client.id, email: client.email, rolling30DaySpend });
  }

  return { ok: true, timestamp: now.toISOString(), updates };
}
