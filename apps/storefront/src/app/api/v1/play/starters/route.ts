/**
 * /api/v1/play/starters — list the tier-1 rookie starter catalog.
 *
 * Yu, 2026-05-14: the rookie flow needs a machine-readable catalog so
 * the tier-2 page (and federation clients) can render the 6-tile color
 * picker. Substrate-honest about decklist composition: each entry
 * carries a `decklist_source` field declaring whether the card list is
 * Bandai-official or our minimal-playable v1 stub.
 *
 * Sibling to /api/v1/play/starters/[id] (per-starter detail with
 * leader+card resolution against the wholesale catalog).
 */

import { jsonResponse } from "@/lib/data-pantry";
import {
  STARTER_DECKS,
  COLOR_META,
  totalMainDeckCards,
} from "@/lib/play/starter-decks";

export async function GET(req: Request): Promise<Response> {
  // Optional ?tier=1 / ?tier=2 / ?tier=all (default: all). Clients that
  // only want the rookie cohort filter client-side; the API stays
  // discoverable by default.
  const url = new URL(req.url);
  const tierFilter = url.searchParams.get("tier");
  const decks = tierFilter
    ? STARTER_DECKS.filter((d) => String(d.tier) === tierFilter)
    : STARTER_DECKS;

  const data = {
    "@kind": "starter_deck_catalog",
    tier_filter: tierFilter ?? "all",
    count: decks.length,
    starters: decks.map((deck) => ({
      id: deck.id,
      product_code: deck.product_code,
      display_name: deck.display_name,
      leader_name: deck.leader_name,
      leader_card_number: deck.leader_card_number,
      color: deck.color,
      color_label: COLOR_META[deck.color].name,
      playstyle_short: deck.playstyle_short,
      one_paragraph: deck.one_paragraph,
      complexity: deck.complexity,
      era: deck.era,
      tier: deck.tier,
      decklist_source: deck.decklist_source,
      source_url: deck.source_url ?? null,
      // v1 carries a partial card_list for some starters — surface the
      // actual count rather than claiming 50.
      main_deck_cards: totalMainDeckCards(deck),
      detail_url: `/api/v1/play/starters/${deck.id}`,
      play_url: `/api/play/load-starter?id=${deck.id}`,
    })),
    methodology:
      "Tier-1 starters are the Bandai 2024 reboot cohort (ST-15 through " +
      "ST-20). Each leader's color anchors a distinct playstyle. The " +
      "fun-first boundary applies: no card prices, no value tracking, " +
      "no commerce nudges on this surface.",
    methodology_url: "/methodology/starter-decks",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/play/starters",
    sources: ["ctcg-derived"],
    source_license: ["CC0-1.0"],
    freshness: "methodology",
    contains_self: true,
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
