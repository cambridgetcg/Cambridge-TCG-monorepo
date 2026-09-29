import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageReference } from "@/lib/cards/image-reference";
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
