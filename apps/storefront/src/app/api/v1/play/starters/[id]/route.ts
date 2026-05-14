/**
 * /api/v1/play/starters/[id] — per-starter detail with resolved cards.
 *
 * Returns the starter's metadata + the full card list with each entry
 * resolved against the wholesale catalog (SKU, name, image, rarity).
 * Composes with /api/play/load-starter (POST) for the actual deck-load
 * action — this endpoint is the read view; that one is the write.
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  getStarterDeck,
  COLOR_META,
  totalMainDeckCards,
} from "@/lib/play/starter-decks";
import { fetchPrices } from "@/lib/wholesale/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { id } = await params;
  const deck = getStarterDeck(id);
  if (!deck) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Starter '${id}' not found. See /api/v1/play/starters.`,
      docs: "/api/v1/play/starters",
    });
  }

  // Resolve every unique card_number against the wholesale catalog with
  // a single fetch (game=one-piece, no other filter). Then index by
  // card_number for fast lookup. Substrate-honest about absences: if a
  // card_number doesn't resolve, surface it with `resolved: false` so
  // the consumer knows.
  const allRefs = [
    { card_number: deck.leader_card_number, quantity: 1, role: "leader" as const },
    ...deck.card_list,
  ];
  const wanted = new Set(allRefs.map((r) => r.card_number));

  const catalogPage = await fetchPrices({
    game: "one-piece",
    limit: 500,
  }).catch(() => ({ items: [], total: 0 }));

  const byNumber = new Map<string, (typeof catalogPage.items)[number]>();
  for (const item of catalogPage.items) {
    if (item.card_number && wanted.has(item.card_number)) {
      byNumber.set(item.card_number, item);
    }
  }

  const resolveCard = (ref: { card_number: string; quantity: number; role?: string }) => {
    const cat = byNumber.get(ref.card_number);
    if (!cat) {
      return {
        card_number: ref.card_number,
        quantity: ref.quantity,
        role: ref.role ?? null,
        resolved: false,
        sku: null,
        name: null,
        image_url: null,
        rarity: null,
        set_code: null,
      };
    }
    return {
      card_number: ref.card_number,
      quantity: ref.quantity,
      role: ref.role ?? null,
      resolved: true,
      sku: cat.sku,
      name: cat.name_en || cat.name || ref.card_number,
      image_url: cat.image_url ?? null,
      rarity: cat.rarity ?? null,
      set_code: cat.set_code ?? null,
    };
  };

  const leader = resolveCard({
    card_number: deck.leader_card_number,
    quantity: 1,
    role: "leader",
  });
  const cards = deck.card_list.map((c) => resolveCard(c));

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
    source_license: ["CC0-1.0", "CC0-1.0"],
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
