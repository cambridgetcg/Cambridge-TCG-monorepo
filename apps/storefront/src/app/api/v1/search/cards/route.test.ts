import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchPrices: vi.fn(),
  fetchGames: vi.fn(),
  fetchSets: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/wholesale/client", () => mocks);

import { GET } from "./route";

describe("card search membership boundary", () => {
  it("returns a non-enumerable gap without reading caller filters", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      searched: false,
      catalog_membership_included: false,
      matches: [],
      matches_complete: false,
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
    expect(mocks.fetchGames).not.toHaveBeenCalled();
    expect(mocks.fetchSets).not.toHaveBeenCalled();
  });
});
