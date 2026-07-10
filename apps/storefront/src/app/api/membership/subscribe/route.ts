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
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  const plan = body.plan; // "monthly" or "annual"
  if (plan !== "monthly" && plan !== "annual")
    return NextResponse.json({ error: `plan must be "monthly" or "annual".` }, { status: 400 });
  // Which paid tier? Default to Platinum so existing callers are unchanged;
  // the membership page passes "Pro" for the Pro tier. Any is_paid tier works.
  const tierName =
    typeof body.tier === "string" && body.tier.trim() ? body.tier.trim() : "Platinum";

  const tierResult = await query(
    `SELECT * FROM tiers WHERE name = $1 AND is_paid = true`,
    [tierName],
  );
  if (tierResult.rows.length === 0)
    return NextResponse.json({ error: `Paid tier '${tierName}' not found.` }, { status: 404 });

  const tier = tierResult.rows[0];
  const price = plan === "annual" ? parseFloat(tier.annual_price) : parseFloat(tier.monthly_price);
  const interval = plan === "annual" ? "year" : "month";
  if (!Number.isFinite(price) || price <= 0)
    return NextResponse.json(
      { error: `Tier '${tier.name}' has no ${plan} price configured.` },
      { status: 500 },
    );

  // Existing customer? Pass it explicitly. Otherwise let Checkout
  // create one keyed on email — the webhook will store it back
  // when the subscription activates.
  const existing = await query(
    `SELECT stripe_customer_id FROM users WHERE id = $1`,
    [session.user.id]
  );
  const customerId = existing.rows[0]?.stripe_customer_id ?? null;

  try {
    // getStripe() throws when STRIPE_SECRET_KEY is absent — constructed
    // inside the try so a config failure surfaces as the honest 503 below
    // rather than a bodiless 500 (mirrors auctions/[id]/pay).
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Cambridge TCG ${tier.name} — ${plan === "annual" ? "Annual" : "Monthly"}`,
            description: tier.description || `${tier.name} membership`,
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
        // Generic so any paid tier (Pro, Platinum, future) activates through
        // the same webhook path. The webhook still honours the legacy
        // "platinum_subscription" value for any checkout in flight at deploy.
        type: "tier_subscription",
        tier_name: tier.name,
        user_id: session.user.id,
        tier_id: tier.id,
        plan,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[membership] Subscribe error:", err);
    // Honest failure: this is our side, not the member's, and nothing was
    // charged. The dev-only STRIPE_SECRET_KEY message stays server-side.
    const unconfigured = err instanceof Error && /STRIPE_SECRET_KEY/.test(err.message);
    return NextResponse.json(
      {
        error:
          "Payments are temporarily unavailable — this is on our side, not yours. Nothing was charged. Please try again in a few minutes; if it keeps failing, contact support.",
        code: unconfigured ? "payments_unconfigured" : "payments_unavailable",
      },
      { status: 503 },
    );
  }
}
