import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSwapForUser, getSwapLifecycle } from "@/lib/swaps/db";

// GET — one swap with items + lifecycle log. Participant-scoped: the
// query itself filters on proposer/recipient, so a non-party gets 404
// (not 403 — existence is participant-only information too).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;

  const found = await getSwapForUser(id, session.user.id);
  if (!found) return NextResponse.json({ error: "Swap not found." }, { status: 404 });

  const lifecycle = await getSwapLifecycle(id);
  return NextResponse.json({ swap: found.swap, items: found.items, lifecycle });
}
