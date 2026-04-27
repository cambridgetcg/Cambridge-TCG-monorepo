import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectStatus, syncAccountFromStripe } from "@/lib/payouts/stripe-connect";

// POST — pull fresh account state from Stripe.
// Useful after the user comes back from the hosted onboarding flow when
// the webhook hasn't landed yet.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const status = await getConnectStatus(session.user.id);
  if (!status.accountId) {
    return NextResponse.json({ error: "No Connect account on file" }, { status: 400 });
  }

  try {
    const fresh = await syncAccountFromStripe(status.accountId);
    return NextResponse.json({ status: fresh ?? status });
  } catch (err) {
    console.error("[payouts] Refresh error:", err);
    const msg = err instanceof Error ? err.message : "Failed to refresh status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
