import { NextResponse } from "next/server";
import type { CartItem } from "@/lib/cart";
import { auth } from "@/lib/auth";
import { getUserPerks } from "@/lib/membership/db";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import {
  reserveCartItems,
  holderForStripeSession,
} from "@/lib/stock/reservations";
import { fetchCardFresh } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

export async function POST(request: Request) {
  try {
    // Bad/absent JSON is a 400, not a 500 — the outer catch used to
    // swallow this as a server error (half of the "checkout 500 flake").
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }
    const items: CartItem[] = body.items;
    const requestedCreditGbp = typeof body.creditToApply === "number" ? body.creditToApply : 0;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    for (const item of items) {
      if (!item.sku || !item.price || item.price <= 0 || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: "Invalid item in cart" }, { status: 400 });
      }
    }

    // Price guard — item.price is client-supplied and was charged
    // verbatim; a tampered cart could buy any card for 1p. Reject carts
    // whose unit price is >10% below live retail (tolerance spares honest
    // carts that predate a small price update). Fails OPEN if the
    // wholesale API is down — checkout availability must not depend on
    // its uptime; stock is enforced by reservations below either way.
    try {
      const skus = [...new Set(items.map((i) => i.sku))];
      const fetched = await Promise.all(skus.map((sku) => fetchCardFresh(sku)));
      const liveCards = new Map(skus.map((sku, i) => [sku, fetched[i]]));
      for (const item of items) {
        const card = liveCards.get(item.sku);
        if (!card) continue; // unknown SKU — the reservation step rejects it
        const serverPrice = retailPrice(card.price_gbp, card.channel_price);
        if (serverPrice > 0 && item.price < serverPrice * 0.9) {
          return NextResponse.json(
            {
              error: `The price of "${item.name}" has changed — please refresh your cart.`,
              code: "price_changed",
              sku: item.sku,
            },
            { status: 409 }
          );
        }
      }
    } catch (err) {
      console.error("[checkout] price guard skipped — wholesale API unavailable:", err);
    }

    // Initialise Stripe AFTER validation. If STRIPE_SECRET_KEY is
    // missing (dev without creds, or a misconfigured prod), this
    // throws — a 500 is correct then, but malformed-cart requests
    // should still return 400 above without ever touching Stripe.
    const stripe = getStripe();

    // Tier discount + credit balance — perks gives the discount, balance
    // comes from the users row directly.
    let discountPercent = 0;
    let availableCreditGbp = 0;
    const session_auth = await auth();
    if (session_auth?.user?.id) {
      const perks = await getUserPerks(session_auth.user.id);
      discountPercent = perks.store_discount_percent;
      const balRes = await query(
        `SELECT store_credit_balance::numeric AS bal FROM users WHERE id = $1`,
        [session_auth.user.id]
      );
      availableCreditGbp = parseFloat(balRes.rows[0]?.bal ?? "0");
    }

    // Cart subtotal AFTER tier discount but BEFORE credit, in pence
    const subtotalPence = items.reduce((sum, item) => {
      const unitPence = discountPercent > 0
        ? Math.round(item.price * (1 - discountPercent / 100) * 100)
        : Math.round(item.price * 100);
      return sum + unitPence * item.quantity;
    }, 0);

    // Apply credit, capped by: requested amount, current balance, and
    // subtotal-1p (Stripe rejects zero-total checkouts).
    let appliedCreditPence = 0;
    let couponId: string | null = null;
    if (requestedCreditGbp > 0 && session_auth?.user?.id) {
      appliedCreditPence = Math.min(
        Math.floor(requestedCreditGbp * 100),
        Math.floor(availableCreditGbp * 100),
        Math.max(subtotalPence - 1, 0)
      );
      if (appliedCreditPence > 0) {
        // One-shot coupon. Webhook debits the user's ledger by this amount
        // on checkout.session.completed; abandoned coupons are harmless.
        const coupon = await stripe.coupons.create({
          amount_off: appliedCreditPence,
          currency: "gbp",
          duration: "once",
          name: `Store credit (£${(appliedCreditPence / 100).toFixed(2)})`,
        });
        couponId = coupon.id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map((item) => {
        const discountedPrice = discountPercent > 0
          ? Math.round(item.price * (1 - discountPercent / 100) * 100)
          : Math.round(item.price * 100);

        return {
          price_data: {
            currency: "gbp",
            product_data: {
              name: discountPercent > 0
                ? `${item.name} (${discountPercent}% Platinum discount)`
                : item.name,
              ...(item.image_url ? { images: [item.image_url] } : {}),
              metadata: { sku: item.sku, card_number: item.card_number },
            },
            unit_amount: discountedPrice,
          },
          quantity: item.quantity,
        };
      }),
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      success_url: `${SITE_URL}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/checkout`,
      customer_email: session_auth?.user?.email || undefined,
      shipping_address_collection: {
        allowed_countries: ["GB", "US", "CA", "AU", "DE", "FR", "NL", "JP"],
      },
      metadata: {
        skus: JSON.stringify(items.map((i) => ({ sku: i.sku, qty: i.quantity, price_gbp: i.price, name: i.name }))),
        ...(discountPercent > 0 ? { platinum_discount: String(discountPercent) } : {}),
        ...(appliedCreditPence > 0 && session_auth?.user?.id ? {
          credit_applied_gbp: (appliedCreditPence / 100).toFixed(2),
          credit_user_id: session_auth.user.id,
        } : {}),
      },
    });

    // Reserve stock for every cart item using the Stripe session id as
    // holder. All-or-nothing — if any item is short, we expire the
    // freshly-created Stripe session and return 409 to the client.
    // See docs/architecture/storefront-checkout-flow.md.
    const holder = holderForStripeSession(session.id);
    const reservation = await reserveCartItems(
      holder,
      items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
    );
    if (!reservation.ok) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (e) {
        // Non-fatal — the session will time out on Stripe's side regardless.
        console.warn(
          `[checkout] failed to expire Stripe session after reservation failure (${session.id}):`,
          e,
        );
      }
      const status = reservation.reason === "out_of_stock" ? 409 : 500;
      return NextResponse.json(
        {
          error:
            reservation.reason === "out_of_stock"
              ? "One or more items are out of stock"
              : "Could not reserve stock for checkout",
          reason: reservation.reason,
          sku: reservation.sku ?? null,
        },
        { status },
      );
    }

    return NextResponse.json({
      url: session.url,
      discount: discountPercent,
      creditApplied: appliedCreditPence / 100,
      creditAvailable: availableCreditGbp,
    });
  } catch (err) {
    console.error("[checkout] Error creating session:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
