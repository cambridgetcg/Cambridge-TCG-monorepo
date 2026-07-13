import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMovers } from "../client";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("WHOLESALE_API_URL", "https://example.test");
  vi.stubEnv("WHOLESALE_API_KEY", "test-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("fetchMovers", () => {
  it("fails closed without making a wholesale request", async () => {
    const response = await fetchMovers({
      game: "op",
      window: "7d",
      min_price: 10,
      limit: 50,
    });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
    expect(response.source_license).toBe("internal-only");
    expect(response.publication_status).toBe("blocked");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
