import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { updateAuction, deleteAuction } from "@/lib/auction/db";

export async function GET(
  _req: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  // Fail closed until this mixed public/participant/admin endpoint is split
  // into explicit allowlisted projections. In particular, do not call
  // getAuction(): it reads SELECT * plus raw bids and settlement fields.
  return NextResponse.json(
    {
      error: {
        code: "AUCTION_DETAIL_PAUSED",
        message:
          "Public auction detail is paused while separate public and participant-safe projections are completed.",
      },
      does_not_include: [
        "draft or pending-review auctions",
        "bidder, winner, or seller identifiers",
        "best offers or raw bids",
        "payment, payout, shipping, or fulfilment fields",
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const auction = await updateAuction(id, body);
    if (!auction) {
      return NextResponse.json({ error: "Not found or no changes" }, { status: 404 });
    }
    return NextResponse.json(auction);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update auction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteAuction(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Not found or auction is not in draft status" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
