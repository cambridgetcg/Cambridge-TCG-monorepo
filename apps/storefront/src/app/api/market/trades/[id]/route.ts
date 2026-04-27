import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { updateEscrowStatus, listTradePhotos, reviewTradePhoto } from "@/lib/market/db";

// PATCH — admin: update escrow status, or bulk-review all unreviewed photos.
// Two action shapes supported:
//   { status: "...", trackingToCtcg?, trackingToBuyer?, adminNotes? } — escrow transition
//   { photoReview: "approve" | "reject" }                              — bulk photo decision
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  if (body.photoReview === "approve" || body.photoReview === "reject") {
    const approve = body.photoReview === "approve";
    const photos = await listTradePhotos(id);
    const unreviewed = photos.filter((p) => p.approved === null);
    if (unreviewed.length === 0) {
      return NextResponse.json({ error: "No unreviewed photos for this trade." }, { status: 400 });
    }
    const updated = await Promise.all(unreviewed.map((p) => reviewTradePhoto(p.id, approve)));
    return NextResponse.json({ reviewed: updated.filter(Boolean).length });
  }

  if (!body.status) {
    return NextResponse.json({ error: "Status or photoReview required." }, { status: 400 });
  }

  const trade = await updateEscrowStatus(id, body.status, {
    trackingToCtcg: body.trackingToCtcg,
    trackingToBuyer: body.trackingToBuyer,
    adminNotes: body.adminNotes,
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  return NextResponse.json({ trade });
}
