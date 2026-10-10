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
  const compose = (sku: string) => GET(
    new NextRequest(`https://cambridgetcg.example/api/v1/cards/${encodeURIComponent(sku)}/everything`),
    { params: Promise.resolve({ sku }) },
  );

  it("rejects malformed and unknown-game identifiers before catalog access", async () => {
    for (const sku of ["unknown-op01-001-ja", "op--001-ja", "op-op01-001-ja-", "tst-set-001-en"]) {
      expect((await compose(sku)).status).toBe(400);
    }
    expect(mockFetchCard).not.toHaveBeenCalled();
    expect(mockFetchPriceSources).not.toHaveBeenCalled();
  });

  it("keeps the storage key and provides a package-normalized identity", async () => {
    const current = await mockFetchCard("op-op01-001-ja");
    mockFetchCard.mockResolvedValue({ ...current!, sku: "OP-OP01-001-JP" });
    const payload = await (await compose("OP-OP01-001-JP")).json();
    expect(payload.data.card).toMatchObject({
      sku: "OP-OP01-001-JP", game: "op", lang: "ja",
      identity: { raw_sku: "OP-OP01-001-JP", canonical_sku: "op-op01-001-ja", scope: "syntax_only" },
    });
  });

  it("excludes another game's matching set and number from siblings", async () => {
    const current = await mockFetchCard("op-op01-001-ja");
    mockFetchPrices.mockResolvedValue({ count: 2, total: 2, channel: "", source: "wholesale-db", items: [
      { ...current!, sku: "op-op01-001-en" },
      { ...current!, sku: "pkm-op01-001-ja" },
    ] });
    const payload = await (await compose("op-op01-001-ja")).json();
    expect(payload.data.siblings.map((row: { sku: string }) => row.sku)).toEqual(["op-op01-001-en"]);
    expect(mockFetchSets).not.toHaveBeenCalled();
  });

  it("recovers one normalized legacy alias without using that candidate as a price join", async () => {
    const current = await mockFetchCard("op-op01-001-ja");
    mockFetchCard.mockImplementation(async (sku) => sku === "OP-OP01-001-JP" ? { ...current!, sku } : null);
    mockFetchPrices.mockResolvedValue({ count: 1, total: 1, channel: "", source: "wholesale-db", items: [{ ...current!, sku: "OP-OP01-001-JP" }] });
    const response = await compose("op-op01-001-ja");
    expect(response.status).toBe(200);
    expect((await response.json()).data.card.sku).toBe("OP-OP01-001-JP");
    expect(mockFetchPriceSources).toHaveBeenLastCalledWith({ sku: "OP-OP01-001-JP" });
  });

  it("refuses ambiguous normalization aliases and inconsistent primary records", async () => {
    const current = await mockFetchCard("op-op01-001-ja");
    mockFetchCard.mockResolvedValue(null);
    mockFetchPrices.mockResolvedValue({ count: 2, total: 2, channel: "", source: "wholesale-db", items: [
      { ...current!, sku: "OP-OP01-001-JP" }, { ...current!, sku: "OP-OP01-001-JA" },
    ] });
    expect((await compose("op-op01-001-ja")).status).toBe(409);
    mockFetchCard.mockResolvedValue({ ...current!, sku: "pkm-op01-001-ja" });
    expect((await compose("op-op01-001-ja")).status).toBe(503);
  });

  it("labels an unavailable sibling source without fabricating siblings", async () => {
    mockFetchPrices.mockResolvedValue({ count: 0, total: 0, channel: "", items: [], source: "unavailable" });
    const payload = await (await compose("op-op01-001-ja")).json();
    expect(payload.data.siblings).toEqual([]);
    expect(payload.data.composition.falcon_calls.siblings).toBe("error");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("withholds invalid anonymous amount %s even with a reusable rights label", async (amount) => {
    mockFetchPriceSources.mockResolvedValue({
      sku: "op-op01-001-ja", snapshot_date: "2026-07-11", card_id: 1, count: 1,
      prices: [{
        source: "reviewed-fixture", source_url: null, source_currency: "GBP",
        source_redistribute: true, source_license_tier: "cc0", ingest_run_id: 1,
        snapshot_date: "2026-07-11", price_gbp: amount, base_gbp: 1,
        cardrush_jpy: null, gbp_jpy_rate: null, error_reason: null,
      }],
      agreement: { distinct_source_count: 1, min_gbp: amount, max_gbp: amount, spread_gbp: 0, coefficient_of_variation: null },
      note: "Test fixture", retrieved_at: "2026-07-11T00:00:00.000Z",
    });
    const data = (await (await compose("op-op01-001-ja")).json()).data;
    expect(data.prices_today.rows).toEqual([]);
    expect(data.prices_today.agreement).toBeNull();
    expect(data.prices_today.note).toContain("malformed");
  });

  it("rejects a price response for a different stored identifier", async () => {
    mockFetchPriceSources.mockResolvedValue({
      sku: "op-op02-001-ja", snapshot_date: "2026-07-11", card_id: 2, count: 0,
      prices: [], agreement: { distinct_source_count: 0, min_gbp: null, max_gbp: null, spread_gbp: null, coefficient_of_variation: null },
      note: "Different card", retrieved_at: "2026-07-11T00:00:00.000Z",
    });
    const data = (await (await compose("op-op01-001-ja")).json()).data;
    expect(data.prices_today.rows).toEqual([]);
    expect(data.prices_today.snapshot_date).toBeNull();
    expect(data.composition.falcon_calls.price_sources).toBe("error");
  });

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
