import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockTargets } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(stockTargets)
    .orderBy(asc(stockTargets.priceMin));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { priceMin, priceMax, targetQty } = await req.json();
  if (typeof priceMin !== "number" || typeof priceMax !== "number" || typeof targetQty !== "number"
    || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || !Number.isFinite(targetQty)
    || priceMin < 0 || priceMax < 0 || targetQty < 0 || priceMin > priceMax) {
    return NextResponse.json({ error: "Invalid values: need finite non-negative numbers with priceMin <= priceMax" }, { status: 400 });
  }
  const [row] = await db
    .insert(stockTargets)
    .values({ priceMin, priceMax, targetQty })
    .returning();
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, priceMin, priceMax, targetQty } = await req.json();
  if (typeof priceMin !== "number" || typeof priceMax !== "number" || typeof targetQty !== "number"
    || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || !Number.isFinite(targetQty)
    || priceMin < 0 || priceMax < 0 || targetQty < 0 || priceMin > priceMax) {
    return NextResponse.json({ error: "Invalid values: need finite non-negative numbers with priceMin <= priceMax" }, { status: 400 });
  }
  const [row] = await db
    .update(stockTargets)
    .set({ priceMin, priceMax, targetQty })
    .where(eq(stockTargets.id, id))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json();
  await db.delete(stockTargets).where(eq(stockTargets.id, id));
  return NextResponse.json({ ok: true });
}
