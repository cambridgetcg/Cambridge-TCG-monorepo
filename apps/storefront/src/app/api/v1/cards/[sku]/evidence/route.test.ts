import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCard } from "@/lib/wholesale/client";
import { getUnifiedMarketView } from "@/lib/market/unified";
import { GET } from "./route";

vi.mock("@/lib/wholesale/client", () => ({ fetchCard: vi.fn() }));
vi.mock("@/lib/market/unified", () => ({ getUnifiedMarketView: vi.fn() }));

const mockFetchCard = vi.mocked(fetchCard);
const mockMarket = vi.mocked(getUnifiedMarketView);

beforeEach(() => {
  vi.resetAllMocks();
  mockFetchCard.mockResolvedValue({
    sku: "op-op01-001-ja",
    card_number: "001",
    price_gbp: null,
    channel_price: null,
    stock: 0,
    pending_stock: 0,
    image_url: null,
    name: "Card",
    name_en: "Card",
    set_code: "OP01",
    set_name: "Set",
    rarity: "R",
    category: "singles",
    updated_at: "2026-07-12T00:00:00.000Z",
  });
  mockMarket.mockResolvedValue({
    sku: "op-op01-001-ja",
    card_name: "Card",
    card_number: "001",
    set_code: "OP01",
    set_name: "Set",
    image_url: null,
    rarity: "R",
    reference_price: null,
    bids: [{ price: "8.00", total_quantity: 1, order_count: 1 }],
    asks: [{ price: "13.00", total_quantity: 1, order_count: 1 }],
    trade_aggregates: [],
    trade_publication: {
      status: "paused",
      reason: "No transaction publication receipts.",
      resumeConditions: [],
    },
    best_bid: 8,
    best_ask: 13,
    market_price: 13,
    spread: 5,
    p2p_discount: null,
  });
});

describe("GET /api/v1/cards/[sku]/evidence", () => {
  it("keeps claim classes and restricted fields separate", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ sku: "op-op01-001-ja" }),
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.data.reference).toMatchObject({ is_offer: false, kind: "computed_reference" });
    expect(body.data.market).toMatchObject({ kind: "live_collector_offers", best_ask_gbp: 13 });
    expect(body.data.completed_sales).toMatchObject({
      state: "paused",
      rights: "NOASSERTION",
      source_rights: "internal-only",
      buckets: [],
    });
    expect(body.data.community_observations).toMatchObject({
      state: "paused",
      rights: "NOASSERTION",
      source_rights: "internal-only",
      buckets: [],
    });
    expect(body._meta.license).toBe("NOASSERTION");
    expect(serialized).not.toMatch(/buyer_id|seller_id|evidence_sha256|cardrush_jpy|source_url|median_price|contributor_count/);
  });

  it("rejects a partial SKU before reading", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ sku: "OP01-001" }),
    });
    expect(response.status).toBe(400);
    expect(mockFetchCard).not.toHaveBeenCalled();
  });

  it("has no live person-derived aggregate reader", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/v1/cards/[sku]/evidence/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/getPublicObservationSummary|getSoldCompsForSku|p2p_sold_comps/);
    expect(source).toContain("collector-observation publication policy");
    expect(source).toContain("storefront sold-comps publication policy");
  });
});
