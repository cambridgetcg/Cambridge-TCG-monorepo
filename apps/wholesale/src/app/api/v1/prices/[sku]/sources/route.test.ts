import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("../../../auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ id: "test-key" })),
}));

import { GET } from "./route";

describe("GET /api/v1/prices/[sku]/sources publication boundary", () => {
  it("returns policy status without reading stored price rows", async () => {
    const response = await GET(new NextRequest("https://wholesale.example/api/v1/prices/test-sku/sources"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.prices).toEqual([]);
    expect(body.count).toBe(0);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
