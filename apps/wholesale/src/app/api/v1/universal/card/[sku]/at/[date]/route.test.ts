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
  priceArchive: new Proxy({}, {
    get: (_target, key) => `price_archive.${String(key)}`,
  }),
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "where"),
  eq: vi.fn(() => "equals"),
  inArray: vi.fn(() => "in-array"),
}));
vi.mock("@/lib/source-publication-policy", () => ({
  INTERNAL_ONLY_CACHE_CONTROL: "private, no-store",
  PUBLISHABLE_PRICE_SOURCES: ["cardrush"],
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
vi.mock("../../../../../auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ id: "test-key" })),
}));

import { GET } from "./route";

function limitedRows(rows: unknown[], withJoin = false) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(async () => rows),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  if (!withJoin) chain.leftJoin.mockImplementation(() => chain);
  return chain;
}

describe("GET /api/v1/universal/card/[sku]/at/[date] publication boundary", () => {
  beforeEach(() => mocks.select.mockReset());

  it("cannot turn sourceRedistribute=true into an open temporal response", async () => {
    mocks.select
      .mockReturnValueOnce(limitedRows([{
        id: 7,
        sku: "test-sku",
        cardNumber: "001",
        name: "Test Card",
        nameEn: "Test Card",
        nameTranslations: null,
        rarity: null,
        category: "singles",
        setCode: "TST",
        setName: "Test Set",
        gameCode: "op",
        artDescription: null,
      }], true))
      .mockReturnValueOnce(limitedRows([{
        snapshotDate: "2026-07-11",
        cardrushJpy: 2500,
        gbpJpyRate: 200,
        baseGbp: "10.00",
        price: "12.34",
        source: "cardrush",
        sourceRedistribute: true,
        sourceUrl: "https://example.test/card",
        ingestRunId: 11,
      }]));

    const response = await GET(
      new NextRequest(
        "https://wholesale.example/api/v1/universal/card/test-sku/at/2026-07-11",
      ),
      { params: Promise.resolve({ sku: "test-sku", date: "2026-07-11" }) },
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
