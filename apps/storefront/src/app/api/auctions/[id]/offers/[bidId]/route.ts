import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  acceptOffer,
  rejectOffer,
  getAuctionSellerId,
} from "@/lib/auction/db";
import { sendWinnerEmail } from "@/lib/auction/email";
import { formatPrice } from "@/lib/format";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const { id, bidId } = await params;

  // Seller-of-auction OR admin can act on offers
  const admin = await isAdmin();
  if (!admin) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sellerId = await getAuctionSellerId(id);
    if (sellerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === "accept") {
    const result = await acceptOffer(id, bidId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.winnerEmail && result.winningPrice && result.auctionTitle) {
      sendWinnerEmail({
        email: result.winnerEmail,
        auctionTitle: result.auctionTitle,
        auctionId: id,
        winningPrice: formatPrice(parseFloat(result.winningPrice)),
      }).catch((err) => console.error("[auction] Offer-winner email failed:", err));
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    const ok = await rejectOffer(id, bidId);
    if (!ok) {
      return NextResponse.json({ error: "Offer not found or already resolved." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
