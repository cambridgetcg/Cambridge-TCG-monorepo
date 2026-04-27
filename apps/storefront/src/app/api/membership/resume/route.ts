import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resumeSubscription } from "@/lib/membership/subscription";

// POST — undo a scheduled cancellation. Subscription continues
// renewing as before.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await resumeSubscription(session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
