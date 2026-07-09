import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { makeOffer, listOffersForBuyer, listOffersForSeller } from "@/lib/market/offers";
import { resolveCommissionRate } from "@/lib/membership/commission";
import { DEFAULT_COMMISSION_CAP_GBP } from "@cambridge-tcg/pricing";

// GET — list my offers, scoped by mode.
//   mode=outgoing → offers I (the buyer) made
//   mode=incoming → offers I (the seller) received
//   default       → outgoing
//   activeOnly=1  → only pending + countered
//
// viewerCommission is the caller's OWN resolved P2P rate (the
// min(membership, trust) combine) with the per-item cap — what acceptance
// would actually charge them as a seller. It exists so the offers page
// never displays a hardcoded rate. A buyer's view must not use it to
// estimate the counterparty seller's fee (that seller's tier rate is not
// in this payload).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "incoming" ? "incoming" : "outgoing";
  const activeOnly = url.searchParams.get("activeOnly") === "1";

  const [offers, commission] = await Promise.all([
    mode === "incoming"
      ? listOffersForSeller(session.user.id, { activeOnly })
      : listOffersForBuyer(session.user.id, { activeOnly }),
    resolveCommissionRate({ sellerId: session.user.id, kind: "p2p" }),
  ]);
  return NextResponse.json({
    offers,
    mode,
    viewerCommission: {
      rate: commission.rate,
      source: commission.source,
      capGbp: DEFAULT_COMMISSION_CAP_GBP,
    },
  });
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
