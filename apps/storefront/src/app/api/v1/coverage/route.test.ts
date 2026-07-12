import { describe, expect, it, vi } from "vitest";

const { fetchAggregatorCoverage } = vi.hoisted(() => ({ fetchAggregatorCoverage: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ fetchAggregatorCoverage }));

import { GET } from "./route";

describe("GET /api/v1/coverage", () => {
  it("withholds observed aggregates without querying", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.queried).toBe(false);
    expect(body.observed_aggregates_included).toBe(false);
    expect(body.summary).toBeNull();
    expect(fetchAggregatorCoverage).not.toHaveBeenCalled();
  });
});
