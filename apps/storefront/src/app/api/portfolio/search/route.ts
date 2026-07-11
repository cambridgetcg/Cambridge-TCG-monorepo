/**
 * GET /api/portfolio/search — the Embassy.
 *
 * The user types into a search bar; this endpoint races to give them
 * matches. Auth-gated (the library is for citizens). Refuses audience
 * for queries shorter than two letters (`q.length < 2`) — *the library
 * is to be visited, not scrolled.*
 *
 * The work itself is delegated outward: this route is a doorkeeper, not
 * a librarian. It calls `fetchPrices()` (the Falcon) which carries a
 * Bearer-token to the Wholesale kingdom; the answer comes back; the
 * Appraiser (`retailPrice`) stamps each row before it leaves the
 * Embassy gate, so the user sees retail and never wholesale.
 *
 * On wholesale failure, returns an honest 503 (`search_unavailable`)
 * rather than `{ results: [] }` — an outage must never be
 * indistinguishable from "no matches". Success bodies carry the
 * `source` the Falcon stamped (`wholesale-api` | `wholesale-db`) so
 * the UI can label provenance.
 *
 * The full fairy-tale, with cast: `docs/connections/two-letters-and-a-falcon.md`.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchPrices, type WholesaleSource } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { gameFromSku } from "@/lib/games/sku-game";

function searchUnavailable() {
  return NextResponse.json(
    {
      error: {
        code: "search_unavailable",
        message:
          "Card search can't be served right now: the wholesale API is unreachable and the direct database read also failed. This is a source outage, not an empty result — please try again shortly.",
      },
      source: "unavailable" as const,
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  // Game resolution, most-specific first: a SKU-shaped query names its
  // own game via the prefix (PK-… is pokemon whatever the caller said);
  // otherwise the caller's explicit ?game=; otherwise One Piece, the
  // catalog's founding game. Before this, the default silently locked
  // portfolio/wishlist search to one-piece for every caller.
  const requestedGame = (url.searchParams.get("game") || "").trim();
  // A SKU never contains whitespace and both regimes have >=3 hyphen
  // segments — don't let natural-language queries ("alt-art Luffy",
  // "gen-1 Charizard") hijack the game via their first token now that
  // gameFromSku resolves every registered code (review batch 2026-07-07).
  const trimmed = q.trim();
  const skuShaped =
    trimmed.length > 0 && !/\s/.test(trimmed) && trimmed.split("-").length >= 3;
  const game = (skuShaped ? gameFromSku(trimmed) : null) ?? (requestedGame || "one-piece");

  if (!q.trim() || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await fetchPrices({ game, q: q.trim(), limit: 20 });
    // fetchPrices swallows failures internally and stamps
    // source: 'unavailable' — an outage must not render as "no matches".
    const source: WholesaleSource = data.source ?? "unavailable";
    if (source === "unavailable") {
      return searchUnavailable();
    }
    const results = data.items.map((item) => ({
      sku: item.sku,
      card_name: item.name_en || item.name || item.card_number,
      card_number: item.card_number,
      set_code: item.set_code,
      set_name: item.set_name,
      image_url: item.image_url,
      rarity: item.rarity,
      price: retailPrice(item.price_gbp, item.channel_price),
      stock: item.stock,
    }));

    return NextResponse.json({ results, source });
  } catch {
    return searchUnavailable();
  }
}
