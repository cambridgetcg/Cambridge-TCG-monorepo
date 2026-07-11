import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPrices } from "@/lib/wholesale/client";
import { POST } from "./route";

vi.mock("@/lib/wholesale/client", () => ({ fetchPrices: vi.fn() }));

const mockFetchPrices = vi.mocked(fetchPrices);

beforeEach(() => {
  mockFetchPrices.mockReset();
});

describe("POST /api/decks/import rights boundary", () => {
  it("marks resolved catalog fields proprietary and the aggregate NOASSERTION", async () => {
    mockFetchPrices.mockResolvedValueOnce({
      count: 1,
      total: 1,
      channel: "cambridgetcg",
      source: "wholesale-db",
      items: [
        {
          sku: "op-op01-001-en",
          card_number: "OP01-001",
          price_gbp: 1,
          stock: 0,
          pending_stock: 0,
          image_url: "https://upstream.example/card.jpg",
          name: "Upstream card name",
          name_en: "Upstream card name",
          set_code: "OP01",
          set_name: "Romance Dawn",
          rarity: "L",
          category: "singles",
          updated_at: "2026-07-11T00:00:00Z",
        },
      ],
    });

    const response = await POST(
      new Request("https://cambridgetcg.example/api/decks/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "1x OP01-001 Upstream card name" }),
      }),
    );
    const body = await response.json();

    expect(body.data.leader.name).toBe("Upstream card name");
    expect(body._meta.sources).toEqual(["wholesale-rds.cards"]);
    expect(body._meta.source_license).toEqual(["proprietary"]);
    expect(body._meta.license).toBe("NOASSERTION");
  });
});
