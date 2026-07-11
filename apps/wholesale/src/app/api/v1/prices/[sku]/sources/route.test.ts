import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/db/schema", () => ({
  cards: { id: "cards.id", sku: "cards.sku" },
  priceArchive: new Proxy({}, {
    get: (_target, key) => `price_archive.${String(key)}`,
  }),
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "where"),
  desc: vi.fn(() => "descending"),
  eq: vi.fn(() => "equals"),
  inArray: vi.fn(() => "in-array"),
  sql: {},
}));
vi.mock("@/lib/source-publication-policy", () => ({
  INTERNAL_ONLY_CACHE_CONTROL: "private, no-store",
  PUBLISHABLE_PRICE_SOURCES: ["cardrush"],
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

function limitedRows(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(async () => rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function orderedRows(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(async () => rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

describe("GET /api/v1/prices/[sku]/sources publication boundary", () => {
  beforeEach(() => mocks.select.mockReset());

  it("ignores sourceRedistribute=true and never shares the authenticated response", async () => {
    mocks.select
      .mockReturnValueOnce(limitedRows([{ id: 7 }]))
      .mockReturnValueOnce(orderedRows([{
        source: "cardrush",
        sourceUrl: "https://example.test/card",
        sourceCurrency: "JPY",
        sourceRedistribute: true,
        ingestRunId: 11,
        snapshotDate: "2026-07-11",
        price: "12.34",
        baseGbp: "10.00",
        cardrushJpy: 2500,
        gbpJpyRate: 200,
        errorReason: null,
      }]));

    const response = await GET(
      new NextRequest(
        "https://wholesale.example/api/v1/prices/test-sku/sources?date=2026-07-11",
      ),
      { params: Promise.resolve({ sku: "test-sku" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.prices).toHaveLength(1);
    expect(body.prices[0]).toMatchObject({
      source: "cardrush",
      source_license_tier: "internal-only",
      source_redistribute: false,
    });
  });
});
