import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPriceSources, PRICE_SOURCES_WITHHELD_STATUS } from "../client";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetchPriceSources", () => {
  // Wholesale answers 503 with this status while no source is cleared for
  // publication. Logged as an error, it filled production logs on every
  // card composition (about 1,500 lines in 12h on 2026-11-06).
  it("returns the withheld state for the publication policy answer, without logging an error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue(json(503, {
      ok: false,
      status: PRICE_SOURCES_WITHHELD_STATUS,
      prices: [],
      count: 0,
      agreement: null,
      note: "No stored source row is currently cleared for publication.",
    }));

    await expect(fetchPriceSources({ sku: "op-op01-001-ja" })).resolves.toEqual({
      withheld: true,
      note: "No stored source row is currently cleared for publication.",
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("still treats any other 503 as an error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue(json(503, { error: "unavailable" }));

    await expect(fetchPriceSources({ sku: "op-op01-001-ja" })).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith("[wholesale] price-sources error", 503);
  });
});
