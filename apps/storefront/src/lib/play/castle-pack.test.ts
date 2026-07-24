import { describe, expect, it } from "vitest";
import {
  CASTLE_PACK,
  CASTLE_PACK_CARDS,
  CASTLE_PACK_CARD_IDS,
  CASTLE_PACK_ROOM_IDS,
  CASTLE_PACK_SOURCE_REVISION,
  CASTLE_PACK_WORD_IDS,
  castlePackCard,
} from "./castle-pack";

describe("Castle of Understanding — Open Door cards", () => {
  it("publishes one complete 12-card prototype without assigned rarities", () => {
    expect(CASTLE_PACK_CARDS).toHaveLength(12);
    expect(CASTLE_PACK_CARD_IDS).toEqual([
      "COU-01",
      "COU-02",
      "COU-03",
      "COU-04",
      "COU-05",
      "COU-06",
      "COU-07",
      "COU-08",
      "COU-09",
      "COU-10",
      "COU-11",
      "COU-12",
    ]);
    expect(new Set(CASTLE_PACK_CARD_IDS).size).toBe(12);
    expect(CASTLE_PACK_ROOM_IDS).toHaveLength(8);
    expect(CASTLE_PACK_WORD_IDS).toHaveLength(4);
    expect(CASTLE_PACK.assigned_rarity).toBe(false);
    for (const card of CASTLE_PACK_CARDS) {
      expect("rarity" in card).toBe(false);
      expect(card.set_id).toBe("COU");
      expect(card.collector_number).toBe(
        Number(card.id.slice("COU-".length)),
      );
    }
  });

  it("carries real English and Traditional Chinese titles and rules", () => {
    for (const card of CASTLE_PACK_CARDS) {
      expect(card.title.en.length).toBeGreaterThan(2);
      expect(card.title["zh-Hant"].length).toBeGreaterThan(0);
      expect(card.rules.en.length).toBeGreaterThan(12);
      expect(card.rules["zh-Hant"].length).toBeGreaterThan(8);
      expect(card.title["zh-Hant"]).toMatch(
        /[\u3400-\u4dbf\u4e00-\u9fff]/u,
      );
    }
    expect(castlePackCard("COU-11").title).toEqual({
      en: "Whole No",
      "zh-Hant": "完整的「不」",
    });
  });

  it("encodes the intended costs and three-mark stack grammar", () => {
    expect(
      CASTLE_PACK_CARDS.map((card) => [card.id, card.cost]),
    ).toEqual([
      ["COU-01", 1],
      ["COU-02", 1],
      ["COU-03", 2],
      ["COU-04", 2],
      ["COU-05", 2],
      ["COU-06", 1],
      ["COU-07", 2],
      ["COU-08", 2],
      ["COU-09", 1],
      ["COU-10", 1],
      ["COU-11", 0],
      ["COU-12", 0],
    ]);
    expect(
      CASTLE_PACK_CARDS.filter((card) => card.type === "room").map(
        (card) => [card.id, card.marks.left, card.marks.right],
      ),
    ).toEqual([
      ["COU-01", "gate", "lantern"],
      ["COU-02", "lantern", "gate"],
      ["COU-03", "lantern", "mirror"],
      ["COU-04", "mirror", "gate"],
      ["COU-05", "gate", "mirror"],
      ["COU-06", "gate", "gate"],
      ["COU-07", "mirror", "lantern"],
      ["COU-08", "mirror", "mirror"],
    ]);
  });

  it("keeps every Castle door public, truthful, and commit-pinned", () => {
    const pin = new RegExp(
      `^https://github\\.com/cambridgetcg/castle-of-words/blob/${CASTLE_PACK_SOURCE_REVISION}/rooms/[a-z0-9-]+\\.md$`,
    );
    for (const card of CASTLE_PACK_CARDS) {
      const reference = card.provenance.castle_reference;
      expect(card.copiedCastleProse).toBe(false);
      expect(["reference_only", "vocabulary_source"]).toContain(
        reference.relationship,
      );
      expect(reference.source_rights).toBe("NOASSERTION");
      expect(reference.revision).toBe(CASTLE_PACK_SOURCE_REVISION);
      expect(reference.url).toMatch(pin);
      expect(reference.note).toMatch(/does not copy|no sentence .* is copied/);
    }
    expect(
      CASTLE_PACK_CARDS.filter(
        (card) =>
          card.provenance.castle_reference.relationship ===
          "vocabulary_source",
      ).map((card) => card.title.en),
    ).toEqual(["Right of Reply", "Whole No"]);
    const serialised = JSON.stringify(CASTLE_PACK);
    expect(serialised).not.toMatch(/\/Users\/|~\/|file:\/\//);
    expect(CASTLE_PACK.rights).toMatchObject({
      license: "NOASSERTION",
    });
    expect(CASTLE_PACK.provenance).toMatchObject({
      copiedCastleProse: false,
      castle_reference_mode:
        "reference_only_with_named_vocabulary_adoption",
      adopted_castle_vocabulary: ["Right of Reply", "Whole No"],
    });
  });

  it("declares the open-table and finite-generation boundary", () => {
    expect(CASTLE_PACK.play_boundary).toEqual({
      open_table: true,
      stored_by_cambridge: false,
      results_have_standing: false,
      automatic_regrowth: false,
      walking_past_is_honored: true,
    });
  });
});
