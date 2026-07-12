import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));

import { GET } from "./route";

describe("public market catalog", () => {
  beforeEach(() => query.mockReset());

  it("projects only first-party order-book values and structural SKU fields", async () => {
    query.mockResolvedValue({
      rows: [
        {
          sku: "op-op01-001-en",
          best_bid: "9.00",
          best_ask: "11.00",
          bid_count: 2,
          ask_count: 3,
        },
      ],
    });

    const response = await GET(new Request("https://example.test/api/market/catalog"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("market-orders");
    expect(body.returned_count).toBe(1);
    expect(body.cards[0]).toMatchObject({
      sku: "op-op01-001-en",
      name: "op-op01-001-en",
      set_code: "OP01",
      best_bid: 9,
      best_ask: 11,
      spot_price: null,
      image_url: null,
    });
  });

  it("echoes an exact caller-supplied canonical SKU for a first listing", async () => {
    query.mockResolvedValue({ rows: [] });

    const response = await GET(
      new Request(
        "https://example.test/api/market/catalog?game=one-piece&q=op-op99-001-en",
      ),
    );
    const body = await response.json();

    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({
      sku: "op-op99-001-en",
      catalog_publication: "caller-supplied-structural-sku",
      best_bid: null,
      best_ask: null,
    });
  });
});
