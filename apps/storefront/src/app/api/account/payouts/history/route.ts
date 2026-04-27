import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPayoutHistory } from "@/lib/payouts/aggregation";

// GET /api/account/payouts/history
//
// Unified earnings history for the signed-in user, pulled from all four
// payout sources and annotated with the payout mechanism (Stripe transfer,
// manual bank reference, or store credit ledger entry). Query logic lives
// in @/lib/payouts/aggregation so the E2E test shares it.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "100", 10) || 100;

  const history = await getPayoutHistory(session.user.id, limit);
  return NextResponse.json(history);
}
