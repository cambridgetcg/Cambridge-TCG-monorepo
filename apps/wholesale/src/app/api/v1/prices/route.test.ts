import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/prices", () => {
  it("returns status only with zero catalog rows", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toMatchObject({
      publication_status: "blocked",
      total: 0,
      count: 0,
      items: [],
    });
  });
});
