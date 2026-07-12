import { describe, expect, it, vi } from "vitest";
import { fetchCardrushHistory, fetchTcgplayerHistory } from "@/lib/wholesale/client";
import { GET as getCardrushHistory } from "./cardrush-history/route";
import { GET as getTcgplayerHistory } from "./tcgplayer-history/route";

vi.mock("@/lib/wholesale/client", () => ({
  fetchCardrushHistory: vi.fn(),
  fetchTcgplayerHistory: vi.fn(),
}));

describe("public card-history source-rights gaps", () => {
  it.each([
    ["cardrush", getCardrushHistory, fetchCardrushHistory],
    ["tcgplayer", getTcgplayerHistory, fetchTcgplayerHistory],
  ] as const)("returns a value-free %s gap without reading the tape", async (source, handler, reader) => {
    const response = await handler(
      new Request(`https://example.test/api/v1/cards/test/${source}-history`),
      { params: Promise.resolve({ sku: "op-op01-001-ja" }) },
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      sku: "op-op01-001-ja",
      source,
      status: "withheld-by-source-rights",
      exact_values_included: false,
      aggregates_included: false,
    });
    expect(body._meta.sources).toEqual([source]);
    expect(body._meta.source_license).toEqual(["internal-only"]);
    expect(serialized).not.toContain("partner-redistributable");
    expect(serialized).not.toContain("source_url");
    expect(serialized).not.toContain("price_gbp");
    expect(serialized).not.toContain("base_gbp");
    expect(vi.mocked(reader)).not.toHaveBeenCalled();
  });
});
