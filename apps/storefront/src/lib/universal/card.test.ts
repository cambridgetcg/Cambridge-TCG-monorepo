import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { getEnCardData, type EnCardImage, type SameLanguageCardImage } from "@/lib/cards/en-card-data";
import { createSameLanguageImageReference } from "@/lib/cards/same-language-image-reference";
import type { ImageReference } from "@/lib/cards/image-reference";
import { buildUniversalCard, resolveContentHash } from "./card";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/cards/en-card-data", () => ({ getEnCardData: vi.fn() }));

const mockQuery = vi.mocked(query);
const mockEnCardData = vi.mocked(getEnCardData);

beforeEach(() => {
  mockQuery.mockReset();
  mockEnCardData.mockReset();
  mockEnCardData.mockResolvedValue({ en_image: null, effect_text: null, attributes: null, same_language_image: null });
  mockQuery.mockResolvedValue({ rows: [] } as never);
});

describe("universal card legacy snapshot boundary", () => {
  it("does not read or project stored card, set-cover, or price snapshots", async () => {
    const storedRow = {
      set_code: "OP01",
      card_number: "OP01-001",
      sku: "op-op01-001-en",
      card_name: "Leader",
      name_en: "Leader",
      name_translations: null,
      rarity: "L",
      variant: "",
      game: "one-piece",
      set_name: "Romance Dawn",
      released_at: new Date("2022-12-02T00:00:00Z"),
      total_cards: 121,
      image_url: "https://legacy-upstream.example/card.jpg",
      cover_image_url: "https://legacy-upstream.example/set.jpg",
      spot_gbp: "9876.54",
      captured_on: new Date("2026-07-01T00:00:00Z"),
    };
    mockQuery.mockResolvedValueOnce({ rows: [storedRow], rowCount: 1 } as never);

    const result = await buildUniversalCard(
      "op-op01-001-en",
      "saturated",
    );
    const document = result?.document as Record<string, unknown>;
    const neighbours = document.neighbours as {
      set: { cover_image_url: string | null };
    };
    const serialized = JSON.stringify(document);

    expect(document.image_url).toBeNull();
    expect(document.image_attribution).toBeNull();
    expect(document.image_reference).toBeNull();
    expect(document.price).toBeNull();
    expect(document["@content_hash_contract"]).toMatchObject({
      price_input: null,
      capture_date_input: null,
      changed_on: "2026-07-12",
    });
    expect(neighbours.set.cover_image_url).toBeNull();
    expect(serialized).not.toContain("legacy-upstream.example");
    expect(serialized).not.toContain("9876.54");
    expect(serialized).not.toContain("2026-07-01");

    const select = String(mockQuery.mock.calls[0]?.[0]);
    expect(select).not.toContain("image_url");
    expect(select).not.toContain("cover_image_url");
    expect(select).not.toContain("spot_gbp");
    expect(select).not.toContain("card_price_history");

    mockQuery.mockResolvedValueOnce({
      rows: [{
        ...storedRow,
        spot_gbp: "123456.78",
        captured_on: new Date("2099-01-01T00:00:00Z"),
      }],
      rowCount: 1,
    } as never);

    await expect(resolveContentHash(result!.contentHash)).resolves.toEqual({
      sku: "op-op01-001-en",
      matched: true,
    });
  });
});

describe("universal card image-reference projections", () => {
  const reference: ImageReference = {
    requested_sku: "OP-OP01-001-JP-V1", requested_canonical_sku: "op-op01-001-ja-v1",
    depicted_sku: "OP-OP01-001-EN", depicted_canonical_sku: "op-op01-001-en",
    relationship: "reference", scope: "syntax_only", reason: "english_base_reference",
  };
  const image: EnCardImage = {
    url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/op/OP01-001.png",
    attribution: "© Publisher", reference, kind: "official_sample", source: "bandai-en",
    source_url: "https://en.onepiece-cardgame.com/cardlist/",
    publication_policy: "cambridge.official-en-media/2026-07-13",
    retrieved_at: "2026-09-29T00:00:00.000Z",
  };
  const effect = { text: "Official effect", card_type: "LEADER", attribution: "© Publisher", source_url: null, retrieved_at: image.retrieved_at };
  const attributes = {
    category: "LEADER", power: "5000", cost: null, cost_kind: null, counter: null,
    color: "Red", attribute: null, type_feature: null, block_icon: null, has_trigger: false,
  };
  const row = {
    sku: reference.requested_sku, set_code: "OP01", card_number: "OP01-001",
    card_name: "Leader", name_en: "Leader", name_translations: null, rarity: "L",
    variant: "V1", game: "one-piece", set_name: "Romance Dawn", released_at: null, total_cards: 121,
  };

  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [row] } as never);
    mockEnCardData.mockResolvedValue({ en_image: image, effect_text: effect, attributes, same_language_image: null });
  });

  it.each(["normal", "saturated"] as const)("keeps reference, URL and attribution together at %s density", async (density) => {
    const result = await buildUniversalCard(row.sku, density);
    expect(result?.document).toMatchObject({
      image_url: image.url, image_attribution: image.attribution, image_reference: reference,
      effect, attributes, price: null,
    });
  });

  it("omits the whole image trio and effect at sparse density without changing card identity", async () => {
    const normal = await buildUniversalCard(row.sku, "normal");
    const sparse = await buildUniversalCard(row.sku, "sparse");
    for (const field of ["image_url", "image_attribution", "image_reference", "image_same_language", "effect", "attributes"]) {
      expect(sparse?.document).not.toHaveProperty(field);
    }
    expect(sparse?.contentHash).toBe(normal?.contentHash);
  });

  it.each(["url", "attribution", "reference"])("withholds the whole official image when %s is missing", async (field) => {
    mockEnCardData.mockResolvedValue({ en_image: { ...image, [field]: undefined }, effect_text: effect, attributes: null } as Awaited<ReturnType<typeof getEnCardData>>);
    const result = await buildUniversalCard(row.sku);
    expect(result?.document).toMatchObject({ image_url: null, image_attribution: null, image_reference: null, effect });
  });
});

