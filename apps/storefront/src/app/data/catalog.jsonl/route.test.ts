import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /data/catalog.jsonl rights boundary", () => {
  it("returns policy status without catalog rows", async () => {
    const response = await GET();
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    expect(response.headers.get("Retry-After")).toBe("86400");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      "@kind": "catalog_manifest",
      publication_status: "paused_pending_field_level_rights",
      count_expected: 0,
      license: "NOASSERTION",
    });
    expect(lines[1]).toMatchObject({
      "@kind": "catalog_footer",
      publication_status: "paused_pending_field_level_rights",
      count_emitted: 0,
      complete: false,
      catalog_complete: false,
    });
  });

  it("does not read storage or retain a dormant card-row emitter", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/data/catalog.jsonl/route.ts"), "utf8");

    expect(source).not.toContain('from "@/lib/db"');
    expect(source).not.toContain("card_price_history");
    expect(source).not.toContain("spot_gbp");
    expect(source).not.toContain('"@kind": "card"');
  });
});
