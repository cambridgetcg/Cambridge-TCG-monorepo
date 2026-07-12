import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  listTradePhotos,
  getTradeParticipants,
} from "@/lib/market/db";
import { publicUploadIntakePausedResponse } from "@/lib/uploads/public-intake";

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

// POST — new URL registration is paused for every caller.
export async function POST() {
  // Do not retain caller-supplied URLs while the matching presign door is
  // closed; accepting them would make the two-phase pause bypassable.
  return publicUploadIntakePausedResponse("trade_photo");
}
