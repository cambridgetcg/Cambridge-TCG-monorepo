import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/cards/[sku]/tcgplayer-history", () => {
  it("returns an explicit rights block without consulting auth or an upstream", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(body.error.details).toMatchObject({
      source: "tcgplayer",
      state: "blocked-by-upstream-terms",
    });
    expect(body._meta.endpoint).toBe(
      "/api/v1/cards/[sku]/tcgplayer-history",
    );
  });
});
