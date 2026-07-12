import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { auth } from "@/lib/auth";
import { removeAuctionImage, getAuctionSellerId } from "@/lib/auction/db";
import { deleteS3Object } from "@/lib/auction/s3";
import { publicUploadIntakePausedResponse } from "@/lib/uploads/public-intake";

async function authorize(auctionId: string): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sellerId = await getAuctionSellerId(auctionId);
  if (sellerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST() {
  // Registration is paused with signing. Otherwise anyone who reached this
  // phase could persist a forged external URL without uploading an object.
  return publicUploadIntakePausedResponse("auction_image");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await authorize(id);
  if (denied) return denied;

  try {
    const { imageId } = await req.json();
    if (!imageId) {
      return NextResponse.json({ error: "imageId is required" }, { status: 400 });
    }
    const s3Key = await removeAuctionImage(id, imageId);
    if (s3Key) {
      await deleteS3Object(s3Key);
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
