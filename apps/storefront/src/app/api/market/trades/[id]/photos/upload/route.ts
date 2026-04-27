import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { getTradeParticipants } from "@/lib/market/db";
import { getTradePhotoUploadUrl } from "@/lib/market/photos";

// POST — issue a presigned S3 URL for a trade photo upload.
// Auth: only the seller of the trade (or admin) — buyers don't upload here.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await isAdmin();
  let uploaderId: string | null = null;

  if (!admin) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const participants = await getTradeParticipants(id);
    if (!participants) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    if (participants.sellerId !== session.user.id) {
      return NextResponse.json({ error: "Only the seller can upload trade photos" }, { status: 403 });
    }
    uploaderId = session.user.id;
  }

  const { contentType } = await req.json().catch(() => ({}));
  if (!contentType || typeof contentType !== "string") {
    return NextResponse.json({ error: "contentType is required" }, { status: 400 });
  }

  const result = await getTradePhotoUploadUrl(id, contentType);
  return NextResponse.json({ ...result, uploaderId });
}
