import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("../../../../../auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ id: "test-key" })),
}));

import { GET } from "./route";

describe("GET /api/v1/universal/card/[sku]/at/[date] publication boundary", () => {
  it("returns policy status without reading the temporal archive", async () => {
    const response = await GET(
      new NextRequest("https://wholesale.example/api/v1/universal/card/test-sku/at/2026-07-11"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.price).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
