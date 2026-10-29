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

  // Permission exists since 2026-10-28; the door stays closed because raw
  // TCGplayer prices are display-only, and it says so.
  it("says raw TCGplayer prices are display-only, not that permission is missing", async () => {
    const body = await (await GET()).json();
    expect(body.error.message).toContain("display-only");
    expect(body.error.message).toContain("never served through an API, a download or in bulk");
    expect(JSON.stringify(body)).not.toMatch(/no recorded API approval|without prior written consent|Written approval explicitly covers/);
    expect(Object.keys(body.error.details)).toEqual(["source", "state", "reopen_when"]);
  });
});
