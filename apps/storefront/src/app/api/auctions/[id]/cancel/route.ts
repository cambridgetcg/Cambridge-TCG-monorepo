import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { cancelAuction } from "@/lib/auction/cancel";

// POST — cancel an auction.
//   Seller path: auctions in pending_review/scheduled, or live with zero bids.
//   Admin path:  any pre-paid auction with a reason.
// Refund-required cancellations (paid/ended) must run the refund flow first.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const admin = await isAdmin();

  if (!userId && !admin) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : "";

  const result = await cancelAuction({
    auctionId: id,
    actorUserId: userId,
    isAdmin: admin,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
