import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAuctions, createSellerAuction } from "@/lib/auction/db";

// GET — user's auctions (as seller)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const auctions = await getUserAuctions(session.user.id);
  return NextResponse.json({ auctions });
}

// POST — create a seller auction (pending approval)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to sell." }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    if (!body.starting_price || body.starting_price <= 0) {
      return NextResponse.json({ error: "Starting price must be positive." }, { status: 400 });
    }
    if (!body.starts_at || !body.ends_at) {
      return NextResponse.json({ error: "Start and end times required." }, { status: 400 });
    }
    if (!["english", "dutch", "buy_now"].includes(body.auction_type)) {
      return NextResponse.json({ error: "Invalid auction type." }, { status: 400 });
    }

    const auction = await createSellerAuction(session.user.id, {
      title: body.title.trim(),
      description: body.description?.trim(),
      auction_type: body.auction_type,
      starting_price: body.starting_price,
      reserve_price: body.reserve_price,
      buy_now_price: body.buy_now_price,
      bid_increment: body.bid_increment,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      allow_best_offer: body.allow_best_offer,
    });

    return NextResponse.json({ auction });
  } catch (err) {
    console.error("[auction] Seller create error:", err);
    return NextResponse.json({ error: "Failed to create auction." }, { status: 500 });
  }
}
