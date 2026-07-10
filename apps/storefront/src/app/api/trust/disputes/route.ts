import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  raiseDispute,
  listDisputes,
  listMyDisputes,
  getDisputeByTradeForUser,
} from "@/lib/trust/db";
import { query } from "@/lib/db";

// GET
//   ?admin=true                 → admin-only full list
//   ?admin=true&status=open     → admin-only filtered list
//   ?trade_id=<id>              → dispute for a given trade the caller is party to
//   (no query)                  → signed-in user's disputes (listMyDisputes)
//
// Previously this route rejected anything but ?admin=true with a 400,
// which is why the user-facing dispute panel on /account/trades/[id]
// silently failed to render.
export async function GET(request: Request) {
  const url = new URL(request.url);

  // ── Admin path ──
  if (url.searchParams.get("admin") === "true") {
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const status = url.searchParams.get("status") || undefined;
    const disputes = await listDisputes(status);
    return NextResponse.json({ disputes });
  }

  // ── User path ──
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const tradeId = url.searchParams.get("trade_id");
  if (tradeId) {
    const dispute = await getDisputeByTradeForUser(tradeId, session.user.id);
    return NextResponse.json({ dispute });
  }

  const disputes = await listMyDisputes(session.user.id);
  return NextResponse.json({ disputes });
}

// POST — raise a dispute
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  if (!body.tradeId) return NextResponse.json({ error: "Trade ID required." }, { status: 400 });
  if (!body.reason) return NextResponse.json({ error: "Reason required." }, { status: 400 });
  if (!body.description?.trim()) return NextResponse.json({ error: "Description required." }, { status: 400 });

  // Verify user is part of this trade
  const trade = await query(
    `SELECT * FROM market_trades WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)`,
    [body.tradeId, session.user.id]
  );
  if (trade.rows.length === 0) return NextResponse.json({ error: "Trade not found." }, { status: 404 });

  try {
    const dispute = await raiseDispute(body.tradeId, session.user.id, body.reason, body.description.trim());
    return NextResponse.json({ dispute });
  } catch (err) {
    // raiseDispute throws when the trade isn't disputable (unpaid, closed,
    // past its window, or already disputed) — a client error, not a 500.
    const message = err instanceof Error ? err.message : "Could not raise dispute.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
