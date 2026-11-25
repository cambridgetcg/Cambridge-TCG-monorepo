import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { chooseOfficialImage, enCardKey, enCardKeyFromParts, getEnCardData, getEnCardImages, getOfficialCardImages, getSameLanguageImages, officialImagesJaOn } from "./en-card-data";
import { DEFAULT_CARD_IMAGE_CDN, type StoredOfficialImage } from "./image-publication";
import { OFFICIAL_IMAGE_LANES } from "./official-image-lanes";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
const mockQuery = vi.mocked(query);
const imageRow: StoredOfficialImage = {
  sku: "OP-OP01-001-EN", lang: "en", source: "bandai-en", kind: "official_sample",
  takedown_status: "clear", s3_key: "official/OP-OP01-001-EN.png",
  attribution: "Publisher copyright",
  source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
  retrieved_at: "2026-07-13T09:00:00.000Z",
};
// A Japanese base row as the ingest records it and the upload completes it.
const jaRow: StoredOfficialImage = {
  sku: "OP-OP01-001-JA", lang: "ja", source: "bandai-jp", kind: "official_sample",
  takedown_status: "clear", s3_key: "official/OP-OP01-001-JA.png",
  attribution: OFFICIAL_IMAGE_LANES.ja.credits.op,
  source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016",
  retrieved_at: "2026-10-30T10:27:20.000Z", license_note: "cambridge.official-ja-media/2026-10-30",
};
/** The Japanese lane is off unless the environment says "show". */
const jaOn = { OFFICIAL_IMAGES_JA: "show" };
type Answer<T> = T[] | Error;
const bySql = (answers: { en?: Answer<StoredOfficialImage>; ja?: Answer<StoredOfficialImage>; text?: Answer<unknown> }) => async (sql: string) => {
  const answer = sql.includes("FROM card_texts") ? answers.text : sql.includes("lang = 'ja' AND source = 'bandai-jp'") ? answers.ja : answers.en;
  if (answer instanceof Error) throw answer;
  return { rows: answer ?? [] };
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
    await expect(getEnCardData(sku)).resolves.toEqual({ effect_text: null, attributes: null, en_image: null, same_language_image: null, image_state: "no_lane", text_state: "no_lane" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("shares the image projection between single and batch requests", async () => {
    // A Japanese request reads the English lane, then the Japanese lane, then text.
    mockQuery.mockResolvedValueOnce({ rows: [imageRow] } as never).mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({ rows: [] } as never);
    const single = await getEnCardData("OP-OP01-001-JP-V11DZ", jaOn);
    mockQuery.mockResolvedValueOnce({ rows: [imageRow] } as never);
    const batch = await getEnCardImages(["OP-OP01-001-JP-V11DZ"]);
    expect(single.en_image).toEqual(batch.get("OP-OP01-001-JP-V11DZ"));
    expect(single.en_image?.url).toBe(`${DEFAULT_CARD_IMAGE_CDN}/${imageRow.s3_key}`);
    expect(single.en_image?.reference.relationship).toBe("reference");
    expect(single.effect_text).toBeNull();
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toEqual([["OP-OP01-001-EN"]]);
    for (const guard of ["lang = 'en' AND source = 'bandai-en'", "kind = 'official_sample'", "takedown_status = 'clear'", "s3_key IS NOT NULL", "ORDER BY sku ASC, retrieved_at DESC"]) expect(sql).toContain(guard);
    expect(single.same_language_image).toBeNull();
    expect(String(mockQuery.mock.calls[1]![0])).toContain("lang = 'ja' AND source = 'bandai-jp'");
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
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...imageRow, attribution: "" }, { ...imageRow, takedown_status: "removed" }] } as never);
      const images = await getEnCardImages(["op-op01-001-ja", "op-op01-002-ja"]);
      // Held but refused is null and logged by count; no row at all is absent.
      expect(images.get("op-op01-001-ja")).toBeNull();
      expect(images.has("op-op01-002-ja")).toBe(false);
      expect(error.mock.calls).toEqual([["[official-images] en: 1 of 1 held pictures failed the checks"]]);
    } finally { error.mockRestore(); }
  });

  it("preserves attributed effect text and stats from the later recorded decision", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({ rows: [{
      ...imageRow, effect_text: "Example rules text", card_type: "CHARACTER", attributes: { cost: "2", power: "3000" },
    }] } as never);
    const data = await getEnCardData("OP-OP01-001-JP-V11DZ", jaOn);
    expect(data.effect_text).toMatchObject({ text: "Example rules text", attribution: imageRow.attribution, source_url: imageRow.source_url });
    expect(data.attributes).toEqual({ cost: "2", power: "3000" });
    expect(data.en_image).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(3);
    // Text stays in the English lane.
    expect(String(mockQuery.mock.calls[2]![0])).toContain("FROM card_texts WHERE sku = $1 AND lang = 'en' AND source = 'bandai-en'");
  });

  it("withholds text/stats lacking coherent source and attribution without hiding the independent image", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [imageRow] } as never).mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({ rows: [{
      ...imageRow, attribution: " ", effect_text: "Unattributed text", attributes: { cost: "2" },
    }] } as never);
    const data = await getEnCardData("op-op01-001-ja", jaOn);
    expect(data.effect_text).toBeNull();
    expect(data.attributes).toBeNull();
    expect(data.en_image).not.toBeNull();
  });
});

