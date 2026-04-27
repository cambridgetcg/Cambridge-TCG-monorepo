import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { reviewTradePhoto, deleteTradePhoto } from "@/lib/market/db";
import { deleteTradePhotoObject } from "@/lib/market/photos";

// PATCH — admin approve/reject a photo. The trade itself is not advanced
// here; admin decides separately whether the trade should move to the next
// escrow state. This keeps photo decisions reversible.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { photoId } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const photo = await reviewTradePhoto(photoId, body.action === "approve");
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  return NextResponse.json({ photo });
}

// DELETE — admin remove a photo (e.g. PII or wrong card uploaded by mistake).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { photoId } = await params;
  const s3Key = await deleteTradePhoto(photoId);
  if (s3Key) {
    await deleteTradePhotoObject(s3Key).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
