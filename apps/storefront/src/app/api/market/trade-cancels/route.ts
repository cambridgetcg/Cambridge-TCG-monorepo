import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  requestCancel,
  listCancelRequestsForUser,
  getPendingCancelForTrade,
} from "@/lib/market/trade-cancels";

// GET — my cancel requests (and any incoming on my trades).
//   activeOnly=1 → only requested
//   tradeId=<id> → pending request on that trade only (or null)
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const tradeId = url.searchParams.get("tradeId");
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  if (tradeId) {
    // Tightly-scoped lookup for /account/trades inline rendering.
    const pending = await getPendingCancelForTrade(tradeId);
    return NextResponse.json({ pending });
  }
  const requests = await listCancelRequestsForUser(session.user.id, { activeOnly });
  return NextResponse.json({ requests });
}

// POST — open a cancel request
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    tradeId?: string;
    reason?: string;
    message?: string;
  };
  if (!body.tradeId || !body.reason) {
    return NextResponse.json({ error: "tradeId and reason required." }, { status: 400 });
  }
  const result = await requestCancel({
    tradeId: body.tradeId,
    requesterId: session.user.id,
    reason: body.reason,
    message: body.message,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ cancel: result.value }, { status: 201 });
}
