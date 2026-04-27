import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cartItems } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

/** DELETE /api/admin/carts/clear — Clear all shopping carts */
export async function DELETE() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db.delete(cartItems);
  return NextResponse.json({ ok: true, cleared: "all" });
}
