import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await query(
    `SELECT * FROM customer_orders WHERE customer_email = $1 ORDER BY created_at DESC`,
    [session.user.email]
  );

  return NextResponse.json({ orders: result.rows });
}
