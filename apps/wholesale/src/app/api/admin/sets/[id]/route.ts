import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.releaseDate !== undefined) updates.releaseDate = body.releaseDate;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  if (body.active !== undefined) updates.active = body.active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(sets).set(updates).where(eq(sets.id, Number(id)));
  return NextResponse.json({ success: true });
}
