import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveContentHash } from "@/lib/universal/card";
import { GET } from "./route";

vi.mock("@/lib/universal/card", () => ({ resolveContentHash: vi.fn() }));

const mockResolve = vi.mocked(resolveContentHash);
const hash = `sha256:${"a".repeat(64)}`;

beforeEach(() => {
  mockResolve.mockReset();
});

describe("current federation hash boundary", () => {
  it("declares the structural basis without price-history provenance", async () => {
    mockResolve.mockResolvedValueOnce({
      sku: "op-op01-001-en",
      matched: true,
    });

    const response = await GET(
      new Request(`https://cambridgetcg.example/api/v1/federation/identify/${hash}`) as never,
      { params: Promise.resolve({ hash }) },
    );
    const body = await response.json();

    expect(body["@sources"]).toEqual([
      "storefront-rds.card_set_cards",
      "storefront-rds.card_sets",
    ]);
    expect(body.hash_contract).toMatchObject({
      price_input: null,
      capture_date_input: null,
      changed_on: "2026-07-12",
      legacy_price_dependent_hashes_supported: false,
    });
    expect(JSON.stringify(body)).not.toContain("card_price_history");
    expect(body.note).toContain("Stored prices and capture dates were not read");
  });
});
