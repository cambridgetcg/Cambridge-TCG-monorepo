import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { volumeDiscountPct } = await req.json() as { volumeDiscountPct: number };

  if (typeof volumeDiscountPct !== "number" || volumeDiscountPct < 0 || volumeDiscountPct > 1) {
    return NextResponse.json({ error: "Discount must be between 0 and 1" }, { status: 400 });
  }

  const [updated] = await db
    .update(clients)
    .set({ volumeDiscountPct })
    .where(eq(clients.id, parseInt(id)))
    .returning();

  return NextResponse.json(updated);
}
