import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getEnCardData } from "@/lib/cards/en-card-data";
import { createSameLanguageImageReference } from "@/lib/cards/same-language-image-reference";
import { fetchCardDetailed, type CardLookup, type PriceItem } from "@/lib/wholesale/client";
import { GET } from "@/app/api/v1/universal/card/[sku]/route";
import { GET as dated } from "@/app/api/at/[date]/card/[sku]/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/cards/en-card-data", () => ({ getEnCardData: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ fetchCardDetailed: vi.fn() }));
const db = vi.mocked(query), media = vi.mocked(getEnCardData), catalogue = vi.mocked(fetchCardDetailed);

const item = (over: Partial<PriceItem>): PriceItem => ({
  sku: "OP-OP01-001-JP-V11L1", card_number: "OP01-001", name: "ロロノア・ゾロ", name_en: null, rarity: "L",
  set_code: "OP01", set_name: "Romance Dawn", category: "singles", price_gbp: null, stock: 0, pending_stock: 0,
  image_url: null, updated_at: "2026-07-11T22:02:28.000Z", plain_listing: true, ...over,
});
const found = (over: Partial<PriceItem> = {}): CardLookup => ({ card: item(over), source: "wholesale-db", absence: null });
const none = (reason: NonNullable<CardLookup["absence"]>["reason"], listings: string[] = []): CardLookup =>
  ({ card: null, source: "wholesale-db", absence: { reason, listings } });
// The mirror's row for the base printing, with the driver's text date and its row-order label.
const mirror = {
  set_code: "OP01", card_number: "OP01-001", sku: "OP-OP01-001-JP-V11L1", card_name: "ロロノア・ゾロ", name_en: null,
  name_translations: null, rarity: "L", variant: "v2", game: "op", set_name: "Romance Dawn", released_at: "2022-07-22", total_cards: 129,
};

beforeEach(() => {
  vi.resetAllMocks();
  media.mockResolvedValue({ en_image: null, effect_text: null, attributes: null, same_language_image: null, image_state: "none", text_state: "none" });
  db.mockImplementation(async (_sql, params) => ({ rows: params?.[0] === mirror.sku ? [mirror] : [], rowCount: 0 }));
});
const get = (sku: string, search = "") =>
  GET(new NextRequest(`https://cambridgetcg.example/api/v1/universal/card/${sku}${search}`), { params: Promise.resolve({ sku }) });

