import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

const catalogRow = {
  set_code: "OP01",
  card_number: "OP01-001",
  sku: "OP-OP01-001-JP",
  card_name: "Example card",
  rarity: "L",
  image_url: "https://upstream.example/card.jpg",
  variant: "",
  game: "op",
  set_name: "Romance Dawn",
  spot_gbp: "1.25",
  captured_on: "2026-07-11",
};

async function cardLine(response: Response): Promise<Record<string, unknown>> {
  const lines = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return lines[1] as Record<string, unknown>;
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /data/catalog.jsonl rights boundary", () => {
  it("does not relicense mirrored card fields as CC0", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [catalogRow],
    } as Awaited<ReturnType<typeof query>>);

    const response = await GET();
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const manifest = lines[0] as Record<string, unknown>;
    const card = lines[1] as Record<string, unknown>;

    expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    expect(manifest.license).toBe("NOASSERTION");
    expect(manifest.source_license).toEqual([
      "proprietary",
      "proprietary",
      "proprietary",
    ]);
    expect(card["@source_license"]).toEqual([
      "proprietary",
      "proprietary",
      "proprietary",
    ]);
    expect(JSON.stringify(manifest)).not.toContain("mirror freely");
  });

  it("changes the content hash when an emitted upstream field changes", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [catalogRow] } as Awaited<ReturnType<typeof query>>)
      .mockResolvedValueOnce({
        rows: [{ ...catalogRow, card_name: "Corrected upstream name" }],
      } as Awaited<ReturnType<typeof query>>);

    const before = await cardLine(await GET());
    const after = await cardLine(await GET());

    expect(after.name).toBe("Corrected upstream name");
    expect(after["@content_hash"]).not.toBe(before["@content_hash"]);
  });
});
