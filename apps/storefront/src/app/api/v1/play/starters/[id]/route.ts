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

  // Resolve every unique card_number against the wholesale catalog.
  // Strategy: collect all referenced card_numbers, derive their set
  // prefixes (everything before the dash), batch-fetch by set in
  // parallel. fetchPrices() supports a `set` filter but not a list of
  // card_numbers, so we paginate by set instead. Three sets per starter
  // typically — cheaper than a 9,000-row scan.
  const allRefs = [
    { card_number: deck.leader_card_number, quantity: 1, role: "leader" as const },
    ...deck.card_list,
  ];
  const wanted = new Set(allRefs.map((r) => r.card_number));
  // Map card-number prefixes to wholesale catalog set codes. Most are
  // 1:1 ("OP02" → "OP02"), but Bandai bundled the 2024 and 2025 starter
  // cohorts into single catalog rows (ST15-20, ST23-28) — so ST15-001
  // resolves via the bundled set, not a per-product ST15 row. Keeping
  // this map explicit so a future starter addition doesn't silently
  // 404. See https://cambridgetcg.com/api/v1/prices/games/one-piece for
  // the live set list.
  const BUNDLED_SET_FOR: Record<string, string> = {
    ST15: "ST15-20", ST16: "ST15-20", ST17: "ST15-20",
    ST18: "ST15-20", ST19: "ST15-20", ST20: "ST15-20",
    ST23: "ST23-28", ST24: "ST23-28", ST25: "ST23-28",
    ST26: "ST23-28", ST27: "ST23-28", ST28: "ST23-28",
  };
  const setPrefixes = new Set<string>();
  for (const r of allRefs) {
    const m = r.card_number.match(/^([A-Z]+\d+)/);
    if (m) {
      const prefix = m[1];
      setPrefixes.add(BUNDLED_SET_FOR[prefix] ?? prefix);
    }
  }

  const setPages = await Promise.all(
    Array.from(setPrefixes).map((s) =>
      fetchPrices({ game: "one-piece", set: s, limit: 300 }).catch(() => ({
        items: [],
        total: 0,
      })),
    ),
  );

  const byNumber = new Map<string, (typeof setPages)[number]["items"][number]>();
  for (const page of setPages) {
    for (const item of page.items) {
      if (item.card_number && wanted.has(item.card_number)) {
        // Prefer the first SKU we encounter — typically the cheapest /
        // most-stocked. If multiple language variants exist, the wholesale
        // sort returns a stable order.
        if (!byNumber.has(item.card_number)) {
          byNumber.set(item.card_number, item);
        }
      }
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