describe("GET /api/v1/universal/card/[sku]: which row answers", () => {
  it("answers the published plain SKU with its plain listing, and says so", async () => {
    catalogue.mockResolvedValue(found());
    const response = await get("op-op01-001-ja");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      sku: "OP-OP01-001-JP-V11L1", card_number: "OP01-001", rarity: { natural_label: "L" }, variant: null,
      name: { natural_token: "ロロノア・ゾロ" }, in_set: { target_natural_token: "OP01" },
      sku_match: { requested_sku: "op-op01-001-ja", stored_sku: "OP-OP01-001-JP-V11L1", matched_by: "plain_listing", as_of: "2026-07-11T22:02:28.000Z" },
      "@sources": ["storefront-rds.card_set_cards", "storefront-rds.card_sets", "wholesale-rds.cards"],
      "@source_license": ["proprietary", "proprietary", "proprietary"],
    });
    // One stored card, one content hash, whichever SKU was asked for.
    const stored = await (await get(mirror.sku)).json();
    expect(stored.sku_match).toBeNull();
    expect(stored["@content_hash"]).toBe(body["@content_hash"]);
  });

  it("does not answer from a mirror row its title does not fit, should one ever be copied in", async () => {
    db.mockResolvedValue({ rows: [{ ...mirror, sku: "op-op01-001-ja", card_name: "〔状態A-〕ロロノア・ゾロ(パラレル/漫画絵)【L/P】", rarity: null }], rowCount: 1 });
    catalogue.mockResolvedValue(none("none_plain"));
    expect((await get("op-op01-001-ja")).status).toBe(404);
  });

  it("answers at every density, with the production driver's text date", async () => {
    catalogue.mockResolvedValue(found());
    for (const density of ["sparse", "normal", "saturated"]) {
      const response = await get("op-op01-001-ja", `?density=${density}`);
      expect(response.status).toBe(200);
      expect((await response.json()).sku_match.matched_by).toBe("plain_listing");
    }
    expect((await (await get("op-op01-001-ja", "?density=saturated")).json()).neighbours.set.released_at).toBe("2022-07-22");
  });

  it("answers another spelling, and a card the mirror does not hold without a hash link", async () => {
    catalogue.mockResolvedValue(found());
    expect((await (await get("op-op01-001-ja-v11l1")).json()).sku_match.matched_by).toBe("canonical_alias");
    catalogue.mockResolvedValue(found({ sku: "op-op01-004-ja", card_number: "OP01-004", name: "ウソップ", rarity: "R" }));
    const body = await (await get("op-op01-004-ja")).json();
    expect(body).toMatchObject({ sku: "op-op01-004-ja", sku_match: null, "@sources": ["wholesale-rds.cards"], name: { natural_token: "ウソップ" } });
    expect(body._links.federation).toBeNull();
  });

  it("answers a plain SKU no listing shows from the publisher's own list, with no name and no rarity", async () => {
    catalogue.mockResolvedValue(none("none_plain"));
    media.mockResolvedValue({
      en_image: null, effect_text: null, attributes: null, image_state: "shown", text_state: "none",
      same_language_image: {
        url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-077-JA.png", attribution: "©", language: "ja",
        kind: "official_sample", source: "bandai-jp", source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-077.png",
        retrieved_at: "2026-10-30T15:41:00.000Z", publication_policy: "cambridge.official-ja-media/2026-10-30",
        reference: createSameLanguageImageReference("op-op01-077-ja", "OP-OP01-077-JA")!,
      },
    });
    const body = await (await get("op-op01-077-ja")).json();
    expect(body).toMatchObject({
      sku: "op-op01-077-ja", card_number: "OP01-077", name: null, rarity: null, variant: null,
      sku_match: { matched_by: "publisher_record", stored_sku: "OP-OP01-077-JA", as_of: "2026-10-30T15:41:00.000Z" },
      "@sources": ["storefront-rds.card_images"],
    });
    expect(body._links.federation).toBeNull();
  });

  it.each([
    ["op-op01-083-ja", none("none_plain", ["OP-OP01-083-JP-V11X9"]), "none_plain"],
    ["op-op01-001-en", none("no_listing"), "no_listing"],
    ["nonsense", none("unknown_sku"), "unknown_sku"],
  ])("%s is a 404 that says why and where to look", async (sku, lookup, reason) => {
    catalogue.mockResolvedValue(lookup);
    const response = await get(sku);
    expect(response.status).toBe(404);
    const { error } = await response.json();
    expect(error).toMatchObject({ code: "card_not_found", details: { sku, reason } });
    expect(error.details.listings).toEqual((lookup.absence?.listings ?? []).map((s) => ({ sku: s, url: `/api/v1/universal/card/${s}` })));
    expect(error.details.search).toMatch(/^\/api\/v1\/search\/cards\?game=op&q=OP01-/);
  });

  it("is a 503 when the catalogue could not be read, and asks the publisher's list nothing", async () => {
    catalogue.mockResolvedValue({ card: null, source: "unavailable", absence: null });
    const response = await get("op-op01-001-ja");
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("source_unavailable");
    expect(media).not.toHaveBeenCalled();
  });
});

describe("GET /api/at/[date]/card/[sku]", () => {
  const at = (sku: string) => dated(new NextRequest(`https://cambridgetcg.example/api/at/2026-03-15/card/${sku}`), { params: Promise.resolve({ date: "2026-03-15", sku }) });
  it("answers the published SKU through the same lookup, and explains a missing one", async () => {
    catalogue.mockResolvedValue(found());
    const response = await at("op-op01-001-ja");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ variant: null, sku_match: { matched_by: "plain_listing" }, name: { natural_token: "ロロノア・ゾロ" } });
    catalogue.mockResolvedValue(none("no_listing"));
    expect((await at("op-op01-999-ja")).status).toBe(404);
  });
});
