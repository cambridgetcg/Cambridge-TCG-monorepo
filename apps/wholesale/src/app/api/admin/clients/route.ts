import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const allClients = await db.select({
    id: clients.id,
    name: clients.name,
    email: clients.email,
    company: clients.company,
    currentMonthSpend: clients.currentMonthSpend,
    priorMonthSpend: clients.priorMonthSpend,
    volumeDiscountPct: clients.volumeDiscountPct,
  }).from(clients).where(eq(clients.role, "client"));
  return NextResponse.json(allClients);
}
