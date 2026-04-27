import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// Customer-facing chargeback visibility. Returns any disputes filed
// against the user, with plain-English status copy. Privacy: no
// internal fields (fraud_emitted, payment_intent ids etc).

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const r = await query(
    `SELECT stripe_dispute_id, amount_gbp, currency,
            stripe_status, stripe_reason, evidence_due_at,
            order_id, created_at, updated_at
       FROM chargebacks
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [session.user.id],
  );
  return NextResponse.json({ chargebacks: r.rows });
}
