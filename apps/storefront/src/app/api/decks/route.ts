import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listUserDecks, saveDeck, type DeckEntry } from "@/lib/decks/db";

// GET — list the signed-in user's decks.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const decks = await listUserDecks(session.user.id);
  return NextResponse.json({ decks });
}

// POST — create or overwrite a deck by name.
// Body: { name, leader_sku, entries, notes?, tags?, is_public?, existing_id? }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    leader_sku?: string | null;
    entries?: DeckEntry[];
    notes?: string;
    tags?: string[];
    is_public?: boolean;
    existing_id?: string;
  };

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Deck name required." }, { status: 400 });
  }
  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "Deck entries required." }, { status: 400 });
  }

  try {
    const deck = await saveDeck({
      userId: session.user.id,
      existingId: body.existing_id,
      name: body.name.trim().slice(0, 120),
      leaderSku: body.leader_sku ?? null,
      entries: body.entries,
      notes: (body.notes ?? "").slice(0, 2000) || null,
      tags: (body.tags ?? []).filter((t) => typeof t === "string").map((t) => t.slice(0, 40)).slice(0, 10),
      isPublic: body.is_public,
    });
    return NextResponse.json({ deck });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed." },
      { status: 400 },
    );
  }
}
