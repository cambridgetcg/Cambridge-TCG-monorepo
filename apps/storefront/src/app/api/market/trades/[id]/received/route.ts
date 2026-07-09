import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmReceived } from "@/lib/market/completion";

// POST — buyer confirms the card arrived. The first non-admin writer of
// escrow_status='completed': stamps completed_at + delivered_at +
// completed_via='buyer_confirm', which starts the seller's payout clock
// (lib/payouts/sweep.ts reads completed_at + payout_hold_days) and closes
// the dispute window. State rules + side-effects live in
// lib/market/completion.ts; see /methodology/trade-completion.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const result = await confirmReceived(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason ?? "Could not confirm receipt." },
      { status: result.status ?? 400 },
    );
  }
  return NextResponse.json({ trade: result.trade });
}
