import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

// Every country Stripe Checkout can collect a shipping address for — the
// full ShippingAddressCollection.AllowedCountry enum from the SDK, minus
// 'ZZ' (Stripe's "unknown country" placeholder, not a shippable territory).
// Stripe-unsupported territories (Cuba, Iran, North Korea, Syria, the US
// minor outlying islands, …) simply aren't in the enum, so this IS the
// global list. No UK shortlist: global free trade — traders arrange their
// own logistics (spec: docs/superpowers/specs/2026-06-10-global-free-trade-design.md §2.3).
const GLOBAL_SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
  "AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AT",
  "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
  "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
  "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO",
  "CR", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC",
  "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FO", "FR", "GA",
  "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ",
  "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID",
  "IE", "IL", "IM", "IN", "IO", "IQ", "IS", "IT", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB",
  "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD",
  "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MS", "MT",
  "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL",
  "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK",
  "PL", "PM", "PN", "PR", "PS", "PT", "PY", "QA", "RE", "RO", "RS", "RU",
  "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL",
  "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SZ", "TA", "TC", "TD",
  "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV",
  "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VN",
  "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const stripe = getStripe();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to pay." }, { status: 401 });
  }

  const { id } = await params;

  // Trade must exist, the requester must be the buyer, status must still be
  // awaiting_payment, and the payment window must not have elapsed.
  const tradeRes = await query(
    `SELECT t.*, COALESCE(o.card_name, t.sku) AS card_name, o.image_url
       FROM market_trades t
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.id = $1`,
    [id]
  );
  if (tradeRes.rows.length === 0) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const trade = tradeRes.rows[0];

  if (trade.buyer_id !== session.user.id) {
    return NextResponse.json({ error: "Only the buyer can pay for this trade." }, { status: 403 });
  }
  if (trade.escrow_status !== "awaiting_payment") {
    return NextResponse.json({ error: `Trade is in '${trade.escrow_status}' state.` }, { status: 400 });
  }
  if (trade.payment_expires_at && new Date(trade.payment_expires_at) <= new Date()) {
    return NextResponse.json({ error: "Payment window has expired." }, { status: 400 });
  }

  const total = parseFloat(trade.price) * trade.quantity;

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "gbp",
          product_data: {
            name: trade.card_name,
            description: `P2P trade — ${trade.quantity} × ${trade.card_name}`,
            ...(trade.image_url ? { images: [trade.image_url] } : {}),
          },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      success_url: `${SITE_URL}/account/trades?paid=${id}`,
      cancel_url: `${SITE_URL}/account/trades`,
      customer_email: session.user.email || undefined,
      // Collect the buyer's shipping address at pay time. The webhook
      // persists it to market_trades.shipping_address (migration 0105) so
      // the seller knows where to ship — currency stays GBP (the platform's
      // settlement currency); display FX is a separate, existing layer.
      shipping_address_collection: {
        allowed_countries: GLOBAL_SHIPPING_COUNTRIES,
      },
      metadata: {
        type: "market_trade_payment",
        trade_id: id,
      },
    });

    // Persist the session id so the webhook can do an idempotent lookup if
    // metadata is ever lost or the session is replayed.
    await query(
      `UPDATE market_trades SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2`,
      [checkoutSession.id, id]
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[market] Pay session error:", err);
    return NextResponse.json({ error: "Failed to create payment session." }, { status: 500 });
  }
}
