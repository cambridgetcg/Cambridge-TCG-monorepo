import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/gaps rights", () => {
  it("carries the corpus's explicit CC0 dedication through the envelope", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/gaps") as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._meta.sources).toEqual([
      "cambridge-tcg.known-gaps-registry",
    ]);
    expect(body._meta.source_license).toEqual(["cc0"]);
    expect(body._meta.license).toBe("CC0-1.0");
  });
});
