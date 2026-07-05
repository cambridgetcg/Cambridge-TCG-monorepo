import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSwap, listSwapsForUser } from "@/lib/swaps/db";
import type { SwapItemInput } from "@/lib/swaps/types";

// GET — list my swaps.
//   mode=incoming → proposals sent TO me (drafts excluded — a draft is
//                    invisible to its recipient until proposed)
//   mode=outgoing → proposals I made (default)
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "incoming" ? "incoming" : "outgoing";
  const swaps = await listSwapsForUser(session.user.id, mode);
  return NextResponse.json({ swaps, mode });
}

// POST — create a swap proposal (or a counter, via counterOf).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    recipientUsername?: string;
    recipientId?: string;
    items?: SwapItemInput[];
    cashDeltaPence?: number;
    note?: string;
    expiresInHours?: number;
    draft?: boolean;
    counterOf?: string;
  };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items required." }, { status: 400 });
  }

  const result = await createSwap({
    proposerId: session.user.id,
    recipientUsername: body.recipientUsername,
    recipientId: body.recipientId,
    items: body.items,
    cashDeltaPence: body.cashDeltaPence,
    note: body.note,
    expiresInHours: body.expiresInHours,
    draft: body.draft,
    counterOf: body.counterOf,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value }, { status: 201 });
}