describe("universal card same-language image [C6]", () => {
  const reference: ImageReference = {
    requested_sku: "OP-OP01-001-JP-V1", requested_canonical_sku: "op-op01-001-ja-v1",
    depicted_sku: "OP-OP01-001-EN", depicted_canonical_sku: "op-op01-001-en",
    relationship: "reference", scope: "syntax_only", reason: "english_base_reference",
  };
  const english: EnCardImage = {
    url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-EN.png",
    attribution: "© Publisher", reference, kind: "official_sample", source: "bandai-en",
    source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
    publication_policy: "cambridge.official-en-media/2026-07-13", retrieved_at: "2026-09-29T00:00:00.000Z",
  };
  const japanese: SameLanguageCardImage = {
    url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png",
    attribution: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
    kind: "official_sample", source: "bandai-jp", language: "ja",
    source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016",
    retrieved_at: "2026-10-30T10:27:20.000Z", publication_policy: "cambridge.official-ja-media/2026-10-30",
    reference: createSameLanguageImageReference("OP-OP01-001-JP-V1", "OP-OP01-001-JA")!,
  };
  const row = {
    sku: "OP-OP01-001-JP-V1", set_code: "OP01", card_number: "OP01-001",
    card_name: "Leader", name_en: "Leader", name_translations: null, rarity: "L",
    variant: "V1", game: "one-piece", set_name: "Romance Dawn", released_at: null, total_cards: 121,
  };
  beforeEach(() => { mockQuery.mockResolvedValue({ rows: [row] } as never); });

  it("keeps the v1 trio English and carries the Japanese image as its own unit", async () => {
    mockEnCardData.mockResolvedValue({ en_image: english, effect_text: null, attributes: null, same_language_image: japanese });
    const document = (await buildUniversalCard(row.sku, "normal"))!.document;
    expect(document).toMatchObject({ image_url: english.url, image_attribution: english.attribution, image_reference: reference });
    expect(document.image_same_language).toEqual({ url: japanese.url, attribution: japanese.attribution, language: "ja", reference: japanese.reference });
    expect((document.publication_boundary as Record<string, string>).image).toBe("cleared_official_sample_self_hosted_attributed");
  });

  it("publishes the Japanese unit with a null v1 trio when there is no English image", async () => {
    mockEnCardData.mockResolvedValue({ en_image: null, effect_text: null, attributes: null, same_language_image: japanese });
    const document = (await buildUniversalCard(row.sku, "saturated"))!.document;
    expect(document).toMatchObject({ image_url: null, image_attribution: null, image_reference: null });
    expect((document.image_same_language as { url: string }).url).toBe(japanese.url);
    expect((document.publication_boundary as Record<string, string>).image).toBe("cleared_official_sample_self_hosted_attributed");
  });

  it("omits all four image fields at sparse density, and gives null for an old reader result", async () => {
    mockEnCardData.mockResolvedValue({ en_image: english, effect_text: null, attributes: null, same_language_image: japanese });
    const sparse = (await buildUniversalCard(row.sku, "sparse"))!.document;
    for (const field of ["image_url", "image_attribution", "image_reference", "image_same_language"]) expect(sparse).not.toHaveProperty(field);
    mockEnCardData.mockResolvedValue({ en_image: null, effect_text: null, attributes: null } as Awaited<ReturnType<typeof getEnCardData>>);
    expect((await buildUniversalCard(row.sku, "normal"))!.document.image_same_language).toBeNull();
  });
});
