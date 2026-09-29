import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCardState, loadGameState, loadSetState } from "./state";
import { fetchPrices, fetchSetsDetailed } from "@/lib/wholesale/client";

vi.mock("@/lib/wholesale/client", () => ({ fetchPrices: vi.fn(), fetchSetsDetailed: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchSetsDetailed).mockResolvedValue({ source: "wholesale-db", sets: [{
    code: "OP01", name: "Romance Dawn", game_code: "op", card_count: 1, release_date: null,
  }] });
  vi.mocked(fetchPrices).mockResolvedValue({ source: "wholesale-db", count: 1, total: 1, channel: "cambridgetcg", items: [{
    sku: "op-op01-001-en", card_number: "001", name: "Example", name_en: "Example",
    set_code: "OP01", set_name: "Romance Dawn", rarity: "Leader", category: "singles",
    price_gbp: null, channel_price: null, image_url: null, stock: 0, pending_stock: 0,
    updated_at: "2026-09-01T00:00:00.000Z",
  }] });
});

describe("catalog price-guide provenance", () => {
  it.each([
    ["game", () => loadGameState("one-piece")],
    ["set", () => loadSetState("one-piece", "OP01")],
    ["card", () => loadCardState("one-piece", "OP01", "001")],
  ] as const)("%s names only the contributing catalog source and preserves observation time", async (_kind, read) => {
    const result = await read();
    expect(result).toMatchObject({ _provenance: {
      sources: ["wholesale-rds.cards"], source_license: ["proprietary"],
      as_of: "2026-09-01T00:00:00.000Z", freshness: "catalog",
    } });
    expect(JSON.stringify(result)).not.toContain("cambridgetcg-marketplace");
  });
  it("keeps withheld values null and outage distinct from absence", async () => {
    const result = await loadCardState("one-piece", "OP01", "001");
    expect(result).toMatchObject({ card: { price_gbp: null, image_url: null } });
    vi.mocked(fetchPrices).mockResolvedValue({ source: "unavailable", count: 0, total: 0, channel: "", items: [] });
    expect(await loadCardState("one-piece", "OP01", "001")).toBe("unavailable");
  });
});
