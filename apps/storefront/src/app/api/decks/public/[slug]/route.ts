import { NextResponse } from "next/server";
import { getPublicDeckBySlug, incrementViewCount } from "@/lib/decks/db";
import { toPublicDeckEntry } from "@/lib/decks/publication";

// GET — read-only public deck view. No auth; anyone with the slug can
// see the full card list. view_count bumps on every GET — we don't
// de-dupe by session for now, can add later if it becomes meaningful.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const deck = await getPublicDeckBySlug(slug);
  if (!deck) {
    return NextResponse.json({ error: "Deck not found or not public." }, { status: 404 });
  }

  // Fire-and-forget view bump.
  incrementViewCount(slug).catch(() => {});

  return NextResponse.json({
    deck: {
      slug: deck.slug,
      name: deck.name,
      leader_sku: deck.leader_sku,
      entries: deck.entries.map(toPublicDeckEntry),
      notes: deck.notes,
      tags: deck.tags,
      view_count: deck.view_count,
      updated_at: deck.updated_at,
    },
  });
}
