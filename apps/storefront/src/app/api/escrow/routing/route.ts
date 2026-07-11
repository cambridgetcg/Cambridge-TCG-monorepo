import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { routeTrade, getTradeRouting, getUserThresholds, getEscrowSummary } from "@/lib/escrow/service-tiers";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// GET — get routing for a specific trade or preview for a value
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tradeId = url.searchParams.get("tradeId");
  const previewValue = url.searchParams.get("value");

  // Specific trade routing
  if (tradeId) {
    const session = await auth();
    if (!session?.user?.id || !/^[0-9a-f-]{36}$/i.test(tradeId)) {
      return NextResponse.json(
        { error: "Trade not found." },
        { status: 404, headers: PRIVATE_NO_STORE },
      );
    }

    const routing = await getTradeRouting(tradeId, session.user.id);
    if (!routing) {
      return NextResponse.json(
        { error: "Trade not found." },
        { status: 404, headers: PRIVATE_NO_STORE },
      );
    }
    return NextResponse.json(
      { routing, summary: getEscrowSummary(routing) },
      { headers: PRIVATE_NO_STORE },
    );
  }

  // Preview: what tier would a trade at this value use?
  if (previewValue) {
    const session = await auth();
    const trustScore = 0; // Default for unauthenticated

    if (session?.user?.id) {
      const { query } = await import("@/lib/db");
      const user = await query("SELECT trust_score FROM users WHERE id=$1", [session.user.id]);
      const score = user.rows[0]?.trust_score || 0;

      const routing = await routeTrade({
        tradeValue: parseFloat(previewValue),
        sellerTrustScore: score,
        buyerTrustScore: score,
        sellerIsFlagged: false,
        buyerIsFlagged: false,
      });

      const thresholds = getUserThresholds(score);
      return NextResponse.json(
        { routing, summary: getEscrowSummary(routing), thresholds },
        { headers: PRIVATE_NO_STORE },
      );
    }

    // Unauthenticated preview (use lowest trust)
    const routing = await routeTrade({
      tradeValue: parseFloat(previewValue),
      sellerTrustScore: trustScore,
      buyerTrustScore: trustScore,
      sellerIsFlagged: false,
      buyerIsFlagged: false,
    });

    const thresholds = getUserThresholds(trustScore);
    return NextResponse.json(
      { routing, summary: getEscrowSummary(routing), thresholds },
      { headers: PRIVATE_NO_STORE },
    );
  }

  // No params: return user's thresholds
  const session = await auth();
  if (!session?.user?.id) {
    const thresholds = getUserThresholds(0);
    return NextResponse.json({ thresholds }, { headers: PRIVATE_NO_STORE });
  }

  const { query } = await import("@/lib/db");
  const user = await query("SELECT trust_score FROM users WHERE id=$1", [session.user.id]);
  const thresholds = getUserThresholds(user.rows[0]?.trust_score || 0);
  return NextResponse.json({ thresholds }, { headers: PRIVATE_NO_STORE });
}
