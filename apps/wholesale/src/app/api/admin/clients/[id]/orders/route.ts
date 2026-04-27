import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const clientOrders = await db
    .select({ id: orders.id, status: orders.status, total: orders.total, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.clientId, parseInt(id)))
    .orderBy(desc(orders.createdAt));
  return NextResponse.json(clientOrders);
}
