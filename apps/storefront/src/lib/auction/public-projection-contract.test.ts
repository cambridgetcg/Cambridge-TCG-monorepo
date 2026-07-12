import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("auction public projection source contract", () => {
  it("always constrains the public list and bounds its scan", () => {
    const db = read("src/lib/auction/db.ts");
    const list = db.slice(
      db.indexOf("export async function listAuctions"),
      db.indexOf("// ── Ownership check"),
    );

    expect(list).toContain("a.status IN ('scheduled', 'live', 'ended', 'paid')");
    expect(list).toContain("a.approval_status = 'approved'");
    expect(list).toContain("seller_trust.is_suspended");
    expect(list).toContain("Math.min(100, Math.max(1");
    expect(list).not.toContain("SELECT *");
  });

  it("keeps every public detail mirror disconnected from full state composers", () => {
    const paths = [
      "src/app/auctions/[id]/page.tsx",
      "src/app/auctions/[id]/read/page.tsx",
      "src/app/api/v1/auctions/[id]/route.ts",
      "src/app/api/v1/universal/auctions/[id]/route.ts",
    ];

    for (const path of paths) {
      const source = read(path);
      expect(source, path).not.toMatch(
        /getAuction\(|loadAuctionState\(|getCardIdentity\(|AuctionDetailClient|loadBidderTiers/,
      );
      expect(source, path).not.toMatch(
        /anonymous_bidder|anonymous_winner|trust_score|estimated_seller_payout|estimated_commission/,
      );
    }
  });
});
