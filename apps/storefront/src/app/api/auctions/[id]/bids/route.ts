import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { placeBid } from "@/lib/auction/db";
import { sendOutbidEmail } from "@/lib/auction/email";
import { query } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  return NextResponse.json(
    {
      error: {
        code: "PUBLIC_BID_HISTORY_PAUSED",
        message:
          "Public bid history is paused while an aggregate-only projection is completed.",
      },
      does_not_include: [
        "bidder identifiers or names",
        "best offers",
        "raw bid rows or trust profiles",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to place a bid." }, { status: 401 });
  }

  const { id } = await params;
  const { amount, is_best_offer } = await request.json();
  const isBestOffer = !!is_best_offer;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid bid amount." }, { status: 400 });
  }

  try {
    // Look up previous high bidder for the outbid email — only relevant for regular bids,
    // and only counts other regular bids (best offers don't compete for the price).
    const prevHigh = isBestOffer
      ? { rows: [] as { user_id: string; email: string }[] }
      : await query(
          `SELECT b.user_id, u.email FROM auction_bids b
           JOIN users u ON b.user_id = u.id
           WHERE b.auction_id = $1 AND b.status = 'active' AND b.is_best_offer = false
           ORDER BY b.amount DESC LIMIT 1`,
          [id]
        );

    const result = await placeBid(id, session.user.id, amount, isBestOffer);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!isBestOffer && prevHigh.rows.length > 0 && prevHigh.rows[0].user_id !== session.user.id) {
      const auctionResult = await query(`SELECT title FROM auctions WHERE id = $1`, [id]);
      const title = auctionResult.rows[0]?.title || "Auction";

      sendOutbidEmail({
        email: prevHigh.rows[0].email,
        auctionTitle: title,
        auctionId: id,
        currentPrice: formatPrice(amount),
      }).catch((err) => console.error("[auction] Outbid email failed:", err));
    }

    // placeBid's internal result carries SELECT * auction and bid rows because
    // settlement needs them. Return a strict receipt to this bidder only;
    // never serialize that internal object across the public route boundary.
    return NextResponse.json({
      success: true,
      bid_id: result.bid?.id ?? null,
      current_price: result.auction?.current_price ?? null,
      bid_count: result.auction?.bid_count ?? null,
      ends_at: result.auction?.ends_at ?? null,
      status: result.auction?.status ?? null,
    });
  } catch (err) {
    console.error("[auction] Bid error:", err);
    return NextResponse.json({ error: "Failed to place bid." }, { status: 500 });
  }
}
