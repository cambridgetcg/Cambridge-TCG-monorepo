import { NextResponse } from "next/server";
import { listPublicDecks } from "@/lib/decks/db";

// GET — public browse. No auth; anyone can see the list of decks users
// have marked is_public. Returns a lightweight shape (no full entries) so
// the listing page doesn't ship megabytes of card data.
export async function GET() {
  const decks = await listPublicDecks(60);
  return NextResponse.json({
    decks: decks.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      leader_sku: d.leader_sku,
      // leader card snapshot for avatar rendering
      leader_card: d.leader_sku
        ? d.entries.find((e) => e.sku === d.leader_sku)?.card ?? null
        : null,
      entry_count: d.entries.reduce((s, e) => s + e.quantity, 0),
      unique_count: d.entries.length,
      tags: d.tags,
      view_count: d.view_count,
      updated_at: d.updated_at,
      user_name: d.user_name,
    })),
  });
}
