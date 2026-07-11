import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("interactive auction privacy contract", () => {
  it("projects every SSR viewer role before hydration", () => {
    const page = source("src/app/auctions/[id]/page.tsx");

    expect(page).toContain("auctionRecordIsPublic");
    expect(page).toContain("projectAuctionForPublic");
    expect(page).toContain("projectAuctionForParticipant");
    expect(page).toContain("projectAuctionForAdmin");
    expect(page).not.toContain("loadBidderTiers");
    expect(
      existsSync(resolve(process.cwd(), "src/app/auctions/[id]/bidder-tiers.ts")),
    ).toBe(false);
  });

  it("derives participant UI from each polled response", () => {
    const client = source("src/app/auctions/[id]/AuctionDetailClient.tsx");
    const postWin = source("src/components/auction/PostWinPanel.tsx");

    expect(client).not.toContain("hasParticipantDetail:");
    expect(client).toContain("hasParticipantAuctionDetail(auction)");
    expect(client).toContain("viewerRole={auction.viewer_role}");
    expect(client).toContain("setAuction({ ...data, id })");
    expect(postWin).toContain('viewerRole === "winner"');
    expect(postWin).toContain('viewerRole === "seller"');
    expect(postWin).not.toContain("winner_user_id");
    expect(postWin).not.toContain("seller_user_id");
  });

  it("uses viewer-only ownership flags instead of public user ids", () => {
    const panel = source("src/components/auction/BidPanel.tsx");
    const history = source("src/components/auction/BidHistory.tsx");
    const client = source("src/app/auctions/[id]/AuctionDetailClient.tsx");

    expect(panel).toContain('"is_own" in bid');
    expect(panel).not.toContain("user_id");
    expect(client).not.toContain("user_id");
    expect(history).not.toContain("user_id");
    expect(history).not.toContain("TrustTier");
  });

  it("records the same publication and commercial-term boundaries in discovery", () => {
    const manifest = source("src/lib/manifest.ts");
    const auctionClaims = manifest.slice(
      manifest.indexOf('{ id: "storefront.auctions"'),
      manifest.indexOf('{ id: "storefront.trader_dashboard"'),
    );

    expect(auctionClaims).toContain("Draft and unapproved consignment listings");
    expect(auctionClaims).toContain("seller-specific commercial terms");
    expect(auctionClaims).toContain("No bidder or winner identifier or trust field");
    expect(auctionClaims).toContain('id: "storefront.auctions_admin_create"');
    expect(auctionClaims).toContain('id: "storefront.auction_bid_history"');
    expect(auctionClaims).toContain('id: "storefront.auction_bid_mutation"');
    expect(auctionClaims).toContain("never a raw auction or participant row");
  });

  it("applies the publication predicate inside the list query", () => {
    const db = source("src/lib/auction/db.ts");

    expect(db).toContain("PUBLIC_AUCTION_SQL_PREDICATE");
    expect(db).toContain("normalizeAuctionListStatus");
    expect(db).toContain("if (!options.includeUnpublished)");
  });
});
