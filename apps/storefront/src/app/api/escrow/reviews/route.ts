import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { submitReview, getUserReviews } from "@/lib/escrow/trust-engine";
import { ReviewGateError } from "@/lib/reviews/gates";
import { query } from "@/lib/db";

// GET — reviews for a user
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  const reviews = await getUserReviews(userId);
  return NextResponse.json({ reviews });
}

// POST — submit a review after trade
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  if (!body.tradeId) return NextResponse.json({ error: "Trade ID required." }, { status: 400 });
  if (!body.rating || body.rating < 1 || body.rating > 5) return NextResponse.json({ error: "Rating 1-5 required." }, { status: 400 });

  // Verify user is part of the trade and determine role. Terminal states
  // (completed | refunded) are both reviewable — mirrors lib/reviews/gates.ts.
  const trade = await query(
    `SELECT * FROM market_trades WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2) AND escrow_status IN ('completed','refunded')`,
    [body.tradeId, session.user.id]
  );
  if (trade.rows.length === 0) return NextResponse.json({ error: "Trade not found or not yet completed/refunded." }, { status: 404 });

  const t = trade.rows[0];
  const isBuyer = t.buyer_id === session.user.id;
  const revieweeId = isBuyer ? t.seller_id : t.buyer_id;

  try {
    const review = await submitReview({
      tradeId: body.tradeId,
      reviewerId: session.user.id,
      revieweeId,
      role: isBuyer ? "buyer" : "seller",
      rating: body.rating,
      cardAccuracy: body.cardAccuracy,
      shippingSpeed: body.shippingSpeed,
      communication: body.communication,
      comment: body.comment?.trim(),
    });
    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof ReviewGateError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "rate_limit" ? 429 : 403 },
      );
    }
    throw err;
  }
}
