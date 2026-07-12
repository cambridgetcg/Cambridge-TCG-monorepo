import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getMarketSummaries: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/market/db", () => ({ getMarketSummaries: mocks.getMarketSummaries }));

import { GET } from "./route";

describe("legacy market browse boundary", () => {
  it("pauses before parsing filters or querying", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.alternative).toBe("/api/market/catalog");
    expect(body.queried).toBe(false);
    expect(mocks.getMarketSummaries).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
