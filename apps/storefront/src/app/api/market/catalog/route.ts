import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { gameFromSku } from "@/lib/games/sku-game";
import { parseSkuShape } from "@/lib/search/resolver";

// Public market browse is first-party only. It enumerates SKUs that collectors
// have actually placed on Cambridge's order book; it never walks the restricted
// wholesale catalog to manufacture a browse list.

type MarketCatalogSource = "market-orders" | "unavailable";

interface ActiveSkuRow {
  sku: string;
  best_bid: string | null;
  best_ask: string | null;
  bid_count: string | number | null;
  ask_count: string | number | null;
}

function sourceHeaders(source: MarketCatalogSource) {
  return {
    "x-catalog-source": source,
    "x-content-license": source === "market-orders" ? "CC0-1.0" : "NOASSERTION",
  };
}

function unavailable() {
  return NextResponse.json(
    {
      error: {
        code: "market_orders_unavailable",
        message:
          "The first-party collector order book cannot be read right now. This is an outage, not an empty market.",
      },
      source: "unavailable" as const,
    },
    { status: 503, headers: sourceHeaders("unavailable") },
  );
}

async function activeSkuRows(): Promise<ActiveSkuRow[] | null> {
  try {
    const result = await query(
      `SELECT sku,
         MAX(CASE WHEN side = 'bid' THEN price END)::text AS best_bid,
         MIN(CASE WHEN side = 'ask' THEN price END)::text AS best_ask,
         SUM(CASE WHEN side = 'bid' THEN quantity - filled_quantity ELSE 0 END)::int AS bid_count,
         SUM(CASE WHEN side = 'ask' THEN quantity - filled_quantity ELSE 0 END)::int AS ask_count
       FROM market_orders
       WHERE status IN ('open', 'partially_filled')
         AND quantity > filled_quantity
       GROUP BY sku
       ORDER BY sku
       LIMIT 5000`,
    );
    return result.rows as ActiveSkuRow[];
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game") || "one-piece";
  const set = url.searchParams.get("set")?.trim().toUpperCase() || null;
  const searchInput = url.searchParams.get("q")?.trim() || "";
  const search = searchInput.toLowerCase();
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "48", 10) || 48, 100));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
  const view = url.searchParams.get("view");

  const rows = await activeSkuRows();
  if (!rows) return unavailable();

  if (view === "games") {
    const games = new Map<string, { code: string; slug: string }>();
    for (const row of rows) {
      const slug = gameFromSku(row.sku);
      if (!slug) continue;
      const parsed = parseSkuShape(row.sku);
      games.set(slug, { code: parsed?.game ?? slug, slug });
    }
    return NextResponse.json(
      {
        games: [...games.values()].sort((left, right) => left.slug.localeCompare(right.slug)),
        source: "market-orders",
        record_license: "CC0-1.0",
        scope: "first-party-active-order-book",
      },
      { headers: sourceHeaders("market-orders") },
    );
  }

  if (view === "sets") {
    const codes = new Set<string>();
    for (const row of rows) {
      if (gameFromSku(row.sku) !== game) continue;
      const parsed = parseSkuShape(row.sku);
      if (parsed?.set) codes.add(parsed.set.toUpperCase());
    }
    return NextResponse.json(
      {
        sets: [...codes].sort().map((code) => ({ code })),
        game,
        source: "market-orders",
        record_license: "CC0-1.0",
        scope: "first-party-active-order-book",
      },
      { headers: sourceHeaders("market-orders") },
    );
  }

  const filtered = rows.filter((row) => {
    if (gameFromSku(row.sku) !== game) return false;
    const parsed = parseSkuShape(row.sku);
    if (set && parsed?.set.toUpperCase() !== set) return false;
    if (search && !row.sku.toLowerCase().includes(search)) return false;
    return true;
  });
  // Manual first-listing path: echo a caller-supplied canonical SKU even when
  // no order exists yet. This asserts only the string's structural grammar,
  // never that the card belongs to a restricted catalog.
  const suppliedShape = parseSkuShape(searchInput);
  if (
    searchInput &&
    suppliedShape &&
    gameFromSku(searchInput) === game &&
    (!set || suppliedShape.set.toUpperCase() === set) &&
    !filtered.some((row) => row.sku.toLowerCase() === search)
  ) {
    filtered.unshift({
      sku: searchInput,
      best_bid: null,
      best_ask: null,
      bid_count: 0,
      ask_count: 0,
    });
  }
  const page = filtered.slice(offset, offset + limit);
  const cards = page.map((row) => {
    const parsed = parseSkuShape(row.sku);
    const bestAsk = row.best_ask == null ? null : Number(row.best_ask);
    return {
      sku: row.sku,
      card_number: parsed?.number ?? row.sku,
      name: row.sku,
      set_code: parsed?.set.toUpperCase() ?? null,
      set_name: null,
      rarity: null,
      image_url: null,
      spot_price: null,
      market_price: bestAsk,
      stock: null,
      best_bid: row.best_bid == null ? null : Number(row.best_bid),
      best_ask: bestAsk,
      p2p_sellers: Number(row.ask_count) || 0,
      p2p_buyers: Number(row.bid_count) || 0,
      has_p2p: true,
      catalog_publication:
        Number(row.bid_count) > 0 || Number(row.ask_count) > 0
          ? "first-party-active-order-book"
          : "caller-supplied-structural-sku",
    };
  });

  return NextResponse.json(
    {
      cards,
      returned_count: cards.length,
      has_more: offset + cards.length < filtered.length,
      game,
      set,
      source: "market-orders",
      rights: {
        record_license: "CC0-1.0",
        scope: "first-party-active-order-book-and-caller-supplied-structural-sku",
        does_not_include: [
          "wholesale catalog membership",
          "imported card or set names",
          "images or rarity",
          "reference prices or stock",
        ],
      },
    },
    { headers: sourceHeaders("market-orders") },
  );
}
