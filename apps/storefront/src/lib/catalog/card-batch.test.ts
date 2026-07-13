import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import {
  CARD_BATCH_MAX_SKUS,
  CardBatchInputError,
  CardBatchUnavailableError,
  parseCardBatchInput,
  resolveCardBatch,
} from "./card-batch";

const legacyRow = {
  sku: "OP-OP01-001-JP",
  card_number: "001",
  card_name: "Monkey D. Luffy",
  name_en: "Monkey D. Luffy",
  name_translations: { ja: "モンキー・D・ルフィ", empty: "" },
  rarity: "L",
  image_url: "https://upstream.example/luffy.jpg",
  variant: "",
  set_code: "OP01",
  set_name: "Romance Dawn",
  game: "op",
  spot_gbp: "12.3400",
  captured_on: "2026-07-12",
};

describe("card batch input", () => {
  it("trims a bounded list while preserving duplicates and order", () => {
    expect(
      parseCardBatchInput({
        skus: [" op-op01-001-ja ", "OP-OP01-001-JP", "op-op01-001-ja"],
      }),
    ).toEqual(["op-op01-001-ja", "OP-OP01-001-JP", "op-op01-001-ja"]);
  });

  it("rejects empty, oversized, non-string, and unknown fields", () => {
    expect(() => parseCardBatchInput({ skus: [] })).toThrow(CardBatchInputError);
    expect(() =>
      parseCardBatchInput({ skus: Array.from({ length: CARD_BATCH_MAX_SKUS + 1 }, () => "x") }),
    ).toThrow(/at most 100/);
    expect(() => parseCardBatchInput({ skus: [7] })).toThrow(/skus\[0\] must be a string/);
    expect(() => parseCardBatchInput({ skus: ["x"], include_stock: true })).toThrow(
      /Unknown request field: include_stock/,
    );
  });
});

describe("resolveCardBatch", () => {
  it("uses one query, preserves request order, duplicates rows, and resolves legacy aliases", async () => {
    const q = vi.fn().mockResolvedValue({ rows: [legacyRow] });

    const result = await resolveCardBatch(
      ["op-op01-999-ja", "op-op01-001-ja", "op-op01-001-ja", "not-a-sku"],
      q,
    );

    expect(q).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      requested_count: 4,
      unique_requested_count: 3,
      found_count: 2,
      not_in_mirror_count: 1,
      invalid_count: 1,
      ambiguous_count: 0,
      mirror_queried: true,
    });
    expect(result.results.map((item) => item.status)).toEqual([
      "not_in_storefront_mirror",
      "found",
      "found",
      "invalid_sku",
    ]);

    const found = result.results[1];
    expect(found).toMatchObject({
      status: "found",
      requested_sku: "op-op01-001-ja",
      matched_by: "canonical_alias",
      card: {
        sku: "OP-OP01-001-JP",
        canonical_sku: "op-op01-001-ja",
        name_translations: { ja: "モンキー・D・ルフィ" },
      },
    });
    expect(JSON.stringify(found)).not.toMatch(
      /stock|cardrush|seller|buyer|image_url|upstream\.example|spot_gbp|reference_price/,
    );

    const [sql, params] = q.mock.calls[0]!;
    expect(sql).toMatch(/WHERE csc\.sku = ANY/);
    expect(sql).not.toMatch(/LOWER\s*\(/);
    expect(params?.[0]).toContain("OP-OP01-001-JP");
  });

  it("does not read the mirror when every supplied value is structurally invalid", async () => {
    const q = vi.fn();
    const result = await resolveCardBatch(["not-a-sku", "still-nope"], q);

    expect(q).not.toHaveBeenCalled();
    expect(result.mirror_queried).toBe(false);
    expect(result.invalid_count).toBe(2);
  });

  it("accepts frozen prefixes that differ from the canonical game code", async () => {
    const q = vi.fn().mockResolvedValue({
      rows: [
        { ...legacyRow, sku: "EB-EB01-001-JP", set_code: "EB01" },
        { ...legacyRow, sku: "PK-SV2A-011-JP-V4K5", set_code: "SV2A", game: "pkm" },
        { ...legacyRow, sku: "FB-FB01-001-JP", set_code: "FB01", game: "dbf" },
      ],
    });

    const result = await resolveCardBatch(
      ["EB-EB01-001-JP", "PK-SV2A-011-JP-V4K5", "FB-FB01-001-JP"],
      q,
    );
    expect(result.results.map((item) => item.status)).toEqual([
      "found",
      "found",
      "found",
    ]);
    expect(result.results.map((item) =>
      item.status === "found" ? item.card.canonical_sku : null,
    )).toEqual([
      "op-eb01-001-ja",
      "pkm-sv2a-011-ja-v4k5",
      "dbf-fb01-001-ja",
    ]);
  });

  it("refuses to select silently when two stored rows normalize to one request", async () => {
    const q = vi.fn().mockResolvedValue({
      rows: [legacyRow, { ...legacyRow, sku: "op-op01-001-ja" }],
    });

    const result = await resolveCardBatch(["OP-OP01-001-JP"], q);

    expect(result.results[0]).toMatchObject({
      status: "ambiguous_mirror_match",
    });
    expect(
      result.results[0]?.status === "ambiguous_mirror_match"
        ? result.results[0].candidate_skus.sort()
        : [],
    ).toEqual(["OP-OP01-001-JP", "op-op01-001-ja"].sort());
  });

  it("distinguishes a mirror outage from a successful empty result", async () => {
    const q = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(resolveCardBatch(["op-op01-001-ja"], q)).rejects.toBeInstanceOf(
      CardBatchUnavailableError,
    );
  });
});
