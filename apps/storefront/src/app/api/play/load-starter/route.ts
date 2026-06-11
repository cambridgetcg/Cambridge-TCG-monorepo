/**
 * /api/play/load-starter — a starter deck in game-ready shape.
 *
 * The action half of the starter catalog: /api/v1/play/starters/[id] is
 * the read view; this endpoint returns the same starter flattened into
 * the exact card list POST /api/game/pve/[levelId] (action:"start") and
 * POST /api/game/[code]/setup accept. One GET, one start — no deck
 * builder required.
 *
 *   GET /api/play/load-starter            → default rookie starter (ST-15)
 *   GET /api/play/load-starter?id=<id>    → a specific starter
 *
 * Public, no auth — guests load starters too.
 */

import { NextResponse } from "next/server";
import { resolveStarter } from "@/lib/play/starter-resolve";
import { getDefaultRookieDeck } from "@/lib/play/starter-decks";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || getDefaultRookieDeck().id;

  const resolved = await resolveStarter(id);
  if (!resolved) {
    return NextResponse.json(
      { error: `Starter '${id}' not found. See /api/v1/play/starters.` },
      { status: 404 },
    );
  }
  if (!resolved.leader.resolved) {
    return NextResponse.json(
      { error: `Starter '${id}' leader card could not be resolved against the catalog right now.` },
      { status: 503 },
    );
  }

  const deck: Array<{
    sku: string;
    name: string;
    cardNumber: string;
    imageUrl: string | null;
    rarity: string | null;
    isLeader?: boolean;
  }> = [
    {
      sku: resolved.leader.sku!,
      name: resolved.leader.name!,
      cardNumber: resolved.leader.card_number,
      imageUrl: resolved.leader.image_url,
      rarity: resolved.leader.rarity,
      isLeader: true,
    },
  ];
  for (const card of resolved.cards) {
    if (!card.resolved || !card.sku) continue;
    for (let i = 0; i < card.quantity; i++) {
      deck.push({
        sku: card.sku,
        name: card.name ?? card.card_number,
        cardNumber: card.card_number,
        imageUrl: card.image_url,
        rarity: card.rarity,
      });
    }
  }

  return NextResponse.json({
    starter_id: resolved.deck.id,
    display_name: resolved.deck.display_name,
    deck_size: deck.length,
    cards_unresolved: resolved.cards.filter((c) => !c.resolved).length,
    deck,
    start_pve: "POST /api/game/pve/{levelId} with {\"action\":\"start\",\"deck\":<deck>}",
    catalog_url: "/api/v1/play/starters",
  });
}
