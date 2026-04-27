import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { auth } from "@/lib/auth";
import { getPresignedUploadUrl } from "@/lib/auction/s3";
import { getAuctionSellerId } from "@/lib/auction/db";

export async function POST(req: NextRequest) {
  try {
    const { auctionId, contentType } = await req.json();
    if (!auctionId || !contentType) {
      return NextResponse.json({ error: "auctionId and contentType are required" }, { status: 400 });
    }

    if (!(await isAdmin())) {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const sellerId = await getAuctionSellerId(auctionId);
      if (sellerId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const result = await getPresignedUploadUrl(auctionId, contentType);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
