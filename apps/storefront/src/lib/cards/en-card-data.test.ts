import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { enCardKey, enCardKeyFromParts, getEnCardData, getEnCardImages } from "./en-card-data";
import { DEFAULT_CARD_IMAGE_CDN, type StoredOfficialImage } from "./image-publication";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
const mockQuery = vi.mocked(query);
const imageRow: StoredOfficialImage = {
  sku: "OP-OP01-001-EN", lang: "en", source: "bandai-en", kind: "official_sample",
  takedown_status: "clear", s3_key: "official/OP-OP01-001-EN.png",
  attribution: "Publisher copyright",
  source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
  retrieved_at: "2026-07-13T09:00:00.000Z",
};
beforeEach(() => { mockQuery.mockReset(); });

describe("English media read boundary", () => {
  it("preserves write keys and validates complete read syntax before dropping language/variant", () => {
    expect(enCardKeyFromParts("op", "op01", "001")).toBe("OP-OP01-001-EN");
    expect(enCardKey("OP-OP01-001-JP-V11DZ")).toBe("OP-OP01-001-EN");
    expect(enCardKey("op-op01-en-001")).toBe("OP-OP01-001-EN");
    expect(enCardKey("op-op01-001-japanese")).toBeNull();
  });

  it.each(["SEALED-OP01-BOX-JP", "op-op01-001-", "op-op01-001-en-foo/", "pkm-sv1-001-en"])("does not read storage for invalid or unreviewed reference scope: %s", async (sku) => {
    await expect(getEnCardData(sku)).resolves.toEqual({ effect_text: null, attributes: null, en_image: null });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("shares the image projection between single and batch requests", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [imageRow] } as never).mockResolvedValueOnce({ rows: [] } as never);
    const single = await getEnCardData("OP-OP01-001-JP-V11DZ");
    mockQuery.mockResolvedValueOnce({ rows: [imageRow] } as never);
    const batch = await getEnCardImages(["OP-OP01-001-JP-V11DZ"]);
    expect(single.en_image).toEqual(batch.get("OP-OP01-001-JP-V11DZ"));
    expect(single.en_image?.url).toBe(`${DEFAULT_CARD_IMAGE_CDN}/${imageRow.s3_key}`);
    expect(single.en_image?.reference.relationship).toBe("reference");
    expect(single.effect_text).toBeNull();
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toEqual([["OP-OP01-001-EN"]]);
    for (const guard of ["source = 'bandai-en'", "kind = 'official_sample'", "takedown_status = 'clear'", "s3_key IS NOT NULL", "ORDER BY sku ASC, retrieved_at DESC"]) expect(sql).toContain(guard);
  });

  it("deduplicates lookup keys but preserves each raw request's own reference", async () => {
    mockQuery.mockResolvedValue({ rows: [imageRow] } as never);
    const skus = ["OP-OP01-001-JP-V11DZ", "op-op01-001-ja", "OP-OP01-001-EN"];
    const images = await getEnCardImages(skus);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![1]).toEqual([["OP-OP01-001-EN"]]);
    for (const sku of skus) {
      expect(images.get(sku)?.reference.requested_sku).toBe(sku);
      expect(images.get(sku)?.reference.relationship).toBe("reference");
    }
    expect(images.get(skus[0])?.reference).not.toBe(images.get(skus[1])?.reference);
  });

  it("selects the latest coherent row deterministically even if an adapter returns unordered rows", async () => {
    const newer = { ...imageRow, s3_key: "official/new.png", retrieved_at: "2026-09-29T00:00:00Z" };
    mockQuery.mockResolvedValueOnce({ rows: [imageRow, newer] } as never);
    const first = await getEnCardImages(["op-op01-001-en"]);
    mockQuery.mockResolvedValueOnce({ rows: [newer, imageRow] } as never);
    expect(await getEnCardImages(["op-op01-001-en"])).toEqual(first);
    expect(first.get("op-op01-001-en")?.url).toMatch(/\/official\/new\.png$/);
  });

  it("rechecks projection guards after SQL and never substitutes a publisher hotlink", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...imageRow, attribution: "" }, { ...imageRow, takedown_status: "removed" }] } as never);
    expect((await getEnCardImages(["op-op01-001-ja"])).size).toBe(0);
  });

  it("preserves attributed effect text and stats from the later recorded decision", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({ rows: [{
      ...imageRow, effect_text: "Example rules text", card_type: "CHARACTER", attributes: { cost: "2", power: "3000" },
    }] } as never);
    const data = await getEnCardData("OP-OP01-001-JP-V11DZ");
    expect(data.effect_text).toMatchObject({ text: "Example rules text", attribution: imageRow.attribution, source_url: imageRow.source_url });
    expect(data.attributes).toEqual({ cost: "2", power: "3000" });
    expect(data.en_image).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("withholds text/stats lacking coherent source and attribution without hiding the independent image", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [imageRow] } as never).mockResolvedValueOnce({ rows: [{
      ...imageRow, attribution: " ", effect_text: "Unattributed text", attributes: { cost: "2" },
    }] } as never);
    const data = await getEnCardData("op-op01-001-ja");
    expect(data.effect_text).toBeNull();
    expect(data.attributes).toBeNull();
    expect(data.en_image).not.toBeNull();
  });
});
