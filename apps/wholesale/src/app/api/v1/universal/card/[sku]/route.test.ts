import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/db/schema", () => ({
  cards: new Proxy({}, {
    get: (_target, key) => `cards.${String(key)}`,
  }),
  games: new Proxy({}, {
    get: (_target, key) => `games.${String(key)}`,
  }),
  sets: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "equals") }));
vi.mock("@/lib/source-publication-policy", () => ({
  INTERNAL_ONLY_CACHE_CONTROL: "private, no-store",
  WHOLESALE_STORAGE_PUBLICATION_POLICY: {
    publish: true,
    license: "internal-only",
    redistribute: false,
  },
  priceSourcePublicationPolicy: () => ({
    publish: true,
    license: "internal-only",
    redistribute: false,
  }),
}));
vi.mock("../../../auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ id: "test-key" })),
}));

import { GET } from "./route";

function currentCardRows(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(async () => rows),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

describe("GET /api/v1/universal/card/[sku] publication boundary", () => {
  beforeEach(() => mocks.select.mockReset());

  it("uses policy rights for the current price and disables shared caching", async () => {
    mocks.select
      .mockReturnValueOnce(currentCardRows([{
        id: 7,
        sku: "test-sku",
        cardNumber: "001",
        name: "Test Card",
        nameEn: "Test Card",
        nameTranslations: null,
        price: "12.34",
        baseGbp: "10.00",
        cardrushJpy: 2500,
        gbpJpyRate: 200,
        stock: 1,
        rarity: null,
        category: "singles",
        setCode: "TST",
        setName: "Test Set",
        setId: 1,
        gameId: 1,
        gameCode: "op",
        imageUrl: null,
        artDescription: null,
        lastSyncedAt: new Date("2026-07-11T00:00:00Z"),
      }]))
      .mockReturnValueOnce({
        from: vi.fn(async () => [{ p: "10.00" }]),
      });

    const response = await GET(
      new NextRequest("https://wholesale.example/api/v1/universal/card/test-sku"),
      { params: Promise.resolve({ sku: "test-sku" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body["@source_license"]).toEqual(["internal-only", "internal-only"]);
    expect(body.price).toMatchObject({
      source: "cardrush",
      source_license: "internal-only",
      source_redistribute: false,
    });
  });
});
