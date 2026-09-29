import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { fetchPrices } from "@/lib/wholesale/client";
import { getStarterDeck, totalMainDeckCards } from "./starter-decks";
import { resolveStarter } from "./starter-resolve";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ fetchPrices: vi.fn() }));

const starterId = "st-01-red-luffy";
const number = "ST01-001";
const image = {
  sku: "OP-ST01-001-EN-P1", lang: "en", source: "bandai-en", kind: "official_sample",
  takedown_status: "clear", s3_key: "official/OP-ST01-001-EN-P1.png",
  attribution: "© Example publisher", source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/ST01-001_p1.png",
  retrieved_at: "2026-07-13T10:00:00Z",
};
const catalogUrl = "https://jp-op-photos.s3.us-east-1.amazonaws.com/ST01/001.jpg";
const catalog = { sku: "OP-ST01-001-JP-V1", card_number: number, name: "Catalog leader", set_code: "ST01", image_url: catalogUrl };

function rows(images: unknown[] = [], texts: unknown[] = [], artists: unknown[] = []) {
  vi.mocked(query).mockImplementation(async (sql) => ({
    rows: String(sql).includes("FROM card_images") ? images : String(sql).includes("FROM card_texts") ? texts : artists,
  }) as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchPrices).mockResolvedValue({ items: [], total: 0 } as never);
  rows();
});

describe("starter media resolution", () => {
  it("keeps a complete encoded deck and honest card-number relationship without a catalog match", async () => {
    rows([image]);
    const result = (await resolveStarter(starterId))!;
    expect(result.leader).toMatchObject({
      resolved: false, sku: null, card_number: number,
      image_url: expect.stringContaining("/official/OP-ST01-001-EN-P1.png"),
      image_attribution: image.attribution,
      image_reference: {
        requested_game: "op", requested_card_number: number,
        depicted_sku: image.sku, relationship: "reference", scope: "syntax_only",
      },
    });
    expect(result.cards.reduce((sum, card) => sum + card.quantity, 0)).toBe(totalMainDeckCards(getStarterDeck(starterId)!));
    expect(result.cards.every((card) => !card.resolved)).toBe(true);
  });

  it("prefers an eligible unsuffixed reference, then numeric reprints, then parallels independently of row order", async () => {
    const base = { ...image, sku: "OP-ST01-001-EN", s3_key: "official/base.png" };
    const r2 = { ...image, sku: "OP-ST01-001-EN-R2", s3_key: "official/r2.png" };
    const r10 = { ...image, sku: "OP-ST01-001-EN-R10", s3_key: "official/r10.png" };
    rows([image, r10, r2, base]);
    expect((await resolveStarter(starterId))?.leader.image_reference?.depicted_sku).toBe(base.sku);
    rows([image, r10, { ...base, takedown_status: "removed" }, r2]);
    const first = (await resolveStarter(starterId))?.leader;
    rows([r2, image, r10]);
    expect((await resolveStarter(starterId))?.leader).toEqual(first);
    expect(first?.image_reference?.depicted_sku).toBe(r2.sku);
  });

  it("uses newest eligible stored evidence for a tied variant and withholds incoherent rows", async () => {
    rows([
      { ...image, retrieved_at: "2026-09-30T00:00:00Z", attribution: " " },
      image,
      { ...image, retrieved_at: "2026-09-29T00::00:00Z", s3_key: "official/invalid-date.png" },
      { ...image, retrieved_at: "2026-09-28T00:00:00Z", s3_key: "official/new.png" },
      { ...image, sku: "DBF-ST01-001-EN", s3_key: "official/other-game.png" },
    ]);
    expect((await resolveStarter(starterId))?.leader.image_url).toMatch(/\/official\/new\.png$/);
  });

  it("keeps an allowed catalogue photo separate from official reference metadata", async () => {
    vi.mocked(fetchPrices).mockResolvedValue({ items: [catalog], total: 1 } as never);
    rows([image]);
    expect((await resolveStarter(starterId))?.leader).toMatchObject({
      resolved: true, sku: catalog.sku, image_url: catalogUrl, image_attribution: null, image_reference: null,
    });
  });

  it("withholds an arbitrary catalogue URL and uses eligible attributed reference art", async () => {
    vi.mocked(fetchPrices).mockResolvedValue({ items: [{ ...catalog, image_url: "https://external.example/card.png" }], total: 1 } as never);
    rows([image]);
    expect((await resolveStarter(starterId))?.leader).toMatchObject({
      resolved: true, image_attribution: image.attribution, image_reference: { depicted_sku: image.sku },
    });
  });

  it("does not resolve a matching card number from another game's SKU", async () => {
    vi.mocked(fetchPrices).mockResolvedValue({ items: [{ ...catalog, sku: "DBF-ST01-001-EN" }], total: 1 } as never);
    expect((await resolveStarter(starterId))?.leader).toMatchObject({ resolved: false, sku: null, image_url: null });
  });

  it("preserves existing attributed text while guarding source and blank copyright", async () => {
    const text = { ...image, sku: "OP-ST01-001-EN", effect_text: "Example effect" };
    rows([], [text]);
    expect((await resolveStarter(starterId))?.leader).toMatchObject({ effect_text: text.effect_text, text_attribution: image.attribution });
    for (const invalid of [{ ...text, attribution: " " }, { ...text, source: "unreviewed" }, { ...text, effect_text: " " }]) {
      rows([], [invalid]);
      expect((await resolveStarter(starterId))?.leader).toMatchObject({ effect_text: null, text_attribution: null });
    }
  });

  it("degrades all unavailable enhancements to complete text-face cards", async () => {
    vi.mocked(fetchPrices).mockRejectedValue(new Error("fixture unavailable"));
    vi.mocked(query).mockRejectedValue(new Error("fixture unavailable"));
    const result = (await resolveStarter(starterId))!;
    expect(result.leader).toMatchObject({ image_url: null, image_attribution: null, image_reference: null, effect_text: null });
    expect(result.cards.reduce((sum, card) => sum + card.quantity, 0)).toBe(50);
  });

  it("narrows image, text and artist queries to the recorded game/source boundaries", async () => {
    await resolveStarter(starterId);
    const calls = vi.mocked(query).mock.calls.map(([sql]) => String(sql));
    expect(calls.find((sql) => sql.includes("FROM card_images"))).toContain("upper(split_part(sku, '-', 1)) = 'OP'");
    expect(calls.find((sql) => sql.includes("FROM card_images"))).toContain("source = 'bandai-en'");
    expect(calls.find((sql) => sql.includes("FROM card_texts"))).toContain("source = 'bandai-en'");
    expect(calls.find((sql) => sql.includes("FROM card_set_cards"))).toContain("upper(split_part(sku, '-', 1)) = ANY($3)");
    const artistArgs = vi.mocked(query).mock.calls.find(([sql]) => String(sql).includes("FROM card_set_cards"))?.[1];
    expect(artistArgs?.[2]).toEqual(expect.arrayContaining(["OP", "EB", "ST", "P", "PRB", "DON"]));
    expect(artistArgs?.[2]).not.toContain("DBF");
  });

  it("returns unknown starters without database or source calls", async () => {
    expect(await resolveStarter("not-a-starter")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(fetchPrices).not.toHaveBeenCalled();
  });
});
