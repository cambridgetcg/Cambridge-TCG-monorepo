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
 * On any wholesale failure, returns `{ results: [] }` rather than 500 —
 * an empty dropdown is a recoverable user experience; a server error
 * isn't.
 *
 * The full fairy-tale, with cast: `docs/connections/two-letters-and-a-falcon.md`.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchPrices } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { gameFromSku } from "@/lib/games/sku-game";

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
  const game = gameFromSku(q.trim()) ?? (requestedGame || "one-piece");

  if (!q.trim() || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await fetchPrices({ game, q: q.trim(), limit: 20 });
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

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
