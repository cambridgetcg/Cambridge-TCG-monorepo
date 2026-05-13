/**
 * Tests for the anchor extraction + composition layer.
 *
 * Coverage:
 *   1. Per-source extractors (scryfall / cardmarket / tcgplayer / ygoprodeck / pokemon-tcg-api)
 *   2. extractAnchorsForSource dispatch (known + unknown source)
 *   3. buildAnchorRow composition for each pattern (A / B / C / D)
 *   4. Context override precedence (writer-supplied passcode wins)
 *   5. requiresExternalAnchor predicate
 *
 * Kingdom 2 of the substrate-honest aggregator plan.
 */

import { describe, it, expect } from "vitest";
import type { CanonicalCard } from "../canonical";
import {
  extractScryfallAnchors,
  extractCardmarketAnchors,
  extractTcgplayerAnchors,
  extractYgoprodeckAnchors,
  extractPokemonTcgApiAnchors,
  extractAnchorsForSource,
  buildAnchorRow,
  requiresExternalAnchor,
} from "../anchors";

// ── Fixture builders ─────────────────────────────────────────────────

function mtgScryfallRecord(overrides: Partial<CanonicalCard> = {}): CanonicalCard {
  return {
    sku: "mtg-otj-001-en",
    game: "mtg",
    set: "otj",
    number: "001",
    lang: "en",
    name: "Otters of the Plains",
    upstream_id: "abcd1234-card-uuid",
    extra: {
      oracle_id: "wxyz5678-oracle-uuid",
      scryfall_set: "otj",
      scryfall_number: "001",
      scryfall_lang: "en",
    },
    ...overrides,
  };
}

function ygoRecord(overrides: Partial<CanonicalCard> = {}): CanonicalCard {
  return {
    sku: "ygo-lob-001-en",
    game: "ygo",
    set: "lob",
    number: "001",
    lang: "en",
    name: "Blue-Eyes White Dragon",
    extra: {
      passcode: "89631139",
    },
    ...overrides,
  };
}

function pkmRecord(overrides: Partial<CanonicalCard> = {}): CanonicalCard {
  return {
    sku: "pkm-sv01-001-en",
    game: "pkm",
    set: "sv01",
    number: "001",
    lang: "en",
    name: "Pikachu",
    upstream_id: "sv01-001",
    extra: {},
    ...overrides,
  };
}

function cardmarketMtgRecord(overrides: Partial<CanonicalCard> = {}): CanonicalCard {
  return {
    sku: "mtg-otj-001-de",
    game: "mtg",
    set: "otj",
    number: "001",
    lang: "de",
    name: "Otter der Prärie",
    upstream_id: "88002",
    extra: {
      cardmarket_id_metacard: 12345,
      cardmarket_id_language: 3,
    },
    ...overrides,
  };
}

function fabRecord(overrides: Partial<CanonicalCard> = {}): CanonicalCard {
  return {
    sku: "fab-mon-001-en",
    game: "fab",
    set: "mon",
    number: "001",
    lang: "en",
    name: "Some Hero",
    extra: {},
    ...overrides,
  };
}

// ── Scryfall extractor ───────────────────────────────────────────────

describe("extractScryfallAnchors", () => {
  it("reads scryfall_card_id from upstream_id and oracle_id from extra.oracle_id", () => {
    const r = extractScryfallAnchors(mtgScryfallRecord());
    expect(r.scryfall_card_id).toBe("abcd1234-card-uuid");
    expect(r.scryfall_oracle_id).toBe("wxyz5678-oracle-uuid");
  });

  it("returns null for missing upstream_id", () => {
    const r = extractScryfallAnchors(mtgScryfallRecord({ upstream_id: undefined }));
    expect(r.scryfall_card_id).toBeNull();
    expect(r.scryfall_oracle_id).toBe("wxyz5678-oracle-uuid");
  });

  it("returns null for missing extra.oracle_id", () => {
    const r = extractScryfallAnchors(mtgScryfallRecord({ extra: {} }));
    expect(r.scryfall_card_id).toBe("abcd1234-card-uuid");
    expect(r.scryfall_oracle_id).toBeNull();
  });

  it("returns null for empty string fields", () => {
    const r = extractScryfallAnchors(
      mtgScryfallRecord({ upstream_id: "", extra: { oracle_id: "" } }),
    );
    expect(r.scryfall_card_id).toBeNull();
    expect(r.scryfall_oracle_id).toBeNull();
  });
});

