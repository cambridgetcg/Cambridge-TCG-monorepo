import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/v1/federation/identify/by-upstream", () => {
  it("keeps TCGplayer identifier mappings blocked", async () => {
    const response = await GET(
      new NextRequest(
        "https://cambridgetcg.example/api/v1/federation/identify/by-upstream?source=tcgplayer&product_id=123",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.resolved).toBeNull();
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
  });
});
