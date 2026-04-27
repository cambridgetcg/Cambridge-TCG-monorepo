import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import Stripe from "stripe";

// GET — platform Stripe balance (available + pending, per currency).
// Used on the admin payouts dashboard to verify enough funds before
// kicking off transfers.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    const stripe = new Stripe(key.trim(), { apiVersion: "2026-02-25.clover" });
    const balance = await stripe.balance.retrieve();

    return NextResponse.json({
      available: balance.available.map((b) => ({
        currency: b.currency,
        amount: b.amount / 100,
      })),
      pending: balance.pending.map((b) => ({
        currency: b.currency,
        amount: b.amount / 100,
      })),
    });
  } catch (err) {
    console.error("[admin/payouts] balance error:", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch balance";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
