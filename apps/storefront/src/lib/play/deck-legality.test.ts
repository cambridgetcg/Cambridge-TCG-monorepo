// Deck-construction rules per Comprehensive Rules v1.2.0 + the official
// banned/restricted page — see docs/research/optcg-rules-alignment.md.

import { describe, expect, it } from "vitest";
import {
  checkDeckLegality,
  type CardMetadata,
  type DeckDeclaration,
} from "./deck-legality";

function meta(
  card_id: string,
  overrides: Partial<CardMetadata> = {},
): [string, CardMetadata] {
  return [
    card_id,
    {
      card_id,
      category: "character",
      colors: ["red"],
      set_code: card_id.split("-")[0],
      counter: 1000,
      cost: 2,
      ...overrides,
    },
  ];
}

function legalDeck(): { decl: DeckDeclaration; lookup: Map<string, CardMetadata> } {
  const cardIds = Array.from({ length: 13 }, (_, i) => `OP02-${String(i + 10).padStart(3, "0")}`);
  const lookup = new Map<string, CardMetadata>([
    meta("OP02-001", { category: "leader", colors: ["red"], life: 6 }),
    ...cardIds.map((id) => meta(id)),
  ]);
  // 12 cards ×4 + 1 card ×2 = 50
  const main = [
    ...cardIds.slice(0, 12).flatMap((id) => [id, id, id, id]),
    cardIds[12],
    cardIds[12],
  ];
  return {
    decl: { leader_id: "OP02-001", main_deck_card_ids: main, format: "standard" },
    lookup,
  };
}

describe("CR 5-1-2 — construction basics", () => {
  it("accepts a legal 50-card mono-color deck", () => {
    const { decl, lookup } = legalDeck();
    const r = checkDeckLegality(decl, lookup);
    expect(r.violations).toEqual([]);
    expect(r.legal).toBe(true);
  });

  it("CR 5-1-2-2: rejects an off-color card", () => {
    const { decl, lookup } = legalDeck();
    lookup.set(...meta("OP02-010", { colors: ["blue"] }));
    const r = checkDeckLegality(decl, lookup);
    expect(r.violations.some((v) => v.code === "card_color_mismatch_with_leader")).toBe(true);
  });

  it("CR 2-3-5: a dual-color card sharing one leader color is legal", () => {
    const { decl, lookup } = legalDeck();
    lookup.set(...meta("OP02-010", { colors: ["blue", "red"] }));
    const r = checkDeckLegality(decl, lookup);
    expect(r.legal).toBe(true);
  });
});

describe("official banlist (effective 2026-04-10)", () => {
  it("rejects a banned main-deck card", () => {
    const { decl, lookup } = legalDeck();
    lookup.set(...meta("OP03-040", { colors: ["red"] })); // banned Nami
    decl.main_deck_card_ids = [...decl.main_deck_card_ids.slice(0, 49), "OP03-040"];
    const r = checkDeckLegality(decl, lookup);
    expect(r.violations.some((v) => v.code === "card_banned" && v.card_id === "OP03-040")).toBe(true);
  });

  it("rejects a banned leader", () => {
    const { decl, lookup } = legalDeck();
    lookup.set(...meta("ST10-001", { category: "leader", colors: ["red"], life: 5 }));
    decl.leader_id = "ST10-001"; // banned Trafalgar Law leader
    const r = checkDeckLegality(decl, lookup);
    expect(r.violations.some((v) => v.code === "card_banned" && v.card_id === "ST10-001")).toBe(true);
  });

  it("rejects a banned pair used together", () => {
    const { decl, lookup } = legalDeck();
    lookup.set(...meta("OP11-040", { colors: ["red"] }));
    lookup.set(...meta("OP11-067", { colors: ["red"] }));
    decl.main_deck_card_ids = [
      ...decl.main_deck_card_ids.slice(0, 48),
      "OP11-040",
      "OP11-067",
    ];
    const r = checkDeckLegality(decl, lookup);
    expect(r.violations.some((v) => v.code === "banned_pair_present")).toBe(true);
  });
});

describe("no invented formats", () => {
  it("OP01-era cards are legal — the official game has no block rotation", () => {
    const { decl, lookup } = legalDeck();
    lookup.set(...meta("OP01-025", { colors: ["red"] }));
    decl.main_deck_card_ids = [...decl.main_deck_card_ids.slice(0, 49), "OP01-025"];
    const r = checkDeckLegality(decl, lookup);
    expect(r.legal).toBe(true);
  });
});
