import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /schemas/collector-events/v1/[...path]", () => {
  it("makes each canonical schema id dereferenceable", async () => {
    const response = await GET(
      new Request("https://example.test/schemas/collector-events/v1/event.json"),
      { params: Promise.resolve({ path: ["event.json"] }) },
    );
    const schema = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/schema+json",
    );
    expect(response.headers.get("x-content-license")).toBe("CC0-1.0");
    expect(schema.$id).toBe(
      "https://cambridgetcg.com/schemas/collector-events/v1/event.json",
    );
  });

  it("returns 404 for nested or unknown schema paths", async () => {
    const unknown = await GET(
      new Request("https://example.test/schemas/collector-events/v1/missing.json"),
      { params: Promise.resolve({ path: ["missing.json"] }) },
    );
    expect(unknown.status).toBe(404);

    const nested = await GET(
      new Request("https://example.test/schemas/collector-events/v1/event.json/extra"),
      { params: Promise.resolve({ path: ["event.json", "extra"] }) },
    );
    expect(nested.status).toBe(404);
  });
});