// ── Cardmarket extractor ─────────────────────────────────────────────

describe("extractCardmarketAnchors", () => {
  it("parses numeric idProduct from upstream_id string", () => {
    const r = extractCardmarketAnchors(cardmarketMtgRecord());
    expect(r.cardmarket_id_product).toBe(88002);
    expect(r.cardmarket_id_metacard).toBe(12345);
    expect(r.cardmarket_id_language).toBe(3);
  });

  it("returns null for non-numeric upstream_id", () => {
    const r = extractCardmarketAnchors(
      cardmarketMtgRecord({ upstream_id: "not-a-number" }),
    );
    expect(r.cardmarket_id_product).toBeNull();
  });

  it("returns null for missing upstream_id", () => {
    const r = extractCardmarketAnchors(
      cardmarketMtgRecord({ upstream_id: undefined }),
    );
    expect(r.cardmarket_id_product).toBeNull();
  });

  it("returns null for non-numeric metacard", () => {
    const r = extractCardmarketAnchors(
      cardmarketMtgRecord({ extra: { cardmarket_id_language: 3 } }),
    );
    expect(r.cardmarket_id_metacard).toBeNull();
  });

  it("returns null for missing extras (non-MTG Cardmarket card)", () => {
    const r = extractCardmarketAnchors(
      cardmarketMtgRecord({
        sku: "op-op01-001-de",
        game: "op",
        upstream_id: "77001",
        extra: { cardmarket_id_language: 3 }, // no idMetacard for OP
      }),
    );
    expect(r.cardmarket_id_product).toBe(77001);
    expect(r.cardmarket_id_metacard).toBeNull();
    expect(r.cardmarket_id_language).toBe(3);
  });
});

// ── TCGplayer extractor ──────────────────────────────────────────────

describe("extractTcgplayerAnchors", () => {
  it("reads tcgplayer_product_id and tcgplayer_group_id from extra", () => {
    const record: CanonicalCard = {
      sku: "mtg-otj-001-en",
      game: "mtg",
      set: "otj",
      number: "001",
      lang: "en",
      name: "Otters",
      extra: {
        tcgplayer_product_id: 555111,
        tcgplayer_group_id: 99,
      },
    };
    const r = extractTcgplayerAnchors(record);
    expect(r.tcgplayer_product_id).toBe(555111);
    expect(r.tcgplayer_group_id).toBe(99);
  });

  it("returns null for missing fields", () => {
    const r = extractTcgplayerAnchors({
      sku: "mtg-otj-001-en",
      game: "mtg",
      set: "otj",
      number: "001",
      lang: "en",
      name: "Otters",
      extra: {},
    });
    expect(r.tcgplayer_product_id).toBeNull();
    expect(r.tcgplayer_group_id).toBeNull();
  });
});

// ── YGOPRODeck extractor ─────────────────────────────────────────────

describe("extractYgoprodeckAnchors", () => {
  it("reads numeric-string passcode from extra", () => {
    const r = extractYgoprodeckAnchors(ygoRecord());
    expect(r.ygo_passcode).toBe("89631139");
  });

  it("accepts numeric passcode and stringifies it", () => {
    const r = extractYgoprodeckAnchors(
      ygoRecord({ extra: { passcode: 89631139 } }),
    );
    expect(r.ygo_passcode).toBe("89631139");
  });

  it("returns null for non-numeric passcode", () => {
    const r = extractYgoprodeckAnchors(
      ygoRecord({ extra: { passcode: "not-a-number" } }),
    );
    expect(r.ygo_passcode).toBeNull();
  });

  it("returns null for missing passcode", () => {
    const r = extractYgoprodeckAnchors(ygoRecord({ extra: {} }));
    expect(r.ygo_passcode).toBeNull();
  });
});

// ── Pokémon TCG API extractor ────────────────────────────────────────

