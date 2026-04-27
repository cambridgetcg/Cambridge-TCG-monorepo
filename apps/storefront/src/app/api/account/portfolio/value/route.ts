import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollectionValue } from "@/lib/portfolio/valuation";

// GET /api/account/portfolio/value
// Current valuation: total + by_set + by_rarity + top 10 cards.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const value = await getCollectionValue(session.user.id);
  return NextResponse.json(value);
}
