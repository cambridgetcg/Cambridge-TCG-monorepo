import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestReturn, listReturnsForBuyer, listReturnsForSeller } from "@/lib/market/returns";

// GET — list my returns scoped by mode.
//   mode=outgoing → returns I (the buyer) opened (default)
//   mode=incoming → returns I (the seller) received
//   activeOnly=1  → only pre-resolution states
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "incoming" ? "incoming" : "outgoing";
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  const returns = mode === "incoming"
    ? await listReturnsForSeller(session.user.id, { activeOnly })
    : await listReturnsForBuyer(session.user.id, { activeOnly });
  return NextResponse.json({ returns, mode });
}

// POST — open a return request
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

  const result = await requestReturn({
    buyerId: session.user.id,
    tradeId: body.tradeId,
    reason: body.reason,
    message: body.message,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ return: result.value }, { status: 201 });
}
