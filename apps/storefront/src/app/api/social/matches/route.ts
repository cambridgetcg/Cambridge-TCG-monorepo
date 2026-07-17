import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findTradeMatches } from "@/lib/social/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  // Live as of card-level trade intent (wishlist.open_to_trade): matches are
  // members openly looking to trade for cards the viewer holds. No portfolio or
  // wishlist is inferred; only opted-in wishes meet the viewer's own cards.
  const matches = await findTradeMatches(session.user.id);
  return NextResponse.json(
    { matches, matching_available: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
