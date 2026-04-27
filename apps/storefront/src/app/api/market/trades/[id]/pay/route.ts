import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

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
