import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import structuredData from "../data.json";
import { GET } from "./route";

function get(asset: string) {
  return GET(
    new Request(`https://preview.example/methodology/prism-signals/${asset}`),
    { params: Promise.resolve({ asset }) },
  );
}

describe("PRISM methodology sidecar routes", () => {
  it("serves the checked-in Markdown summary byte for byte", async () => {
    const response = await get("summary.md");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(await response.text()).toBe(
      readFileSync(new URL("../summary.md", import.meta.url), "utf8"),
    );
  });

  it("serves the checked-in structured sidecar", async () => {
    const response = await get("data.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual(structuredData);
  });

  it("does not turn the dynamic sidecar segment into an arbitrary file reader", async () => {
    const response = await get("secrets.txt");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
