import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelSubscription } from "@/lib/membership/subscription";

// POST — schedule cancellation at the end of the current billing period.
// User keeps Platinum until the period elapses, then drops to spend tier.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await cancelSubscription(session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, cancelAt: result.cancelAt });
}
