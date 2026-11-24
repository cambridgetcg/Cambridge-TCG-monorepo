import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHARE_CARD } from "@/lib/share-card";
import type { CatalogIdentity } from "@/lib/market/catalog-card";

const mocks = vi.hoisted(() => ({ resolveCardIdentity: vi.fn() }));
vi.mock("@/lib/market/catalog-card", () => ({ resolveCardIdentity: mocks.resolveCardIdentity }));
vi.mock("@/lib/market/reference-price", () => ({ resolveReferencePrice: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("./CardMarketClient", () => ({ default: () => null }));
import { generateMetadata } from "./page";

const card: CatalogIdentity = {
  sku: "OP-OP01-001-JP", card_number: "OP01-001", card_name: "Leader", set_code: "OP01", set_name: "Romance Dawn", rarity: "L",
  image_url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-EN.png", image_attribution: "© Publisher",
  image_reference: null, image_language: "en", image_same_language_reference: null,
  effect_text: null, attributes: null, artist: null, artist_slug: null,
};
const metadataFor = async (identity: CatalogIdentity) => {
  mocks.resolveCardIdentity.mockResolvedValue({ kind: "ok", card: identity });
  return generateMetadata({ params: Promise.resolve({ sku: identity.sku }) });
};

beforeEach(() => { mocks.resolveCardIdentity.mockReset(); });

describe("/market/[sku] share image [C7]", () => {
  // A social platform would show and cache the picture without its credit.
  it.each([
    ["an English official image", card.image_url, "en"],
    ["a Japanese official image", "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png", "ja"],
    ["a catalogue photo", "https://jp-op-photos.s3.us-east-1.amazonaws.com/hires/OP01/OP-OP01-001-JP-V11L2.jpg", null],
    ["no image", null, null],
  ] as const)("never offers %s as og:image: the share card instead", async (_what, image_url, image_language) => {
    expect((await metadataFor({ ...card, image_url, image_language })).openGraph?.images).toEqual([SHARE_CARD]);
  });
});
