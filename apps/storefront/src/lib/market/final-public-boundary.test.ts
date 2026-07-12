import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getCardOrderBook: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/market/db", () => ({ getCardOrderBook: mocks.getCardOrderBook }));

import { GET as getCardBook } from "@/app/api/market/[sku]/route";
import { GET as getPulse } from "@/app/api/market/pulse/route";
import { GET as getLeaderboards } from "@/app/api/leaderboards/route";

describe("remaining public market boundaries", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.getCardOrderBook.mockReset();
  });

  it("pauses per-card API and RSC surfaces before enrichment", async () => {
    const response = await getCardBook(new Request("https://example.test"), {
      params: Promise.resolve({ sku: "caller-sku" }),
    });
    expect(response.status).toBe(503);
    expect(mocks.getCardOrderBook).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();

    for (const path of [
      "src/app/market/[sku]/page.tsx",
      "src/app/product/[sku]/page.tsx",
    ]) {
      const source = readFileSync(`${process.cwd()}/${path}`, "utf8");
      expect(source, path).not.toMatch(
        /resolveCardIdentity|resolveReferencePrice|fetchCard|getUnifiedMarketView|query\(/,
      );
      expect(source, path).toContain("paused");
    }
  });

  it("nulls order-cached imported names and images in pulse and leaderboards", async () => {
    const sentinel = {
      bucket: "hot",
      sku: "first-party-sku",
      card_name: "RESTRICTED NAME",
      image_url: "https://restricted.example/image.jpg",
      n1: 2,
      n2: 1,
      v1: null,
      v2: null,
      trade_count: 2,
      volume: 3,
      avg_price: "4.00",
    };
    mocks.query.mockResolvedValue({ rows: [sentinel] });

    const pulse = await (await getPulse()).json();
    const leaderboard = await (
      await getLeaderboards(new Request("https://example.test/api/leaderboards"))
    ).json();

    expect(pulse.hot[0]).toMatchObject({
      sku: "first-party-sku",
      cardName: null,
      imageUrl: null,
    });
    expect(leaderboard.busiestSkus[0]).toMatchObject({
      sku: "first-party-sku",
      cardName: null,
      imageUrl: null,
    });
    expect(JSON.stringify({ pulse, leaderboard })).not.toContain("RESTRICTED NAME");
    expect(JSON.stringify({ pulse, leaderboard })).not.toContain("restricted.example");
  });

  it("withholds per-SKU cancellation/refund completion rate", () => {
    const state = readFileSync(
      `${process.cwd()}/src/lib/market/card-market.ts`,
      "utf8",
    );
    const page = readFileSync(
      `${process.cwd()}/src/app/cards/[sku]/market/page.tsx`,
      "utf8",
    );
    expect(state).not.toContain("COUNT(*) FILTER (WHERE escrow_status IN ('cancelled','refunded'))");
    expect(state).toContain("completion_rate_90d: null");
    expect(page).not.toContain("Completion (90d)");
  });
});
