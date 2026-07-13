import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { getAuction, updateAuction, deleteAuction } from "@/lib/auction/db";
import { isAuctionId } from "@/lib/auction/id";
import {
  auctionRecordIsPublic,
  projectAuctionForAdmin,
  projectAuctionForParticipant,
  projectAuctionForPublic,
} from "@/lib/auction/public";

function notFoundResponse() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isAuctionId(id)) return notFoundResponse();

  const auction = await getAuction(id);
  if (!auction) return notFoundResponse();

  const session = await auth().catch(() => null);
  const uid = session?.user?.id ?? null;
  const admin = uid !== null && (await isAdmin().catch(() => false));
  const role = admin
    ? "admin"
    : uid !== null && uid === auction.seller_user_id
      ? "seller"
      : uid !== null && uid === auction.winner_user_id
        ? "winner"
        : "public";

  if (role === "public" && !auctionRecordIsPublic(auction)) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const response = role === "admin"
    ? projectAuctionForAdmin(auction)
    : role === "seller" || role === "winner"
      ? projectAuctionForParticipant(auction, role, uid!)
      : projectAuctionForPublic(auction, {
          includeAuctionId: uid !== null,
          viewerUserId: uid,
        });
  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isAuctionId(id)) return notFoundResponse();

  try {
    const body = await req.json();
    const auction = await updateAuction(id, body);
    if (!auction) {
      return NextResponse.json({ error: "Not found or no changes" }, { status: 404 });
    }
    return NextResponse.json(auction);
  } catch (err) {
    console.error("[auction] Update failed:", err);
    return NextResponse.json(
      { error: "Failed to update auction" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
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
  if (!isAuctionId(id)) return notFoundResponse();

  const deleted = await deleteAuction(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Not found or auction is not in draft status" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
