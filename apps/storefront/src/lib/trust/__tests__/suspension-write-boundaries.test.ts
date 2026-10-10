import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function section(body: string, start: string, end: string): string {
  const startAt = body.indexOf(start);
  const endAt = body.indexOf(end, startAt + start.length);
  expect(startAt, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing section end: ${end}`).toBeGreaterThan(startAt);
  return body.slice(startAt, endAt);
}

function expectStandingLockBeforeWrite(body: string, write: string): void {
  const lockAt = body.indexOf("lockTradeStanding(");
  const writeAt = body.indexOf(write);
  expect(lockAt).toBeGreaterThanOrEqual(0);
  expect(writeAt).toBeGreaterThan(lockAt);
}

describe("transactional suspension write boundaries", () => {
  it("locks auction bidder/seller standing before bid or best-offer writes", () => {
    const body = source("src/lib/auction/db.ts");
    const placeBid = section(
      body,
      "export async function placeBid",
      "// ── Bid history",
    );

    expect(placeBid).toContain("auction.seller_user_id");
    expectStandingLockBeforeWrite(placeBid, "INSERT INTO auction_bids");
  });

  it("locks auction offerer/seller standing before accepting a best offer", () => {
    const body = source("src/lib/auction/db.ts");
    const acceptance = section(
      body,
      "export async function acceptOffer",
      "export async function rejectOffer",
    );

    expect(acceptance).toContain("bid.user_id");
    expect(acceptance).toContain("auction.seller_user_id");
    expectStandingLockBeforeWrite(
      acceptance,
      "UPDATE auctions SET status = 'ended'",
    );
  });

  it("locks both swap parties before create, draft-send, and accept writes", () => {
    const body = source("src/lib/swaps/db.ts");
    const create = section(
      body,
      "export async function createSwap",
      "// ── Draft → proposed",
    );
    const propose = section(
      body,
      "export async function proposeDraft",
      "// ── Accept / decline / cancel",
    );
    const accept = section(
      body,
      "export async function acceptSwap",
      "export async function declineSwap",
    );

    expectStandingLockBeforeWrite(create, "INSERT INTO swap_proposals");
    expectStandingLockBeforeWrite(
      propose,
      "UPDATE swap_proposals SET status = 'proposed'",
    );
    expectStandingLockBeforeWrite(
      accept,
      "UPDATE swap_proposals SET status = 'accepted'",
    );
  });

  it("fails market-offer acceptance closed for either missing standing row", () => {
    const body = source("src/lib/market/offers.ts");
    const acceptance = section(
      body,
      "async function createTradeForAcceptedOffer",
      "export async function acceptOffer",
    );

    expect(acceptance).toContain(
      "standing.missingUserIds.includes(offer.seller_id)",
    );
    expect(acceptance).toContain(
      "standing.missingUserIds.includes(offer.buyer_id)",
    );
    expectStandingLockBeforeWrite(acceptance, "INSERT INTO market_trades");
  });
});
