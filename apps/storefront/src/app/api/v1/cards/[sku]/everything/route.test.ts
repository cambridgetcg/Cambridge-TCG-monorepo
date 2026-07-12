import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  fetchCard,
  fetchGames,
  fetchPrices,
  fetchPriceSources,
  fetchSets,
} from "@/lib/wholesale/client";
import { GET } from "./route";

vi.mock("@/lib/wholesale/client", () => ({
  fetchCard: vi.fn(),
  fetchGames: vi.fn(),
  fetchPrices: vi.fn(),
  fetchPriceSources: vi.fn(),
  fetchSets: vi.fn(),
}));

const mockFetchCard = vi.mocked(fetchCard);
const mockFetchGames = vi.mocked(fetchGames);
const mockFetchPrices = vi.mocked(fetchPrices);
const mockFetchPriceSources = vi.mocked(fetchPriceSources);
const mockFetchSets = vi.mocked(fetchSets);

beforeEach(() => {
  vi.resetAllMocks();

  mockFetchCard.mockResolvedValue({
    sku: "op-op01-001-ja",
    card_number: "001",
    price_gbp: 12.34,
    stock: 0,
    pending_stock: 0,
    image_url: null,
    name: "Monkey D. Luffy",
    name_en: "Monkey D. Luffy",
    set_code: "OP01",
    set_name: "Romance Dawn",
    rarity: "Leader",
    category: "singles",
    updated_at: "2026-07-11T00:00:00.000Z",
    name_translations: null,
  });
  mockFetchGames.mockResolvedValue([]);
  mockFetchSets.mockResolvedValue([]);
  mockFetchPrices.mockResolvedValue({
    count: 0,
    total: 0,
    channel: "cambridgetcg",
    items: [],
    source: "wholesale-api",
  });
});

describe("GET /api/v1/cards/[sku]/everything", () => {
  it("withholds the complete nonredistributable CardRush row from anonymous output", async () => {
    mockFetchPriceSources.mockResolvedValue({
      sku: "op-op01-001-ja",
      snapshot_date: "2026-07-11",
      card_id: 1,
      count: 1,
      prices: [
        {
          source: "cardrush",
          source_url: "https://cardrush.example/card/1",
          source_currency: "JPY",
          source_redistribute: false,
          source_license_tier: "internal-only",
          ingest_run_id: 7,
          snapshot_date: "2026-07-11",
          price_gbp: 9.99,
          base_gbp: 6.17,
          cardrush_jpy: 1234,
          gbp_jpy_rate: 200,
          error_reason: null,
        },
      ],
      agreement: {
        distinct_source_count: 1,
        min_gbp: 9.99,
        max_gbp: 9.99,
        spread_gbp: 0,
        coefficient_of_variation: null,
      },
      note: "Single reviewed source today.",
      retrieved_at: "2026-07-11T00:00:00.000Z",
    });

    const response = await GET(
      new NextRequest(
        "https://cambridgetcg.example/api/v1/cards/op-op01-001-ja/everything",
      ),
      { params: Promise.resolve({ sku: "op-op01-001-ja" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.prices_today.rows).toEqual([]);
    expect(body.data.prices_today.agreement).toBeNull();
    expect(body.data.prices_today.note).toContain("source rows were withheld");
    expect(JSON.stringify(body.data.prices_today)).not.toMatch(
      /cardrush_jpy|base_gbp|gbp_jpy_rate|source_url/,
    );
    expect(body.data.history).toEqual([]);
    expect(body.data.composition.falcon_calls.cardrush_history).toBe("blocked");
    expect(body.data.card.image_url).toBeNull();
    expect(body.data.reference_price.reference_price_gbp).toBeNull();
    expect(body._meta.sources).toEqual(["wholesale-rds.cards"]);
    expect(body._meta.source_license).toEqual(["proprietary"]);
    expect(JSON.stringify(body)).not.toContain("12.34");
  });

  it("still withholds CardRush when a stored row is falsely marked CC0", async () => {
    mockFetchPriceSources.mockResolvedValue({
      sku: "op-op01-001-ja",
      snapshot_date: "2026-07-11",
      card_id: 1,
      count: 1,
      prices: [
        {
          source: "cardrush",
          source_url: "https://cardrush.example/card/1",
          source_currency: "JPY",
          source_redistribute: true,
          source_license_tier: "cc0",
          ingest_run_id: 7,
          snapshot_date: "2026-07-11",
          price_gbp: 9.99,
          base_gbp: 6.17,
          cardrush_jpy: 1234,
          gbp_jpy_rate: 200,
          error_reason: null,
        },
      ],
      agreement: {
        distinct_source_count: 1,
        min_gbp: 9.99,
        max_gbp: 9.99,
        spread_gbp: 0,
        coefficient_of_variation: null,
      },
      note: "Mistagged stored row.",
      retrieved_at: "2026-07-11T00:00:00.000Z",
    });

    const response = await GET(
      new NextRequest(
        "https://cambridgetcg.example/api/v1/cards/op-op01-001-ja/everything",
      ),
      { params: Promise.resolve({ sku: "op-op01-001-ja" }) },
    );
    const body = await response.json();

    expect(body.data.prices_today.rows).toEqual([]);
    expect(body.data.prices_today.agreement).toBeNull();
    expect(JSON.stringify(body.data.prices_today)).not.toMatch(
      /cardrush_jpy|base_gbp|gbp_jpy_rate|source_url|1234/,
    );
    expect(body.data.reference_price.reference_price_gbp).toBeNull();
    expect(body._meta.source_license).toEqual(["proprietary"]);
  });
});