describe("rows as the production driver returns them", () => {
  // createCompatDb gives timestamps as Postgres text (@cambridge-tcg/db/timestamp).
  const driver = "2026-07-13 09:00:00.123+00";

  it("shows the image and the text, with the same UTC millisecond times on the wire", async () => {
    mockQuery.mockImplementation(bySql({ en: [{ ...imageRow, retrieved_at: driver }], text: [{ ...imageRow, retrieved_at: driver, effect_text: "Example rules text", card_type: "CHARACTER", attributes: { cost: "2" } }] }) as never);
    const data = await getEnCardData("OP-OP01-001-JP-V11DZ");
    expect(data.en_image?.retrieved_at).toBe("2026-07-13T09:00:00.123Z");
    expect(data.effect_text?.retrieved_at).toBe("2026-07-13T09:00:00.123Z");
    expect(data).toMatchObject({ attributes: { cost: "2" }, image_state: "shown", text_state: "shown" });
  });

  it("orders rows by the moment they name, whichever way it is written", async () => {
    // Named to lose the key tie-break, so only the moment can choose it.
    const newer = { ...imageRow, s3_key: "official/zz-newer.png", retrieved_at: "2026-09-29 00:00:00+00" };
    mockQuery.mockResolvedValueOnce({ rows: [imageRow, newer] } as never);
    expect((await getEnCardImages(["op-op01-001-en"])).get("op-op01-001-en")?.url).toMatch(/\/official\/zz-newer\.png$/);
  });
});

describe("why nothing is shown", () => {
  const quiet = async (run: () => Promise<void>) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try { await run(); } finally { error.mockRestore(); }
  };
  const row = { ...imageRow, effect_text: "Example rules text", card_type: "CHARACTER", attributes: null };

  it("says nothing is held when the store answers with no row", async () => {
    mockQuery.mockImplementation(bySql({}) as never);
    expect(await getEnCardData("op-op01-001-en")).toMatchObject({ image_state: "none", text_state: "none" });
  });

  it("says the Japanese lane is off for a Japanese card with no English image, and only then", async () => {
    mockQuery.mockImplementation(bySql({}) as never);
    expect((await getEnCardData("OP-OP01-001-JP")).image_state).toBe("switched_off");
    expect((await getEnCardData("OP-OP01-001-JP", jaOn)).image_state).toBe("none");
    mockQuery.mockImplementation(bySql({ en: [imageRow] }) as never);
    expect((await getEnCardData("OP-OP01-001-JP")).image_state).toBe("shown");
  });

  it("calls a card with a row but no rules text none, not unreadable", async () => {
    mockQuery.mockImplementation(bySql({ text: [{ ...row, effect_text: null }] }) as never);
    expect((await getEnCardData("op-op01-001-en")).text_state).toBe("none");
  });

  it("never calls a failed read, or a held record that fails the checks, anything but unreadable", () => quiet(async () => {
    const down = new Error("connection to internal-db.example failed");
    mockQuery.mockImplementation(bySql({ en: down, text: down }) as never);
    expect(await getEnCardData("op-op01-001-en")).toMatchObject({ en_image: null, effect_text: null, image_state: "unreadable", text_state: "unreadable" });
    mockQuery.mockImplementation(bySql({ en: [], ja: down }) as never);
    expect((await getEnCardData("OP-OP01-001-JP", jaOn)).image_state).toBe("unreadable");
    for (const change of [{ retrieved_at: "yesterday" }, { source_url: null }, { attribution: " " }]) {
      mockQuery.mockImplementation(bySql({ en: [{ ...imageRow, ...change }], text: [{ ...row, ...change }] }) as never);
      expect(await getEnCardData("OP-OP01-001-JP")).toMatchObject({ image_state: "unreadable", text_state: "unreadable" });
    }
  }));
});

