import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findTradeMatches } from "@/lib/social/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const matches = await findTradeMatches(session.user.id);
  return NextResponse.json({
    matches,
    matching_available: false,
    reason:
      "Matching is paused until card-level trade intents provide explicit opt-in. Portfolios and wishlists remain private.",
  });
}
