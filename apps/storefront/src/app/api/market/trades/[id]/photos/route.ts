import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  addTradePhoto,
  listTradePhotos,
  getTradeParticipants,
} from "@/lib/market/db";

// GET — list photos. Visible to admin or trade participant (buyer or seller).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await isAdmin();

  if (!admin) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const participants = await getTradeParticipants(id);
    if (!participants) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    if (participants.sellerId !== session.user.id && participants.buyerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const photos = await listTradePhotos(id);
  return NextResponse.json({ photos });
}

// POST — register a photo after the seller uploads to S3.
// Auth: seller only (or admin).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await isAdmin();
  let uploaderId: string;

  if (admin) {
    // Admin uploads as themselves; we still need an id for the row. Fall back
    // to the seller of the trade so the row reflects "seller side" content.
    const participants = await getTradeParticipants(id);
    if (!participants) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    uploaderId = participants.sellerId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const participants = await getTradeParticipants(id);
    if (!participants) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (participants.sellerId !== session.user.id) {
      return NextResponse.json({ error: "Only the seller can submit trade photos" }, { status: 403 });
    }
    uploaderId = session.user.id;
  }

  const body = await request.json().catch(() => ({}));
  const { url, s3Key, photoType } = body as { url?: string; s3Key?: string; photoType?: string };

  if (!url || !s3Key) {
    return NextResponse.json({ error: "url and s3Key are required" }, { status: 400 });
  }

  const photo = await addTradePhoto({
    tradeId: id,
    uploadedBy: uploaderId,
    url,
    s3Key,
    photoType,
  });
  return NextResponse.json({ photo }, { status: 201 });
}
