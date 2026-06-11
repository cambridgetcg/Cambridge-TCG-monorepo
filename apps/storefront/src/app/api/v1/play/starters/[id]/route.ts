/**
 * /api/v1/play/starters/[id] — per-starter detail with resolved cards.
 *
 * Returns the starter's metadata + the full card list with each entry
 * resolved against the wholesale catalog (SKU, name, image, rarity).
 * Composes with /api/play/load-starter (GET) for the game-ready deck
 * payload — this endpoint is the read view; that one is the action.
 * Resolution logic is shared via @/lib/play/starter-resolve.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { COLOR_META, totalMainDeckCards } from "@/lib/play/starter-decks";
import { resolveStarter } from "@/lib/play/starter-resolve";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { id } = await params;
  const resolved = await resolveStarter(id);
  if (!resolved) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Starter '${id}' not found. See /api/v1/play/starters.`,
      docs: "/api/v1/play/starters",
    });
  }
  const { deck, leader, cards } = resolved;

  const data = {
    "@kind": "starter_deck_detail",
    id: deck.id,
    product_code: deck.product_code,
    display_name: deck.display_name,
    leader_name: deck.leader_name,
    color: deck.color,
    color_label: COLOR_META[deck.color].name,
    playstyle_short: deck.playstyle_short,
    one_paragraph: deck.one_paragraph,
    complexity: deck.complexity,
    era: deck.era,
    tier: deck.tier,
    decklist_source: deck.decklist_source,
    source_url: deck.source_url ?? null,
    banlist_note: deck.banlist_note ?? null,
    main_deck_cards_declared: totalMainDeckCards(deck),
    leader,
    cards,
    cards_resolved: cards.filter((c) => c.resolved).length,
    cards_unresolved: cards.filter((c) => !c.resolved).length,
    play_url: `/api/play/load-starter?id=${deck.id}`,
    methodology_url: "/methodology/starter-decks",
  };

  return jsonResponse({
    data,
    endpoint: `/api/v1/play/starters/${id}`,
    sources: ["ctcg-derived", "wholesale-rds.cards"],
    source_license: ["cc0", "cc0"],
    freshness: "catalog",
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
