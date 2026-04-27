import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuction } from "@/lib/auction/db";
import { getStripe } from "@/lib/stripe";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const stripe = getStripe();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to pay." }, { status: 401 });
  }

  const { id } = await params;
  const auction = await getAuction(id);

  if (!auction) {
    return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  }

  if (auction.status !== "ended") {
    return NextResponse.json({ error: "Auction is not in ended state." }, { status: 400 });
  }

  if (auction.winner_user_id !== session.user.id) {
    return NextResponse.json({ error: "You are not the winner." }, { status: 403 });
  }

  const amount = parseFloat(auction.current_price);

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: auction.title,
              description: `Auction winner payment`,
              ...(auction.images.length > 0 ? { images: [auction.images[0].url] } : {}),
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${SITE_URL}/auctions/${id}?paid=true`,
      cancel_url: `${SITE_URL}/auctions/${id}`,
      customer_email: session.user.email || undefined,
      metadata: {
        type: "auction_payment",
        auction_id: id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[auction] Payment session error:", err);
    return NextResponse.json({ error: "Failed to create payment session." }, { status: 500 });
  }
}
