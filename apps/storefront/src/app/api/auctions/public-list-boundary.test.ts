import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  listAuctions: vi.fn(),
  createAuction: vi.fn(),
  isAdmin: vi.fn(),
  resolveCatalogCard: vi.fn(),
}));

vi.mock("@/lib/auction/db", () => ({
  listAuctions: mocks.listAuctions,
  createAuction: mocks.createAuction,
}));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/market/db", () => ({
  resolveCatalogCard: mocks.resolveCatalogCard,
}));

import { GET } from "./route";

describe("public auction list input boundary", () => {
  beforeEach(() => {
    mocks.listAuctions.mockReset();
    mocks.listAuctions.mockResolvedValue({ auctions: [], total: 0 });
  });

  it.each([
    ["?status=made-up&limit=-900&offset=-4", 1, 0],
    ["?limit=999999&offset=999999", 100, 10_000],
    ["?limit=not-a-number&offset=not-a-number", 20, 0],
  ] as const)("clamps %s before querying", async (search, limit, offset) => {
    const response = await GET(
      new NextRequest(`https://example.test/api/auctions${search}`),
    );

    expect(response.status).toBe(200);
    expect(mocks.listAuctions).toHaveBeenCalledWith(
      expect.objectContaining({ limit, offset }),
    );
  });
});
