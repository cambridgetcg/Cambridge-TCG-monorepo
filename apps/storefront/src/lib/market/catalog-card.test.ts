import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageReference } from "@/lib/cards/image-reference";
import { createSameLanguageImageReference } from "@/lib/cards/same-language-image-reference";
import { resolveCardIdentity } from "./catalog-card";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getEnCardData: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/cards/en-card-data", () => ({ getEnCardData: mocks.getEnCardData }));

const reference: ImageReference = {
  requested_sku: "OP-OP01-001-JP-V1",
  requested_canonical_sku: "op-op01-001-ja-v1",
  depicted_sku: "OP-OP01-001-EN",
  depicted_canonical_sku: "op-op01-001-en",
  relationship: "reference", scope: "syntax_only", reason: "english_base_reference",
};
const catalogUrl = "https://jp-op-photos.s3.us-east-1.amazonaws.com/OP01/001.jpg";
const official = {
  url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/op/OP01-001.png",
  attribution: "© Publisher", reference,
};
const row = {
  sku: reference.requested_sku, card_number: "OP01-001", card_name: "Leader",
  set_code: "OP01", set_name: "Romance Dawn", rarity: "L", image_url: catalogUrl,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({ rows: [row] });
  mocks.getEnCardData.mockResolvedValue({ en_image: null, effect_text: null, attributes: null });
});

describe("market card identity images", () => {
  it("keeps the English reference relationship and copyright together while retaining card facts", async () => {
    const effect = { text: "Official effect", attribution: "© Publisher" };
    const attributes = { power: "5000" };
    mocks.getEnCardData.mockResolvedValue({ en_image: official, effect_text: effect, attributes });
    const result = await resolveCardIdentity(row.sku);
    expect(result).toMatchObject({ kind: "ok", card: {
      image_url: official.url, image_attribution: official.attribution,
      image_reference: reference, effect_text: effect, attributes,
    } });
    expect(mocks.getEnCardData).toHaveBeenCalledWith(row.sku);
  });

  it("retains the catalog fallback without inventing source or printing metadata", async () => {
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: {
      image_url: catalogUrl, image_attribution: null, image_reference: null,
    } });
  });

  it.each(["url", "attribution", "reference"])("does not mix an incomplete official %s with fallback metadata", async (field) => {
    mocks.getEnCardData.mockResolvedValue({ en_image: { ...official, [field]: null }, effect_text: null, attributes: null });
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: {
      image_url: catalogUrl, image_attribution: null, image_reference: null,
    } });
  });

  it.each([null, "https://unreviewed.example/card.jpg"])("withholds absent or noncatalog fallback %s", async (image_url) => {
    mocks.query.mockResolvedValue({ rows: [{ ...row, image_url }] });
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: {
      image_url: null, image_attribution: null, image_reference: null,
    } });
  });
});

describe("market card identity same-language images", () => {
  const japanese = {
    url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png",
    attribution: "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション",
    language: "ja", reference: createSameLanguageImageReference("OP-OP01-001-JP-V1", "OP-OP01-001-JA")!,
  };

  it("prefers a Japanese request's own-language image over the English reference, and says so", async () => {
    mocks.getEnCardData.mockResolvedValue({ en_image: official, same_language_image: japanese, effect_text: null, attributes: null });
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: {
      image_url: japanese.url, image_attribution: japanese.attribution, image_reference: null,
      image_language: "ja", image_same_language_reference: japanese.reference,
    } });
  });

  it("falls back to the English reference, then the catalogue photo, each with its own language field", async () => {
    mocks.getEnCardData.mockResolvedValue({ en_image: official, same_language_image: null, effect_text: null, attributes: null });
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: { image_url: official.url, image_language: "en", image_same_language_reference: null } });
    // A reader result without the new field counts as null.
    mocks.getEnCardData.mockResolvedValue({ en_image: null, effect_text: null, attributes: null });
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: { image_url: catalogUrl, image_language: null, image_same_language_reference: null } });
  });

  it("does not use an incomplete Japanese image", async () => {
    mocks.getEnCardData.mockResolvedValue({ en_image: official, same_language_image: { ...japanese, attribution: "" }, effect_text: null, attributes: null });
    expect(await resolveCardIdentity(row.sku)).toMatchObject({ kind: "ok", card: { image_url: official.url, image_language: "en" } });
  });
});
