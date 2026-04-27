import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { isUserVerified } from "@/lib/trust/db";
import { beginLotPurchase, getLot } from "@/lib/market/lots";
import { query } from "@/lib/db";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

// POST — begin a lot purchase.
// 1. Create a market_lot_trade (awaiting_payment) and flip the lot to 'sold'
//    atomically so concurrent buyers can't race.
// 2. Create a Stripe checkout session with metadata.type = 'market_lot_payment'.
// 3. Return the checkout URL for the client to redirect to.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in to buy" }, { status: 401 });
  }
  if (!(await isUserVerified(session.user.id))) {
    return NextResponse.json(
      { error: "UK verification required", code: "VERIFICATION_REQUIRED" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const lot = await getLot(id);
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });

  const begin = await beginLotPurchase({ lotId: id, buyerId: session.user.id });
  if (!begin.ok) {
    return NextResponse.json({ error: begin.error }, { status: 400 });
  }
  const trade = begin.trade;

  // Stripe checkout — lazy init to survive missing env in local dev
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }
  const stripe = new Stripe(key.trim(), { apiVersion: "2026-02-25.clover" });

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "gbp",
          product_data: {
            name: lot.title,
            description: `Bundle of ${lot.items?.length ?? 0} item(s)`,
            ...(lot.image_url ? { images: [lot.image_url] } : {}),
          },
          unit_amount: Math.round(parseFloat(lot.price) * 100),
        },
        quantity: 1,
      }],
      success_url: `${SITE_URL}/account/trades?paidLot=${trade.id}`,
      cancel_url: `${SITE_URL}/market/lots/${id}`,
      customer_email: session.user.email,
      metadata: { type: "market_lot_payment", lot_trade_id: trade.id },
    });

    await query(
      `UPDATE market_lot_trades SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2`,
      [checkoutSession.id, trade.id]
    );

    return NextResponse.json({ url: checkoutSession.url, tradeId: trade.id });
  } catch (err) {
    // Roll back the 'sold' flip so the lot is purchasable again
    await query(
      `UPDATE market_lots SET status = 'active', updated_at = NOW()
        WHERE id = $1 AND status = 'sold'
          AND NOT EXISTS (
            SELECT 1 FROM market_lot_trades
             WHERE lot_id = $1 AND escrow_status <> 'awaiting_payment'
          )`,
      [id]
    );
    await query(
      `UPDATE market_lot_trades SET escrow_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [trade.id]
    );
    const msg = err instanceof Error ? err.message : "Payment session failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
