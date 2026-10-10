import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPEN_ORDER_PUBLICATION_NOTICE } from "../publication";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const DERIVED_PUBLIC_SURFACES = [
  "src/app/api/market/[sku]/candles/route.ts",
  "src/app/api/market/[sku]/fair-value/route.ts",
  "src/app/api/market/[sku]/related/route.ts",
  "src/app/api/market/demand-signals/route.ts",
  "src/app/api/market/pulse/route.ts",
  "src/app/api/leaderboards/route.ts",
  "src/lib/market/card-market.ts",
];

describe("public market privacy projections", () => {
  it("puts the public-without-sign-in warning beside both order controls", () => {
    expect(OPEN_ORDER_PUBLICATION_NOTICE).toContain("public without sign-in");
    expect(OPEN_ORDER_PUBLICATION_NOTICE).toContain(
      "stops future Cambridge TCG publication",
    );
    expect(OPEN_ORDER_PUBLICATION_NOTICE).toContain(
      "cannot recall copies already fetched",
    );

    const controls = [
      {
        path: "src/app/market/[sku]/CardMarketClient.tsx",
        marker: 'type="submit"',
      },
      {
        path: "src/components/market/ListingWizard.tsx",
        marker: "onClick={submit}",
      },
    ];
    for (const { path, marker } of controls) {
      const body = source(path);
      const control = body.lastIndexOf(marker);
      expect(control, path).toBeGreaterThanOrEqual(0);
      const nearbyNotice = body.slice(control, control + 2_500);
      expect(nearbyNotice, path).toContain("OPEN_ORDER_PUBLICATION_NOTICE");
      expect(nearbyNotice, path).toContain('href="/privacy#market-orders"');
    }
  });

  it("publishes deliberate open-order intent without completed trades", () => {
    const db = source("src/lib/market/db.ts");
    const book = db.slice(
      db.indexOf("export async function getCardOrderBook"),
      db.indexOf("export async function getMarketSummaries"),
    );
    expect(book).toContain("FROM market_orders");
    expect(book).toContain(
      "SUM(quantity - filled_quantity) as total_quantity",
    );
    expect(book).toContain("COUNT(*) as order_count");
    expect(book).toContain("trade_aggregates: []");
    expect(book).toContain("COMPLETED_TRADE_PUBLICATION");
    expect(book).not.toContain("market_trades");
    expect(book).not.toContain("seller_id");
    expect(book).not.toContain("buyer_id");

    const unified = source("src/lib/market/unified.ts");
    expect(unified).not.toContain("BestAskSeller");
    expect(unified).not.toContain("seller_id");
    expect(unified).not.toContain("trust_profiles");
    expect(unified).not.toContain("JOIN users");
  });

  it("pauses watch, alert, co-watch, and completed-trade derivatives", () => {
    for (const path of DERIVED_PUBLIC_SURFACES) {
      const body = source(path);
      expect(body, path).not.toContain("market_trades");
      expect(body, path).not.toContain("market_watches");
      expect(body, path).not.toContain("price_alerts");
      expect(body, path).not.toContain("percentile_cont");
    }

    const pulse = source("src/app/api/market/pulse/route.ts");
    expect(pulse).toContain("FROM market_orders");
    expect(pulse).toContain("hot: []");
    expect(pulse).toContain("movers: []");
    expect(pulse).toContain("mostWatched: []");
    expect(pulse).toContain("dailyTradeAggregates: []");

    for (const path of [
      "src/app/api/market/demand-signals/route.ts",
      "src/app/api/market/[sku]/related/route.ts",
      "src/app/api/leaderboards/route.ts",
    ]) {
      expect(source(path), path).not.toContain('from "@/lib/db"');
    }
  });

  it("keeps former trade-analysis response shapes empty and explicit", () => {
    const candles = source("src/app/api/market/[sku]/candles/route.ts");
    expect(candles).toContain("candles: []");
    expect(candles).toContain("latestAggregatePrice: null");
    expect(candles).toContain("COMPLETED_TRADE_PUBLICATION");
    expect(candles).not.toContain("searchParams");

    const fair = source("src/app/api/market/[sku]/fair-value/route.ts");
    expect(fair).toContain("tradeCount: 0");
    expect(fair).toContain("vwap: null");
    expect(fair).toContain("median: null");
    expect(fair).toContain("COMPLETED_TRADE_PUBLICATION");
    expect(fair).not.toContain("searchParams");

    const leaderboard = source("src/app/api/leaderboards/route.ts");
    expect(leaderboard).toContain("topSellers: []");
    expect(leaderboard).toContain("topBuyers: []");
    expect(leaderboard).toContain("busiestSkus: []");
  });

  it("keeps the read-only mirror on current offers and pauses mixed reference history", () => {
    const composer = source("src/lib/market/card-market.ts");
    expect(composer).toContain('return { entries: [] }');
    expect(composer).toContain("vwap_30d: null");
    expect(composer).toContain('"market_orders"');
    expect(composer).not.toContain('FROM card_price_history');
    expect(composer).toContain("const window_365d: PriceHistoryPoint[] = []");
    expect(composer).not.toContain("last_trade_price");
    expect(composer).not.toContain("CardMarketParticipants");
  });
});
