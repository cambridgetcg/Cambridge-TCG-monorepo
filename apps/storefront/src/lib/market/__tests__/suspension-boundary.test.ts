import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function suspensionFilterCount(body: string): number {
  return body.match(/suspended\.is_suspended = TRUE/g)?.length ?? 0;
}

describe("suspended market-account boundary", () => {
  it("re-checks the taker in-transaction and excludes suspended resting-order makers", () => {
    const db = source("src/lib/market/db.ts");
    const placeOrder = db.slice(
      db.indexOf("export async function placeOrder"),
      db.indexOf("// ── Cancel order"),
    );

    expect(placeOrder).toContain(
      "Order rejected because account standing could not be verified",
    );
    expect(placeOrder).toContain("SELECT is_suspended, suspended_reason");
    expect(placeOrder).toContain("FOR SHARE");
    expect(placeOrder).toContain("JOIN trust_profiles tp");
    expect(placeOrder).toContain("tp.is_suspended = false");
    expect(placeOrder).toContain("FOR UPDATE OF o");
    expect(placeOrder).toContain("FOR SHARE OF tp");
  });

  it("removes suspended owners from canonical public book and browse summaries", () => {
    const db = source("src/lib/market/db.ts");
    const publicReads = db.slice(
      db.indexOf("export async function getCardOrderBook"),
      db.indexOf("// ── User's orders"),
    );

    // Bid levels, ask levels, card metadata and browse summaries each carry
    // their own exclusion rather than relying on a UI-only projection.
    expect(suspensionFilterCount(publicReads)).toBeGreaterThanOrEqual(4);
  });

  it("filters every direct public/current-order projection", () => {
    const surfaces: Array<[string, number]> = [
      ["src/app/api/market/catalog/route.ts", 1],
      ["src/app/api/market/offers/asks/route.ts", 1],
      ["src/app/api/market/pulse/route.ts", 1],
      ["src/lib/market/card-market.ts", 3],
      ["src/lib/market/digests.ts", 6],
      ["src/lib/market/saved-searches.ts", 3],
      ["src/lib/market/watches.ts", 6],
      ["src/lib/market/liquidity.ts", 1],
      ["src/lib/messages/db.ts", 1],
      ["src/lib/portfolio/risk.ts", 2],
      ["src/lib/portfolio/targets.ts", 2],
      ["src/lib/portfolio/valuation.ts", 1],
      ["src/lib/email/handlers/wishlist-matched.ts", 1],
      ["src/lib/wishlist/availability.ts", 1],
      ["src/lib/wishlist/matching.ts", 1],
    ];

    for (const [path, minimum] of surfaces) {
      expect(suspensionFilterCount(source(path)), path).toBeGreaterThanOrEqual(
        minimum,
      );
    }
  });

  it("blocks offer creation and accepted-offer trade creation for suspended parties", () => {
    const offers = source("src/lib/market/offers.ts");
    const makeOffer = offers.slice(
      offers.indexOf("export async function makeOffer"),
      offers.indexOf("async function createTradeForAcceptedOffer"),
    );
    expect(suspensionFilterCount(makeOffer)).toBeGreaterThanOrEqual(1);

    const acceptance = offers.slice(
      offers.indexOf("async function createTradeForAcceptedOffer"),
      offers.indexOf("export async function acceptOffer"),
    );
    expect(acceptance).toContain("lockTradeStanding(q");
    expect(acceptance).toContain("FOR UPDATE");
    expect(acceptance).toContain(
      "standing.missingUserIds.includes(offer.seller_id)",
    );
    expect(acceptance).toContain(
      "standing.suspendedUserIds.includes(offer.seller_id)",
    );
    expect(acceptance).toContain(
      "standing.missingUserIds.includes(offer.buyer_id)",
    );
    expect(acceptance).toContain(
      "standing.suspendedUserIds.includes(offer.buyer_id)",
    );
  });
});
