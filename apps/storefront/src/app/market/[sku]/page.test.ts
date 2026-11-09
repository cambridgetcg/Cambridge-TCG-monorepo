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
  it("never offers a Japanese official image as og:image: the share card instead", async () => {
    const metadata = await metadataFor({ ...card, image_url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png", image_language: "ja" });
    expect(metadata.openGraph?.images).toEqual([SHARE_CARD]);
  });

  it("keeps the English image and the catalogue fallback as before (a recorded gap)", async () => {
    expect((await metadataFor(card)).openGraph?.images).toEqual([{ url: card.image_url }]);
    expect((await metadataFor({ ...card, image_url: null, image_language: null })).openGraph?.images).toEqual([SHARE_CARD]);
  });
});
