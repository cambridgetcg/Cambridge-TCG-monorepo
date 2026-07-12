import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ id: "test-key" })),
}));

import { GET } from "./route";

describe("GET /api/v1/tcgplayer/history/[sku]", () => {
  it("serves no stored observations while the source is blocked", async () => {
    const response = await GET(
      new NextRequest("https://wholesale.example/api/v1/tcgplayer/history/test-sku"),
      { params: Promise.resolve({ sku: "test-sku" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.source_license).toBe("proprietary");
    expect(body.observations).toEqual([]);
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
  });
});
