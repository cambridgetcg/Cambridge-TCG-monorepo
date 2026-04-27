import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// Customer-facing failed-payment list. Privacy-conscious: no
// payment_intent ids, no internal flags.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const r = await query(
    `SELECT amount_gbp, currency, failure_code, failure_message,
            attempt_count, first_attempt_at, last_attempt_at, order_id
       FROM failed_payments
      WHERE user_id = $1
      ORDER BY last_attempt_at DESC
      LIMIT 50`,
    [session.user.id],
  );
  return NextResponse.json({ failed: r.rows });
}
