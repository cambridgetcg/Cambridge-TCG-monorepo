import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { updateEscrowStatus, listTradePhotos, reviewTradePhoto } from "@/lib/market/db";

// GET — participant view of a single trade. Usernames + user ids instead
// of counterparty emails (contact goes through platform messaging — global
// free trade §2.3). The buyer's shipping_address (migration 0105) rides
// along for both parties: the seller reads their ship-to, the buyer reads
// the address they themselves entered at checkout.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    `SELECT t.*,
       bu.name as buyer_name, bu.username as buyer_username,
       su.name as seller_name, su.username as seller_username,
       o.card_name, o.image_url
     FROM market_trades t
     LEFT JOIN users bu ON t.buyer_id = bu.id
     LEFT JOIN users su ON t.seller_id = su.id
     LEFT JOIN market_orders o ON t.bid_order_id = o.id
     WHERE t.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const trade = result.rows[0];
  if (trade.buyer_id !== session.user.id && trade.seller_id !== session.user.id) {
    return NextResponse.json({ error: "Not your trade." }, { status: 403 });
  }

  // Same role annotation as the list endpoint so clients share one contract.
  const current_user_role = trade.buyer_id === session.user.id ? ("buyer" as const) : ("seller" as const);
  return NextResponse.json({ trade: { ...trade, current_user_role } });
}

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
