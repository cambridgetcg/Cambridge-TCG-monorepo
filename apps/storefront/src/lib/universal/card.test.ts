import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { buildUniversalCard, resolveContentHash } from "./card";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  mockQuery.mockReset();
  // Default for any unspecified read (e.g. buildUniversalCard's getEnCardData
  // official-image lookup): no EN image → withheld, as before. The specific
  // fetchCardRow mockResolvedValueOnce below still takes precedence in order.
  mockQuery.mockResolvedValue({ rows: [] } as never);
});

describe("universal card legacy snapshot boundary", () => {
  it("does not read or project stored card, set-cover, or price snapshots", async () => {
    const storedRow = {
      set_code: "OP01",
      card_number: "OP01-001",
      sku: "op-op01-001-en",
      card_name: "Leader",
      name_en: "Leader",
      name_translations: null,
      rarity: "L",
      variant: "",
      game: "one-piece",
      set_name: "Romance Dawn",
      released_at: new Date("2022-12-02T00:00:00Z"),
      total_cards: 121,
      image_url: "https://legacy-upstream.example/card.jpg",
      cover_image_url: "https://legacy-upstream.example/set.jpg",
      spot_gbp: "9876.54",
      captured_on: new Date("2026-07-01T00:00:00Z"),
    };
    mockQuery.mockResolvedValueOnce({ rows: [storedRow], rowCount: 1 } as never);

    const result = await buildUniversalCard(
      "op-op01-001-en",
      "saturated",
    );
    const document = result?.document as Record<string, unknown>;
    const neighbours = document.neighbours as {
      set: { cover_image_url: string | null };
    };
    const serialized = JSON.stringify(document);

    expect(document.image_url).toBeNull();
    expect(document.price).toBeNull();
    expect(document["@content_hash_contract"]).toMatchObject({
      price_input: null,
      capture_date_input: null,
      changed_on: "2026-07-12",
    });
    expect(neighbours.set.cover_image_url).toBeNull();
    expect(serialized).not.toContain("legacy-upstream.example");
    expect(serialized).not.toContain("9876.54");
    expect(serialized).not.toContain("2026-07-01");

    const select = String(mockQuery.mock.calls[0]?.[0]);
    expect(select).not.toContain("image_url");
    expect(select).not.toContain("cover_image_url");
    expect(select).not.toContain("spot_gbp");
    expect(select).not.toContain("card_price_history");

    mockQuery.mockResolvedValueOnce({
      rows: [{
        ...storedRow,
        spot_gbp: "123456.78",
        captured_on: new Date("2099-01-01T00:00:00Z"),
      }],
      rowCount: 1,
    } as never);

    await expect(resolveContentHash(result!.contentHash)).resolves.toEqual({
      sku: "op-op01-001-en",
      matched: true,
    });
  });
});
