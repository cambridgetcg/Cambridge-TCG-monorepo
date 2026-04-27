import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// Customer-facing refunds list. Privacy-conscious — no payment_intent
// id, no abuse_checked flag.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const r = await query(
    `SELECT stripe_refund_id, amount_gbp, currency,
            stripe_status, stripe_reason, initiated_by,
            order_id, created_at
       FROM refunds
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [session.user.id],
  );
  return NextResponse.json({ refunds: r.rows });
}
