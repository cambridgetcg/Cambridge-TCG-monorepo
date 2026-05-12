import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadUserTrustState } from "@/lib/trust/state";

// Last-90-day trust score history for the requester. Composes the
// kingdom's single trust composer (kingdom-071, S37) rather than
// re-querying `trust_score_history` directly — same canonical shape the
// public mirror at /u/[username]/trust + JSON sibling consume.
//
// The composer returns the full state; this endpoint surfaces only the
// trajectory (composition perimeter principle named in kingdom-074/S39).
// Cheap to call frequently from the dashboard sparkline; the daily
// recompute cron writes the underlying rows.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const state = await loadUserTrustState(session.user.id);
  if (!state) {
    return NextResponse.json({ history: [] });
  }

  return NextResponse.json({ history: state.trajectory.history });
}
