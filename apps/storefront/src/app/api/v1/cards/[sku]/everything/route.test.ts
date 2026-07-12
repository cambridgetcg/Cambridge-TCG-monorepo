import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchCard: vi.fn(),
  fetchPrices: vi.fn(),
  fetchPriceSources: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/wholesale/client", () => mocks);

import { GET } from "./route";

describe("card everything membership boundary", () => {
  it("echoes only the caller token and performs no membership lookup", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ sku: "caller-sku-token" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      requested_sku: "caller-sku-token",
      token_origin: "caller-supplied",
      catalog_membership_asserted: false,
      composed: false,
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetchCard).not.toHaveBeenCalled();
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
    expect(mocks.fetchPriceSources).not.toHaveBeenCalled();
  });
});