describe("extractPokemonTcgApiAnchors", () => {
  it("reads upstream_id as the pokemon-tcg-api id", () => {
    const r = extractPokemonTcgApiAnchors(pkmRecord());
    expect(r.pokemon_tcg_api_id).toBe("sv01-001");
  });

  it("returns null for missing upstream_id", () => {
    const r = extractPokemonTcgApiAnchors(pkmRecord({ upstream_id: undefined }));
    expect(r.pokemon_tcg_api_id).toBeNull();
  });
});

// ── Dispatcher ───────────────────────────────────────────────────────

describe("extractAnchorsForSource", () => {
  it("dispatches to scryfall extractor", () => {
    const r = extractAnchorsForSource("scryfall", mtgScryfallRecord());
    expect(r).toMatchObject({
      scryfall_card_id: "abcd1234-card-uuid",
      scryfall_oracle_id: "wxyz5678-oracle-uuid",
    });
  });

  it("dispatches to cardmarket extractor", () => {
    const r = extractAnchorsForSource("cardmarket", cardmarketMtgRecord());
    expect(r).toMatchObject({
      cardmarket_id_product: 88002,
      cardmarket_id_metacard: 12345,
      cardmarket_id_language: 3,
    });
  });

  it("dispatches to ygoprodeck extractor", () => {
    const r = extractAnchorsForSource("ygoprodeck", ygoRecord());
    expect(r).toMatchObject({ ygo_passcode: "89631139" });
  });

  it("dispatches to pokemon-tcg-api extractor", () => {
    const r = extractAnchorsForSource("pokemon-tcg-api", pkmRecord());
    expect(r).toMatchObject({ pokemon_tcg_api_id: "sv01-001" });
  });

  it("returns empty object for unknown source", () => {
    expect(extractAnchorsForSource("unknown-source", mtgScryfallRecord()))
      .toEqual({});
  });
});

// ── buildAnchorRow — Pattern A ───────────────────────────────────────

describe("buildAnchorRow — Pattern A (stripped, multi-language)", () => {
  it("derives MTG oracle from SKU + populates scryfall anchors", () => {
    const row = buildAnchorRow("scryfall", mtgScryfallRecord());
    expect(row.oracle_id).toBe("mtg-otj-001");
    expect(row.oracle_source).toBe("derived-stripped");
    expect(row.scryfall_card_id).toBe("abcd1234-card-uuid");
    expect(row.scryfall_oracle_id).toBe("wxyz5678-oracle-uuid");
  });

  it("derives Lorcana oracle from a cardmarket-sourced FR card", () => {
    const row = buildAnchorRow("cardmarket", cardmarketMtgRecord({
      sku: "lgr-1-001-fr",
      game: "lgr",
      set: "1",
      lang: "fr",
      number: "001",
    }));
    expect(row.oracle_id).toBe("lgr-1-001");
    expect(row.oracle_source).toBe("derived-stripped");
    expect(row.cardmarket_id_product).toBe(88002);
  });

  it("does not populate non-current-source anchors", () => {
    const row = buildAnchorRow("scryfall", mtgScryfallRecord());
    // Cardmarket and TCGplayer fields should be undefined (not null) so
    // the writer's UPDATE doesn't clobber existing values.
    expect(row.cardmarket_id_metacard).toBeUndefined();
    expect(row.tcgplayer_product_id).toBeUndefined();
    expect(row.ygo_passcode).toBeUndefined();
  });
});

// ── buildAnchorRow — Pattern B ───────────────────────────────────────

