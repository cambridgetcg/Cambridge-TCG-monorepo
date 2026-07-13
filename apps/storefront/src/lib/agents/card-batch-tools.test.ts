import { describe, expect, it, vi } from "vitest";
import {
  CardBatchUnavailableError,
  type CardBatchResolution,
  resolveCardBatch,
} from "@/lib/catalog/card-batch";
import { catalogLookupMany } from "./card-batch-tools";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));

const mixedResolution: CardBatchResolution = {
  requested_count: 3,
  unique_requested_count: 3,
  found_count: 1,
  not_in_mirror_count: 1,
  invalid_count: 1,
  ambiguous_count: 0,
  mirror_queried: true,
  results: [
    {
      requested_sku: "op-op01-001-ja",
      status: "found",
      matched_by: "stored_sku",
      card: {
        sku: "op-op01-001-ja",
        canonical_sku: "op-op01-001-ja",
        card_number: "001",
        name: "Monkey D. Luffy",
        name_en: "Monkey D. Luffy",
        name_translations: null,
        set: { code: "OP01", name: "Romance Dawn" },
        game: "op",
        variant: null,
        rarity: "L",
      },
      links: {
        html: "/product/op-op01-001-ja",
        universal: "/api/v1/universal/card/op-op01-001-ja",
        everything: "/api/v1/cards/op-op01-001-ja/everything",
        evidence: "/api/v1/cards/op-op01-001-ja/evidence",
      },
    },
    {
      requested_sku: "op-op01-999-ja",
      canonical_sku: "op-op01-999-ja",
      status: "not_in_storefront_mirror",
      reason: "No matching row is present in the storefront card mirror.",
    },
    {
      requested_sku: "bad",
      status: "invalid_sku",
      reason: "The value is not a recognized Cambridge SKU.",
    },
  ],
};

describe("catalog.lookup_many", () => {
  it("resolves the whole bundle once and preserves per-item truth", async () => {
    const resolver = vi.fn<typeof resolveCardBatch>().mockResolvedValue(mixedResolution);

    const result = await catalogLookupMany(
      {},
      { skus: ["op-op01-001-ja", "op-op01-999-ja", "bad"] },
      resolver,
    );

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith([
      "op-op01-001-ja",
      "op-op01-999-ja",
      "bad",
    ]);
    expect(result.results.map((item) => item.status)).toEqual([
      "found",
      "not_in_storefront_mirror",
      "invalid_sku",
    ]);
    expect(result).toMatchObject({
      "@kind": "card-batch",
      license: "NOASSERTION",
      absence_semantics: expect.stringMatching(/not a global nonexistence claim/),
      does_not_include: expect.arrayContaining([
        expect.stringMatching(/stock/),
        expect.stringMatching(/restricted upstream/),
        expect.stringMatching(/buyer/),
      ]),
    });
    expect(JSON.stringify(result)).not.toMatch(
      /"stock":|"buyer_id":|"seller_id":|"receipt_sha256":|"source_url":|"image_url":|"reference_price":|"cardrush_jpy":/,
    );
  });

  it("rejects malformed or expanded input before resolving", async () => {
    const resolver = vi.fn<typeof resolveCardBatch>();

    await expect(
      catalogLookupMany({}, { skus: ["op-op01-001-ja"], include_stock: true }, resolver),
    ).rejects.toMatchObject({ status: 400 });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("reports a mirror outage without turning it into missing cards", async () => {
    const resolver = vi
      .fn<typeof resolveCardBatch>()
      .mockRejectedValue(new CardBatchUnavailableError(new Error("connection refused")));

    await expect(
      catalogLookupMany({}, { skus: ["op-op01-001-ja"] }, resolver),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/No supplied SKU is being reported as missing/),
    });
  });
});
