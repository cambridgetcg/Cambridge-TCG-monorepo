import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageReference } from "@/lib/cards/image-reference";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  fetchPrices: vi.fn(), fetchGamesDetailed: vi.fn(), fetchSetsDetailed: vi.fn(),
  query: vi.fn(), getEnCardImages: vi.fn(), getFirstPartyReferences: vi.fn(),
}));
vi.mock("@/lib/wholesale/client", () => ({
  fetchPrices: mocks.fetchPrices, fetchGamesDetailed: mocks.fetchGamesDetailed,
  fetchSetsDetailed: mocks.fetchSetsDetailed,
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/cards/en-card-data", () => ({ getEnCardImages: mocks.getEnCardImages }));
vi.mock("@/lib/prices/first-party", () => ({ getFirstPartyReferences: mocks.getFirstPartyReferences }));

const reference: ImageReference = {
  requested_sku: "OP-OP01-001-JP-V1", requested_canonical_sku: "op-op01-001-ja-v1",
  depicted_sku: "OP-OP01-001-EN", depicted_canonical_sku: "op-op01-001-en",
  relationship: "reference", scope: "syntax_only", reason: "english_base_reference",
};
const catalogUrl = "https://jp-op-photos.s3.us-east-1.amazonaws.com/OP01/001.jpg";
const official = {
  url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/op/OP01-001.png",
  attribution: "© Publisher", reference,
};
const item = {
  sku: reference.requested_sku, card_number: "OP01-001", name: "Leader",
  set_code: "OP01", set_name: "Romance Dawn", rarity: "L", stock: 0, image_url: null,
};

async function readCard() {
  const response = await GET(new Request("https://cambridgetcg.com/api/market/catalog"));
  expect(response.status).toBe(200);
  return (await response.json()).cards[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetchPrices.mockResolvedValue({ items: [item], total: 1, source: "wholesale-db" });
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("SELECT sku, image_url") ? [{ sku: item.sku, image_url: catalogUrl }] : [],
  }));
  mocks.getEnCardImages.mockResolvedValue(new Map());
  mocks.getFirstPartyReferences.mockResolvedValue(new Map());
});

describe("market catalog image projection", () => {
  it("publishes the complete reference trio instead of the catalog fallback", async () => {
    mocks.getEnCardImages.mockResolvedValue(new Map([[item.sku, official]]));
    expect(await readCard()).toMatchObject({
      image_url: official.url, image_attribution: official.attribution, image_reference: reference,
    });
  });

  it("preserves catalog-only images with null reference and attribution", async () => {
    expect(await readCard()).toMatchObject({ image_url: catalogUrl, image_attribution: null, image_reference: null });
  });

  it.each(["url", "attribution", "reference"])("keeps the fallback separate when official %s is absent", async (field) => {
    mocks.getEnCardImages.mockResolvedValue(new Map([[item.sku, { ...official, [field]: null }]]));
    expect(await readCard()).toMatchObject({ image_url: catalogUrl, image_attribution: null, image_reference: null });
  });

  it("validates both fallback sources and withholds unknown hosts", async () => {
    mocks.query.mockResolvedValue({ rows: [{ sku: item.sku, image_url: "https://unreviewed.example/photo.jpg" }] });
    mocks.fetchPrices.mockResolvedValue({ items: [{ ...item, image_url: "https://unreviewed.example/other.jpg" }], total: 1, source: "wholesale-db" });
    expect(await readCard()).toMatchObject({ image_url: null, image_attribution: null, image_reference: null });
  });

  it("retains the allowed final catalog fallback when local enrichment is absent", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.fetchPrices.mockResolvedValue({ items: [{ ...item, image_url: catalogUrl }], total: 1, source: "wholesale-db" });
    expect(await readCard()).toMatchObject({ image_url: catalogUrl, image_attribution: null, image_reference: null });
  });

  it("returns null image metadata when both enrichments fail", async () => {
    mocks.query.mockRejectedValue(new Error("fixture unavailable"));
    mocks.getEnCardImages.mockRejectedValue(new Error("fixture unavailable"));
    expect(await readCard()).toMatchObject({ image_url: null, image_attribution: null, image_reference: null });
  });
});
