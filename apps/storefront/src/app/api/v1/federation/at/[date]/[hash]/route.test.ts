import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const row = {
  set_code: "OP01",
  card_number: "OP01-001",
  sku: "op-op01-001-en",
  variant: "",
  game: "one-piece",
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalize(object[key])}`
  ).join(",")}}`;
}

const hash = `sha256:${createHash("sha256").update(canonicalize({
  sku: row.sku,
  card_number: row.card_number,
  set_code: row.set_code,
  game: row.game,
  variant: row.variant,
  magnitude_gbp: null,
  captured_on: null,
})).digest("hex")}`;

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 } as never);
});

describe("dated federation compatibility boundary", () => {
  it("keeps the requested date and stored price fields out of the hash", async () => {
    const response = await GET(
      new Request(`https://cambridgetcg.example/api/v1/federation/at/2026-03-15/${hash}`) as never,
      { params: Promise.resolve({ date: "2026-03-15", hash }) },
    );
    const body = await response.json();
    const select = String(mockQuery.mock.calls[0]?.[0]);

    expect(body.matched).toBe(true);
    expect(body.hash_contract).toMatchObject({
      price_input: null,
      capture_date_input: null,
      requested_date_affects_hash: false,
      historical_reconstruction: false,
    });
    expect(select).not.toContain("price");
    expect(select).not.toContain("captured_on");
    expect(select).not.toContain("card_price_history");
  });
});
