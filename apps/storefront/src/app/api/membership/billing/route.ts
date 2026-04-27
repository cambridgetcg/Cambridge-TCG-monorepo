import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// GET — billing snapshot for /account/billing. Combines DB state we
// already have (subscription columns added in migration 0059) with a
// best-effort Stripe lookup for the invoice list. Stripe failures
// don't block — we return what we have plus a hint.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const u = await query(
    `SELECT subscription_status, subscription_stripe_id,
            subscription_cancel_at_period_end, subscription_expires_at,
            subscription_plan, subscription_payment_brand, subscription_payment_last4,
            stripe_customer_id, paid_tier_id, tier_id
       FROM users WHERE id = $1`,
    [session.user.id]
  );
  if (u.rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const user = u.rows[0];

  // Tier display name for the page header
  let tierName: string | null = null;
  if (user.paid_tier_id || user.tier_id) {
    const t = await query(
      `SELECT name FROM tiers WHERE id = $1`,
      [user.paid_tier_id || user.tier_id]
    );
    tierName = t.rows[0]?.name ?? null;
  }

  // Recent invoices — best-effort Stripe lookup. Failure (no key, no
  // network, customer not found) doesn't block; UI just shows "history
  // not available right now" and the cancel/resume controls still work.
  let invoices: Array<{
    id: string; created: number; amount_paid: number; status: string;
    hosted_invoice_url: string | null; period_end: number;
  }> = [];
  let invoicesError: string | null = null;
  if (user.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const list = await stripe.invoices.list({
        customer: user.stripe_customer_id,
        limit: 12,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id ?? "",
        created: inv.created,
        amount_paid: inv.amount_paid,
        status: inv.status ?? "unknown",
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        period_end: inv.period_end,
      }));
    } catch (err) {
      invoicesError = err instanceof Error ? err.message : "Invoice lookup failed.";
      console.warn("[membership/billing] invoice list failed:", err);
    }
  }

  return NextResponse.json({
    subscription: {
      status: user.subscription_status,
      tierName,
      plan: user.subscription_plan,
      expiresAt: user.subscription_expires_at,
      cancelAtPeriodEnd: user.subscription_cancel_at_period_end,
      paymentBrand: user.subscription_payment_brand,
      paymentLast4: user.subscription_payment_last4,
      hasCustomer: !!user.stripe_customer_id,
    },
    invoices,
    invoicesError,
  });
}