describe("buildAnchorRow — Pattern B (passcode)", () => {
  it("derives YGO oracle from passcode in the record's extra", () => {
    const row = buildAnchorRow("ygoprodeck", ygoRecord());
    expect(row.oracle_id).toBe("ygo-89631139");
    expect(row.oracle_source).toBe("ygo-passcode");
    expect(row.ygo_passcode).toBe("89631139");
  });

  it("returns null oracle when passcode missing", () => {
    const row = buildAnchorRow("ygoprodeck", ygoRecord({ extra: {} }));
    expect(row.oracle_id).toBeNull();
    expect(row.oracle_source).toBeNull();
    expect(row.ygo_passcode).toBeNull();
  });

  it("uses context.ygo_passcode override when record has none", () => {
    const row = buildAnchorRow(
      "ygoprodeck",
      ygoRecord({ extra: {} }),
      { ygo_passcode: "12345678" },
    );
    expect(row.oracle_id).toBe("ygo-12345678");
    expect(row.ygo_passcode).toBe("12345678");
  });

  it("context.ygo_passcode overrides record-supplied passcode", () => {
    const row = buildAnchorRow(
      "ygoprodeck",
      ygoRecord(), // record has 89631139
      { ygo_passcode: "00000001" }, // context overrides
    );
    expect(row.ygo_passcode).toBe("00000001");
    expect(row.oracle_id).toBe("ygo-00000001");
  });

  it("context.ygo_passcode = null suppresses the record's passcode", () => {
    const row = buildAnchorRow(
      "ygoprodeck",
      ygoRecord(),
      { ygo_passcode: null },
    );
    expect(row.oracle_id).toBeNull();
    expect(row.ygo_passcode).toBeNull();
  });
});

// ── buildAnchorRow — Pattern C ───────────────────────────────────────

describe("buildAnchorRow — Pattern C (diverged)", () => {
  it("returns null oracle for Pokémon by default", () => {
    const row = buildAnchorRow("pokemon-tcg-api", pkmRecord());
    expect(row.oracle_id).toBeNull();
    expect(row.oracle_source).toBeNull();
    expect(row.pokemon_tcg_api_id).toBe("sv01-001");
  });
});

// ── buildAnchorRow — Pattern D ───────────────────────────────────────

describe("buildAnchorRow — Pattern D (single-lang)", () => {
  it("derives FaB oracle via stripped form", () => {
    const row = buildAnchorRow("scryfall", fabRecord());
    expect(row.oracle_id).toBe("fab-mon-001");
    expect(row.oracle_source).toBe("derived-stripped");
  });
});

// ── Variant preservation ─────────────────────────────────────────────

describe("buildAnchorRow — variant preservation", () => {
  it("preserves variant on the oracle for Pattern A", () => {
    const row = buildAnchorRow(
      "scryfall",
      mtgScryfallRecord({ sku: "mtg-otj-001-en-foil", variant: "foil" }),
    );
    expect(row.oracle_id).toBe("mtg-otj-001-foil");
  });

  it("preserves variant on the oracle for Pattern B", () => {
    const row = buildAnchorRow(
      "ygoprodeck",
      ygoRecord({ sku: "ygo-lob-001-en-1st", variant: "1st" }),
    );
    expect(row.oracle_id).toBe("ygo-89631139-1st");
  });
});

// ── requiresExternalAnchor ───────────────────────────────────────────

describe("requiresExternalAnchor", () => {
  it("returns true for ygo", () => {
    expect(requiresExternalAnchor("ygo")).toBe(true);
  });

  it("returns true for Rush Duel", () => {
    expect(requiresExternalAnchor("rsh")).toBe(true);
  });

  it("returns false for Pattern A games", () => {
    expect(requiresExternalAnchor("mtg")).toBe(false);
    expect(requiresExternalAnchor("op")).toBe(false);
    expect(requiresExternalAnchor("lgr")).toBe(false);
  });

  it("returns false for Pattern C games", () => {
    expect(requiresExternalAnchor("pkm")).toBe(false);
  });

  it("returns false for Pattern D games", () => {
    expect(requiresExternalAnchor("fab")).toBe(false);
  });
});

// ── Round-trip: oracle_id ↔ source ──────────────────────────────────

describe("oracle_id / oracle_source null parity", () => {
  it("source is null iff oracle_id is null across all records", () => {
    const samples = [
      buildAnchorRow("scryfall", mtgScryfallRecord()),
      buildAnchorRow("scryfall", mtgScryfallRecord({ sku: "mtg-otj-001-ja", lang: "ja" })),
      buildAnchorRow("cardmarket", cardmarketMtgRecord()),
      buildAnchorRow("ygoprodeck", ygoRecord()),
      buildAnchorRow("ygoprodeck", ygoRecord({ extra: {} })),
      buildAnchorRow("pokemon-tcg-api", pkmRecord()),
      buildAnchorRow("scryfall", fabRecord()),
    ];
    for (const row of samples) {
      expect(row.oracle_source === null).toBe(row.oracle_id === null);
    }
  });
});
