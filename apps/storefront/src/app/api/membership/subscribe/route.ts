import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

// POST — subscribe to Platinum (monthly or annual).
//
// Reuses an existing Stripe customer when we have one stored on the
// user row (so changing plans / re-subscribing doesn't fragment the
// customer history into multiple Stripe customers, which broke the
// Customer Portal lookup before migration 0059).
export async function POST(request: Request) {
  const stripe = getStripe();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  const plan = body.plan; // "monthly" or "annual"

  const tierResult = await query(`SELECT * FROM tiers WHERE name='Platinum' AND is_paid=true`);
  if (tierResult.rows.length === 0) return NextResponse.json({ error: "Platinum tier not found." }, { status: 404 });

  const tier = tierResult.rows[0];
  const price = plan === "annual" ? parseFloat(tier.annual_price) : parseFloat(tier.monthly_price);
  const interval = plan === "annual" ? "year" : "month";

  // Existing customer? Pass it explicitly. Otherwise let Checkout
  // create one keyed on email — the webhook will store it back
  // when the subscription activates.
  const existing = await query(
    `SELECT stripe_customer_id FROM users WHERE id = $1`,
    [session.user.id]
  );
  const customerId = existing.rows[0]?.stripe_customer_id ?? null;

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Cambridge TCG Platinum — ${plan === "annual" ? "Annual" : "Monthly"}`,
            description: "Zero fees, 12% store discount, 3x Berries, 8% cashback, priority everything",
          },
          unit_amount: Math.round(price * 100),
          recurring: { interval: interval as "month" | "year" },
        },
        quantity: 1,
      }],
      success_url: `${SITE_URL}/account/membership?subscribed=true`,
      cancel_url: `${SITE_URL}/account/membership`,
      ...(customerId
        ? { customer: customerId }
        : { customer_email: session.user.email || undefined }),
      metadata: {
        type: "platinum_subscription",
        user_id: session.user.id,
        tier_id: tier.id,
        plan,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[membership] Subscribe error:", err);
    return NextResponse.json({ error: "Failed to create subscription." }, { status: 500 });
  }
}
