import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { getUserTrades, getAllTrades } from "@/lib/market/db";

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
    return NextResponse.json({ trades });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const userId = session.user.id;
  const trades = await getUserTrades(userId);
  // Annotate each row with the requester's role so the client can render
  // "Bought" vs "Sold" and decide whether to offer a Pay Now button. The
  // pre-existing `isBuyer = !!buyer_name` heuristic was always true because
  // both names are joined in.
  const annotated = trades.map((t) => ({
    ...t,
    current_user_role: t.buyer_id === userId ? ("buyer" as const) : ("seller" as const),
  }));
  return NextResponse.json({ trades: annotated });
}
