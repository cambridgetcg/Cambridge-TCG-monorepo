import { describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));

import { GET } from "./route";

describe("catalog JSONL publication boundary", () => {
  it("fails closed without querying or emitting membership", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    expect(body).toMatchObject({
      publication_status: "withheld-untraced-lineage",
      record_license: "NOASSERTION",
      export_available: false,
      rows_emitted: 0,
    });
    expect(query).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(/sha256:|"sku"|count_expected/);
  });
});
