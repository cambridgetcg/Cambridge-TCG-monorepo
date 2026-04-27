import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { makeOffer, listOffersForBuyer, listOffersForSeller } from "@/lib/market/offers";

// GET — list my offers, scoped by mode.
//   mode=outgoing → offers I (the buyer) made
//   mode=incoming → offers I (the seller) received
//   default       → outgoing
//   activeOnly=1  → only pending + countered
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "incoming" ? "incoming" : "outgoing";
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  const offers = mode === "incoming"
    ? await listOffersForSeller(session.user.id, { activeOnly })
    : await listOffersForBuyer(session.user.id, { activeOnly });
  return NextResponse.json({ offers, mode });
}

// POST — create a new offer
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    askOrderId?: string;
    offerPrice?: number;
    quantity?: number;
    message?: string;
  };
  if (!body.askOrderId || typeof body.offerPrice !== "number") {
    return NextResponse.json({ error: "askOrderId and offerPrice required." }, { status: 400 });
  }

  const result = await makeOffer({
    buyerId: session.user.id,
    askOrderId: body.askOrderId,
    offerPrice: body.offerPrice,
    quantity: body.quantity,
    message: body.message,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ offer: result.value }, { status: 201 });
}
