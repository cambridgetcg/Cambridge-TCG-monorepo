import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { getAuction, placeBid, getBidHistory } from "@/lib/auction/db";
import {
  auctionRecordIsPublic,
  projectAuctionBidsForPublic,
  projectAuctionBidsForSeller,
  projectBidMutationResult,
} from "@/lib/auction/public";
import { sendOutbidEmail } from "@/lib/auction/email";
import { query } from "@/lib/db";
import { formatPrice } from "@/lib/format";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, auction, bids] = await Promise.all([
    auth().catch(() => null),
    getAuction(id),
    getBidHistory(id),
  ]);
  if (!auction) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const uid = session?.user?.id ?? null;
  const admin = uid !== null && (await isAdmin().catch(() => false));
  const seller = !!uid && uid === auction.seller_user_id;
  const winner = !!uid && uid === auction.winner_user_id;

  if (!admin && !seller && !winner && !auctionRecordIsPublic(auction)) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    {
      bids: admin
        ? bids
        : seller
          ? projectAuctionBidsForSeller(bids)
          : projectAuctionBidsForPublic(bids, uid),
    },
    { headers: { "Cache-Control": "private, no-store" } },
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

    return NextResponse.json(projectBidMutationResult(result), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[auction] Bid error:", err);
    return NextResponse.json({ error: "Failed to place bid." }, { status: 500 });
  }
}
