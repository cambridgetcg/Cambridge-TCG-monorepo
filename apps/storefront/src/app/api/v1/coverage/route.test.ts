import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import { GET } from "./route";

vi.mock("@/lib/wholesale/client", () => ({
  fetchAggregatorCoverage: vi.fn(),
}));

const mockFetchCoverage = vi.mocked(fetchAggregatorCoverage);

beforeEach(() => {
  mockFetchCoverage.mockReset();
});

describe("GET /api/v1/coverage", () => {
  it("rejects an impossible calendar date before reading the database", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/coverage?since=2026-02-30"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(mockFetchCoverage).not.toHaveBeenCalled();
  });

  it("rejects unbounded or free-form source and game filters", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/coverage?source=cardrush%20OR%20TRUE"),
    );

    expect(response.status).toBe(400);
    expect(mockFetchCoverage).not.toHaveBeenCalled();
  });

  it("normalizes empty filters instead of claiming they were applied", async () => {
    mockFetchCoverage.mockResolvedValueOnce(null);
    const response = await GET(
      new Request("https://example.test/api/v1/coverage?source=&game=&since="),
    );

    expect(response.status).toBe(503);
    expect(mockFetchCoverage).toHaveBeenCalledWith({
      source: undefined,
      game: undefined,
      since: undefined,
    });
  });
});
