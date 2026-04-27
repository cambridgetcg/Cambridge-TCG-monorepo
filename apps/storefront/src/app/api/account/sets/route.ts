import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSetsWithProgress } from "@/lib/portfolio/sets";

// GET /api/account/sets?game=one-piece&minOwned=1
//
// Returns every set the platform knows about, decorated with this
// user's owned count + completion %. Pass minOwned=1 to filter to
// "sets I'm collecting" (≥1 owned card).
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const game = url.searchParams.get("game") || undefined;
  const minOwnedRaw = url.searchParams.get("minOwned");
  const minOwned = minOwnedRaw ? Math.max(0, parseInt(minOwnedRaw, 10) || 0) : 0;

  const sets = await listSetsWithProgress(session.user.id, { game, minOwned });
  return NextResponse.json({ sets });
}
