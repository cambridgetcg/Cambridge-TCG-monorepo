import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserDeck, deleteDeck, saveDeck, type DeckEntry } from "@/lib/decks/db";

// GET — fetch a specific deck by id or slug (must be owned by caller).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const deck = await getUserDeck(session.user.id, id);
  if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
  return NextResponse.json({ deck });
}

// PATCH — partial update. Supports is_public toggle, rename, metadata edits.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const existing = await getUserDeck(session.user.id, id);
  if (!existing) return NextResponse.json({ error: "Deck not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    leader_sku?: string | null;
    entries?: DeckEntry[];
    notes?: string;
    tags?: string[];
    is_public?: boolean;
  };

  const deck = await saveDeck({
    userId: session.user.id,
    existingId: existing.id,
    name: body.name?.trim().slice(0, 120) ?? existing.name,
    leaderSku: body.leader_sku !== undefined ? body.leader_sku : existing.leader_sku,
    entries: Array.isArray(body.entries) ? body.entries : existing.entries,
    notes: body.notes !== undefined ? (body.notes.slice(0, 2000) || null) : existing.notes,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((t) => typeof t === "string").map((t) => t.slice(0, 40)).slice(0, 10)
      : existing.tags,
    isPublic: body.is_public !== undefined ? body.is_public : existing.is_public,
  });
  return NextResponse.json({ deck });
}

// DELETE — remove a deck.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteDeck(session.user.id, id);
  if (!ok) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