describe("Japanese same-language read boundary", () => {
  it("reads only the Japanese lane's pair and projects a Japanese request's own-language base image", async () => {
    mockQuery.mockImplementation(bySql({ ja: [jaRow] }) as never);
    const images = await getSameLanguageImages(["OP-OP01-001-JP", "OP-OP01-001-JP-V11DZ", "op-op01-001-en"], jaOn);
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(params).toEqual([["OP-OP01-001-JA"]]);
    for (const guard of ["lang = 'ja' AND source = 'bandai-jp'", "kind = 'official_sample'", "takedown_status = 'clear'", "s3_key IS NOT NULL", "license_note"]) expect(sql).toContain(guard);
    expect(sql).not.toContain("bandai-en");
    const base = images.get("OP-OP01-001-JP")!;
    expect(base).toMatchObject({ url: `${DEFAULT_CARD_IMAGE_CDN}/official/OP-OP01-001-JA.png`, attribution: jaRow.attribution, language: "ja", source: "bandai-jp", publication_policy: "cambridge.official-ja-media/2026-10-30" });
    expect(base.reference).toMatchObject({ depicted_sku: "OP-OP01-001-JA", reason: "same_language_base_reference", language: "ja" });
    // A requested variant is shown its base print, and keeps its own requested SKU.
    expect(images.get("OP-OP01-001-JP-V11DZ")?.reference.requested_sku).toBe("OP-OP01-001-JP-V11DZ");
    // An English request has no same-language key.
    expect(images.has("op-op01-001-en")).toBe(false);
  });

  it("makes no query for a request with no Japanese key", async () => {
    expect((await getSameLanguageImages(["op-op01-001-en", "pkm-sv1-001-ja", "SEALED-OP01-BOX-JP"], jaOn)).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("is off unless OFFICIAL_IMAGES_JA is show, before any key or query", async () => {
    for (const value of ["show", " show\n"]) expect(officialImagesJaOn({ OFFICIAL_IMAGES_JA: value })).toBe(true);
    for (const value of [undefined, "", "off", "on", "true", "1", "shown", "SHOW", "Show", "ｓｈｏｗ"]) expect(officialImagesJaOn({ OFFICIAL_IMAGES_JA: value })).toBe(false);
    mockQuery.mockImplementation(bySql({ en: [imageRow], ja: [jaRow] }) as never);
    expect((await getSameLanguageImages(["OP-OP01-001-JP"], {})).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
    const data = await getEnCardData("OP-OP01-001-JP", {});
    expect(data.same_language_image).toBeNull();
    expect(data.en_image).not.toBeNull();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("bandai-jp"))).toBe(false);
  });

  it("rechecks the Japanese lane's own evidence after SQL", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const change of [
      { lang: "en" }, { source: "bandai-en" }, { takedown_status: "removed" },
      { attribution: "©Eiichiro Oda/Shueisha" }, { license_note: null }, { s3_key: "official/OP-OP01-001-EN.png" },
      { source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-002.png?261016" },
    ]) {
      mockQuery.mockReset();
      mockQuery.mockImplementation(bySql({ ja: [{ ...jaRow, ...change } as StoredOfficialImage] }) as never);
      expect((await getSameLanguageImages(["OP-OP01-001-JP"], jaOn)).get("OP-OP01-001-JP"), JSON.stringify(change)).toBeNull();
    }
    error.mockRestore();
  });

  it("chooses the same-language image first, else the English base reference, and says which", async () => {
    mockQuery.mockImplementation(bySql({ en: [imageRow], ja: [jaRow] }) as never);
    const images = await getOfficialCardImages(["OP-OP01-001-JP", "op-op01-001-en", "pkm-sv1-001-ja"], jaOn);
    expect(images.get("OP-OP01-001-JP")).toMatchObject({ language: "ja", url: `${DEFAULT_CARD_IMAGE_CDN}/official/OP-OP01-001-JA.png` });
    expect(images.get("op-op01-001-en")).toMatchObject({ language: "en", url: `${DEFAULT_CARD_IMAGE_CDN}/${imageRow.s3_key}` });
    expect(images.has("pkm-sv1-001-ja")).toBe(false);
    expect(chooseOfficialImage(null, null)).toBeNull();
  });

  it("keeps the English images when the Japanese lane fails, logging only the error's name [C25]", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mockQuery.mockImplementation(bySql({ en: [imageRow], ja: new Error("connection to internal-db.example failed") }) as never);
      const images = await getOfficialCardImages(["OP-OP01-001-JP"], jaOn);
      expect(images.get("OP-OP01-001-JP")).toMatchObject({ language: "en" });
      expect(error.mock.calls.flat().join(" ")).not.toContain("internal-db.example");
      const data = await getEnCardData("OP-OP01-001-JP", jaOn);
      expect(data.en_image).not.toBeNull();
      expect(data.same_language_image).toBeNull();
    } finally { error.mockRestore(); }
  });

  it("gives a Japanese request both images in getEnCardData, from separate lanes", async () => {
    mockQuery.mockImplementation(bySql({ en: [imageRow], ja: [jaRow] }) as never);
    const data = await getEnCardData("OP-OP01-001-JP", jaOn);
    expect(data.en_image?.reference.reason).toBe("english_base_reference");
    expect(data.same_language_image?.reference.reason).toBe("same_language_base_reference");
  });
});
