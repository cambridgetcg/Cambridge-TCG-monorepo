import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function section(body: string, start: string, end?: string): string {
  const startAt = body.indexOf(start);
  const endAt = end ? body.indexOf(end, startAt + start.length) : body.length;
  expect(startAt, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing section end: ${end ?? "EOF"}`).toBeGreaterThan(startAt);
  return body.slice(startAt, endAt);
}

function expectDalBackstopBefore(
  body: string,
  functionStart: string,
  nextSection: string | undefined,
  firstWrite: string,
): void {
  const fn = section(body, functionStart, nextSection);
  const gateAt = fn.indexOf("assertP2PCommitmentOpen();");
  const writeAt = fn.indexOf(firstWrite);
  expect(gateAt, `${functionStart} is missing its release backstop`).toBeGreaterThanOrEqual(0);
  expect(writeAt, `${functionStart} is missing its expected write`).toBeGreaterThan(gateAt);
}

describe("P2P release admission boundaries", () => {
  it("places a DAL backstop before every order, offer, lot, and automatic-pricing commitment", () => {
    const market = source("src/lib/market/db.ts");
    expectDalBackstopBefore(
      market,
      "export async function placeOrder",
      "// ── Cancel order",
      "INSERT INTO market_orders",
    );

    const offers = source("src/lib/market/offers.ts");
    expectDalBackstopBefore(offers, "export async function makeOffer", "async function createTradeForAcceptedOffer", "INSERT INTO market_offers");
    expectDalBackstopBefore(offers, "export async function acceptOffer", "export async function declineOffer", "createTradeForAcceptedOffer(");
    expectDalBackstopBefore(offers, "export async function counterOffer", "export async function acceptCounter", "UPDATE market_offers");
    expectDalBackstopBefore(offers, "export async function acceptCounter", "export async function withdrawOffer", "createTradeForAcceptedOffer(");

    const lots = source("src/lib/market/lots.ts");
    expectDalBackstopBefore(lots, "export async function createLot", "export async function listPublicLots", "INSERT INTO market_lots");
    expectDalBackstopBefore(lots, "export async function beginLotPurchase", undefined, "INSERT INTO market_lot_trades");

    const rules = source("src/lib/market/pricing-rules.ts");
    expectDalBackstopBefore(rules, "export async function createRule", "// ── Pause / resume / archive", "INSERT INTO pricing_rules");
    expectDalBackstopBefore(rules, "export async function resumeRule", "export async function archiveRule", "transition(");
    expectDalBackstopBefore(rules, "export async function applyRulesToOffer", undefined, "SELECT * FROM pricing_rules");
  });

  it("places a DAL backstop before every auction and swap commitment", () => {
    const auctions = source("src/lib/auction/db.ts");
    expectDalBackstopBefore(auctions, "export async function createAuction", "// ── Update auction", "INSERT INTO auctions");
    expectDalBackstopBefore(auctions, "export async function placeBid", "// ── Bid history", "INSERT INTO auction_bids");
    expectDalBackstopBefore(auctions, "export async function createSellerAuction", "export async function approveAuction", "INSERT INTO auctions");
    expectDalBackstopBefore(auctions, "export async function approveAuction", "export async function rejectAuction", "status          = 'scheduled'");
    expectDalBackstopBefore(auctions, "export async function acceptOffer", "export async function rejectOffer", "UPDATE auctions SET status = 'ended'");
    expect(section(auctions, "export async function updateAuction", "// ── Delete auction")).toContain(
      'data.status === "scheduled" || data.status === "live"',
    );

    const swaps = source("src/lib/swaps/db.ts");
    expectDalBackstopBefore(swaps, "export async function createSwap", "// ── Draft → proposed", "INSERT INTO swap_proposals");
    expectDalBackstopBefore(swaps, "export async function proposeDraft", "// ── Accept / decline / cancel", "status = 'proposed'");
    expectDalBackstopBefore(swaps, "export async function acceptSwap", "export async function declineSwap", "status = 'accepted'");
  });

  it("guards every HTTP route that can introduce one of those commitments", () => {
    const routes = [
      "src/app/api/market/orders/route.ts",
      "src/app/api/market/offers/route.ts",
      "src/app/api/market/offers/[id]/accept/route.ts",
      "src/app/api/market/offers/[id]/counter/route.ts",
      "src/app/api/market/offers/[id]/accept-counter/route.ts",
      "src/app/api/market/lots/route.ts",
      "src/app/api/market/lots/[id]/buy/route.ts",
      "src/app/api/market/pricing-rules/route.ts",
      "src/app/api/market/pricing-rules/[id]/resume/route.ts",
      "src/app/api/auctions/route.ts",
      "src/app/api/auctions/[id]/bids/route.ts",
      "src/app/api/auctions/my/route.ts",
      "src/app/api/swaps/route.ts",
      "src/app/api/swaps/[id]/propose/route.ts",
      "src/app/api/swaps/[id]/accept/route.ts",
    ];
    for (const path of routes) {
      expect(source(path), path).toContain("p2pCommitmentPauseResponse()");
    }

    const auctionMutation = source("src/app/api/auctions/[id]/route.ts");
    expect(auctionMutation).toContain('body?.status === "scheduled"');
    expect(auctionMutation).toContain("p2pCommitmentPauseResponse()");

    const auctionOffer = source("src/app/api/auctions/[id]/offers/[bidId]/route.ts");
    expect(section(auctionOffer, 'if (action === "accept")', 'if (action === "reject")')).toContain(
      "p2pCommitmentPauseResponse()",
    );

    const auctionReview = source("src/app/api/auctions/[id]/approve/route.ts");
    expect(section(auctionReview, 'if (body.action === "approve")', 'if (body.action === "reject")')).toContain(
      "p2pCommitmentPauseResponse()",
    );
  });

  it("does not put the commitment pause on existing-obligation and remedy routes", () => {
    const preservedRoutes = [
      "src/app/api/market/trades/[id]/pay/route.ts",
      "src/app/api/market/trades/[id]/ship/route.ts",
      "src/app/api/market/trades/[id]/received/route.ts",
      "src/app/api/market/trades/[id]/payout/route.ts",
      "src/app/api/market/trades/[id]/photos/route.ts",
      "src/app/api/market/returns/route.ts",
      "src/app/api/market/trade-cancels/route.ts",
      "src/app/api/auctions/[id]/pay/route.ts",
      "src/app/api/auctions/[id]/ship/route.ts",
      "src/app/api/auctions/[id]/received/route.ts",
      "src/app/api/auctions/[id]/payout/route.ts",
      "src/app/api/auctions/[id]/cancel/route.ts",
      "src/app/api/swaps/[id]/ship/route.ts",
      "src/app/api/swaps/[id]/cancel/route.ts",
    ];
    for (const path of preservedRoutes) {
      expect(source(path), path).not.toContain("p2pCommitmentPauseResponse");
    }

    expect(section(source("src/lib/market/db.ts"), "export async function cancelOrder")).not.toContain(
      "assertP2PCommitmentOpen",
    );
    expect(section(source("src/lib/market/offers.ts"), "export async function declineOffer", "export async function counterOffer")).not.toContain(
      "assertP2PCommitmentOpen",
    );
    expect(section(source("src/lib/swaps/db.ts"), "export async function declineSwap", "export async function cancelSwap")).not.toContain(
      "assertP2PCommitmentOpen",
    );
  });
});
