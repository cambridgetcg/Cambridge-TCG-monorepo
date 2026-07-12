import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public market order-book privacy", () => {
  it("selects a strict completed-trade tape instead of returning market_trades.*", () => {
    const db = source("src/lib/market/db.ts");
    const publicBook = db.slice(
      db.indexOf("export async function getCardOrderBook"),
      db.indexOf("// ── Browse: cards with active order books"),
    );

    expect(publicBook).not.toContain("SELECT t.*");
    expect(publicBook).toContain("SELECT t.id, t.price, t.quantity");
    expect(publicBook).toContain("t.escrow_status = 'completed'");
    expect(publicBook).toContain("public_ref:");
    for (const forbidden of [
      "buyer_id", "seller_id", "stripe_payment_intent", "stripe_session_id",
      "tracking_to_ctcg", "tracking_to_buyer", "dispute_reason", "admin_notes",
      "seller_payout", "payout_reference", "shipping_address",
    ]) {
      expect(publicBook).not.toContain(forbidden);
    }
  });

  it("never returns the best-ask seller's internal id and honours profile privacy", () => {
    const unified = source("src/lib/market/unified.ts");
    const sellerLookup = unified.slice(
      unified.indexOf("async function fetchBestAskSeller"),
      unified.indexOf("export interface UnifiedMarketView"),
    );
    expect(sellerLookup).not.toContain("user_id:");
    expect(sellerLookup).toContain("u.is_public = TRUE");
    expect(sellerLookup).toContain("COALESCE(tp.is_suspended, FALSE) = FALSE");
  });

  it("keeps ask seller UUIDs server-side and resolves message targets from listing ids", () => {
    const asks = source("src/app/api/market/offers/asks/route.ts");
    expect(asks).toContain("o.user_id AS seller_id");
    expect(asks).not.toContain("id: row.seller_id");
    expect(asks).toContain("CASE WHEN u.is_public THEN u.username END");
    expect(asks).toContain("COALESCE(tp.is_suspended, FALSE) = FALSE");

    const conversations = source("src/app/api/messages/conversations/route.ts");
    expect(conversations).toContain('body.referenceType === "market_order"');
    expect(conversations).toContain("SELECT user_id");
    expect(conversations).toContain("FROM market_orders");
  });

  it("builds public pulse prices only from completed trades", () => {
    const pulse = source("src/app/api/market/pulse/route.ts");
    expect(pulse).not.toContain("escrow_status <> 'cancelled'");
    expect(pulse.match(/escrow_status = 'completed'/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(pulse).toContain("completed_at AS traded_at");

    const candles = source("src/app/api/market/[sku]/candles/route.ts");
    expect(candles).not.toContain("escrow_status <> 'cancelled'");
    expect(candles).toContain("escrow_status = 'completed'");
    expect(candles).toContain("date_trunc($1, completed_at)");

    for (const path of [
      "src/app/api/market/[sku]/fair-value/route.ts",
      "src/lib/market/digests.ts",
      "src/lib/market/watches.ts",
    ]) {
      const text = source(path);
      expect(text).not.toContain("escrow_status <> 'cancelled'");
      expect(text).toContain("escrow_status = 'completed'");
    }
  });

  it("does not turn private watchlists or alerts into public trend signals", () => {
    for (const path of [
      "src/app/api/market/[sku]/related/route.ts",
      "src/app/api/market/demand-signals/route.ts",
      "src/app/api/market/pulse/route.ts",
    ]) {
      const text = source(path);
      expect(text).not.toContain("FROM market_watches");
      expect(text).not.toContain("FROM price_alerts");
    }
    expect(source("src/app/api/market/[sku]/related/route.ts")).toContain('status: "withheld"');
    expect(source("src/app/api/market/demand-signals/route.ts")).toContain('status: "withheld"');
    expect(source("src/app/api/market/pulse/route.ts")).toContain('status: "withheld"');
  });

  it("keeps the calm market tape and participant section person-free", () => {
    const market = source("src/lib/market/card-market.ts");
    const tape = market.slice(
      market.indexOf("async function loadTape"),
      market.indexOf("async function loadStats"),
    );
    expect(tape).not.toContain("seller_id");
    expect(tape).not.toContain("buyer_id");
    expect(tape).not.toContain("trust_score");
    expect(tape).not.toContain("trade_id: row.id");
    expect(tape).toContain('createHash("sha256")');

    const participants = market.slice(
      market.indexOf("async function loadParticipants"),
      market.indexOf("// ── Public surface"),
    );
    expect(participants).not.toContain("FROM market_trades");
    expect(participants).toContain('status: "withheld"');
  });

  it("withholds person-level financial leaderboards", () => {
    const leaderboards = source("src/app/api/leaderboards/route.ts");
    expect(leaderboards).not.toContain("t.seller_id AS user_id");
    expect(leaderboards).not.toContain("t.buyer_id AS user_id");
    expect(leaderboards).toContain('status: "withheld"');
    expect(leaderboards).toContain("t.escrow_status = 'completed'");
  });
});
