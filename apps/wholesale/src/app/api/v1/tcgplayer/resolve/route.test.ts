import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ id: "test-key" })),
}));

import { GET } from "./route";

describe("GET /api/v1/tcgplayer/resolve", () => {
  it("does not publish stored upstream identifier mappings", async () => {
    const response = await GET(
      new NextRequest("https://wholesale.example/api/v1/tcgplayer/resolve?product_id=123"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.resolved).toBeNull();
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
  });
});
