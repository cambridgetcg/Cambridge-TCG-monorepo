import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({
    rows: [{
      set_code: "OP01",
      card_number: "OP01-001",
      sku: "op-op01-001-en",
      card_name: "Leader",
      rarity: "L",
      variant: "",
      game: "one-piece",
      set_name: "Romance Dawn",
      released_at: new Date("2022-12-02T00:00:00Z"),
      total_cards: 121,
      image_url: "https://legacy-upstream.example/card.jpg",
      cover_image_url: "https://legacy-upstream.example/set.jpg",
      spot_gbp: "9876.54",
    }],
    rowCount: 1,
  } as never);
});

describe("dated card compatibility boundary", () => {
  it("uses current structure without reading or claiming historical media or prices", async () => {
    const response = await GET(
      new Request("https://cambridgetcg.example/api/at/2026-03-15/card/op-op01-001-en") as never,
      { params: Promise.resolve({ date: "2026-03-15", sku: "op-op01-001-en" }) },
    );
    const body = await response.json();
    const select = String(mockQuery.mock.calls[0]?.[0]);
    const serialized = JSON.stringify(body);

    expect(body.price).toBeNull();
    expect(body.image_url).toBeNull();
    expect(body.as_of_scope).toMatchObject({
      requested_date_only: true,
      historical_price_reconstruction: false,
      historical_structure_reconstruction: false,
      structural_fields_source: "current_catalog",
    });
    expect(body["@content_hash_contract"]).toMatchObject({
      price_input: null,
      capture_date_input: null,
      requested_date_affects_hash: false,
    });
    expect(select).not.toContain("image_url");
    expect(select).not.toContain("cover_image_url");
    expect(select).not.toContain("price");
    expect(select).not.toContain("card_price_history");
    expect(serialized).not.toContain("legacy-upstream.example");
    expect(serialized).not.toContain("9876.54");
  });
});
