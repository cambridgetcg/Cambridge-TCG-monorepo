import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Customer-facing order list. Privacy-conscious — no stripe_session_id,
  // no stripe_payment_intent, no admin fulfilment notes.
  const result = await query(
    `SELECT id, status, total_gbp, currency, customer_name,
            shipping_name, shipping_address, items,
            tracking_number, carrier, shipped_at, delivered_at,
            created_at
       FROM customer_orders
      WHERE lower(customer_email) = lower($1)
      ORDER BY created_at DESC
      LIMIT 100`,
    [session.user.email]
  );

  return NextResponse.json({ orders: result.rows });
}
