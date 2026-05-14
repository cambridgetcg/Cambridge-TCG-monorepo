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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchMovers", () => {
  it("returns the parsed response on success", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        window: "7d",
        window_days: 7,
        window_tolerance_days: 2,
        min_price_floor: 10,
        source: "cardrush",
        source_license: "internal-only",
        channel: "cambridgetcg",
        game_code: "op",
        computed_at: "2026-05-14T12:00:00Z",
        count: 1,
        movers: [
          {
            sku: "OP09-051-P-EN",
            card_number: "OP09-051",
            name: "ルフィ",
            name_en: "Monkey D. Luffy",
            set_code: "OP09",
            set_name: "Emperors",
            rarity: "SR",
            image_url: null,
            category: "singles",
            price_then: 12.4,
            price_now: 18.2,
            channel_price: 24.5,
            pct_change: 46.77,
            then_date: "2026-05-07",
            now_date: "2026-05-14",
          },
        ],
      }),
    );

    const response = await fetchMovers({
      game: "op",
      window: "7d",
      min_price: 10,
      limit: 50,
    });

    expect(response.count).toBe(1);
    expect(response.movers[0].sku).toBe("OP09-051-P-EN");
    expect(response.source_license).toBe("internal-only");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(mockFetch.mock.calls[0][0]);
    expect(calledUrl).toContain("game=op");
    expect(calledUrl).toContain("window=7d");
    expect(calledUrl).toContain("min_price=10");
    expect(calledUrl).toContain("limit=50");
  });

  it("returns empty MoversResponse on !ok", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Game not found: foo" }, 404),
    );

    const response = await fetchMovers({ game: "foo" });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
    expect(response.computed_at).toBeNull();
  });

  it("returns empty MoversResponse on fetch throw (timeout)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("aborted"));

    const response = await fetchMovers({ game: "op" });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
  });

  it("returns empty MoversResponse on JSON parse error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await fetchMovers({ game: "op" });

    expect(response.count).toBe(0);
    expect(response.movers).toEqual([]);
  });
});
