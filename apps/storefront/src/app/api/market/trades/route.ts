import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { getUserTrades, getAllTrades } from "@/lib/market/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// GET — user's trades (or admin: all trades)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin") === "true";

  if (admin) {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const escrowStatus = url.searchParams.get("escrow") || undefined;
    const trades = await getAllTrades(escrowStatus);
    return NextResponse.json({ trades }, { headers: PRIVATE_NO_STORE });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const userId = session.user.id;
  // Rows carry usernames + user ids, never counterparty emails —
  // getUserTrades stopped selecting them (global free trade §2.3);
  // contact goes through platform messaging.
  const trades = await getUserTrades(userId);
  // Annotate each row with the requester's role so the client can render
  // "Bought" vs "Sold" and decide whether to offer a Pay Now button. The
  // pre-existing `isBuyer = !!buyer_name` heuristic was always true because
  // both names are joined in.
  const annotated = trades.map((t) => ({
    id: t.id,
    buyer_id: t.buyer_id,
    seller_id: t.seller_id,
    sku: t.sku,
    price: t.price,
    quantity: t.quantity,
    escrow_status: t.escrow_status,
    escrow_tier: t.escrow_tier,
    requires_photos: t.requires_photos,
    payment_expires_at: t.payment_expires_at,
    created_at: t.created_at,
    buyer_username: t.buyer_username,
    seller_username: t.seller_username,
    card_name: t.card_name,
    image_url: t.image_url,
    current_user_role: t.buyer_id === userId ? ("buyer" as const) : ("seller" as const),
  }));
  return NextResponse.json({ trades: annotated }, { headers: PRIVATE_NO_STORE });
}
