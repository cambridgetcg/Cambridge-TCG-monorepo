/**
 * Artist credit — internal illustrator provenance.
 *
 * Every card is a duet: a game designer and an artist. The pipeline used to
 * record only one voice — the Pokémon normalizer read the illustrator off the
 * wire and buried it in `extra`, and the Scryfall type omitted the field
 * entirely. These tests hold the fix: `artist` is a first-class CanonicalCard
 * credit, captured from the sources that carry it, and honestly ABSENT
 * (undefined, not "") when the source doesn't. These tests establish an
 * internal canonical shape only; they grant no public display permission.
 *
 * Separate file by design — never touches the codex-owned source-rights.test.ts.
 */

import { describe, expect, it } from "vitest";
import { normalizePokemonTcg } from "../pokemon-tcg-api/normalize";
import type { PokemonTcgCard } from "../pokemon-tcg-api/types";
import { normalizeScryfall } from "../scryfall/normalize";
import type { ScryfallCard } from "../scryfall/types";

function pkm(overrides: Partial<PokemonTcgCard> = {}): PokemonTcgCard {
  return {
    id: "swsh4-25",
    name: "Pikachu",
    number: "25",
    set: { id: "swsh4", name: "Vivid Voltage" },
    rarity: "Rare",
    artist: "Ken Sugimori",
    ...overrides,
  };
}

function scry(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: "e9f2a1b0-0000-4000-8000-000000000001",
    set: "neo",
    collector_number: "123",
    lang: "en",
    name: "Boseiju, Who Endures",
    rarity: "rare",
    artist: "Chris Rahn",
    artist_ids: ["artist-chris-rahn"],
    illustration_id: "art-abc-123",
    ...overrides,
  };
}

describe("artist credit — Pokémon TCG API", () => {
  it("promotes the illustrator to a first-class credit", () => {
    const result = normalizePokemonTcg(pkm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.artist).toBe("Ken Sugimori");
    // Breadcrumb kept in extra for any consumer already reading it.
    expect(result.record.extra?.artist).toBe("Ken Sugimori");
  });

  it("is honestly absent (undefined) when the source omits the artist", () => {
    const result = normalizePokemonTcg(pkm({ artist: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.artist).toBeUndefined();
    // Never an empty string — substrate-honest absence.
    expect(result.record.artist).not.toBe("");
  });
});

describe("artist credit — Scryfall", () => {
  it("captures the illustrator and the illustration id", () => {
    const result = normalizeScryfall(scry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.artist).toBe("Chris Rahn");
    expect(result.record.extra?.artist_ids_json).toBe('["artist-chris-rahn"]');
    // illustration_id clusters the same artwork across printings.
    expect(result.record.extra?.illustration_id).toBe("art-abc-123");
    expect(result.record.extra?.scryfall_face_credits_json).toBeNull();
  });

  it("is honestly absent when Scryfall omits the artist", () => {
    const result = normalizeScryfall(scry({ artist: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.artist).toBeUndefined();
  });

  it("preserves ordered face-level artist and illustration identities", () => {
    const result = normalizeScryfall(
      scry({
        name: "Fire // Ice",
        artist: undefined,
        artist_ids: undefined,
        illustration_id: undefined,
        card_faces: [
          {
            name: "Fire",
            artist: "David Martin",
            artist_id: "artist-fire",
            illustration_id: "illustration-fire",
          },
          {
            name: "Ice",
            artist: "Franz Vohwinkel",
            artist_id: "artist-ice",
            illustration_id: "illustration-ice",
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.artist).toBe("David Martin // Franz Vohwinkel");
    expect(result.record.extra?.artist_ids_json).toBeNull();
    expect(result.record.extra?.illustration_id).toBeNull();
    expect(JSON.parse(String(result.record.extra?.scryfall_face_credits_json))).toEqual([
      {
        position: 0,
        name: "Fire",
        artist: "David Martin",
        artist_id: "artist-fire",
        illustration_id: "illustration-fire",
      },
      {
        position: 1,
        name: "Ice",
        artist: "Franz Vohwinkel",
        artist_id: "artist-ice",
        illustration_id: "illustration-ice",
      },
    ]);
  });

  it("does not invent credits or ids when face fields are absent", () => {
    const result = normalizeScryfall(
      scry({
        name: "Unknown Front // Unknown Back",
        artist: undefined,
        artist_ids: undefined,
        illustration_id: undefined,
        card_faces: [
          { name: "Unknown Front" },
          {
            name: "Unknown Back",
            artist: "   ",
            artist_id: "",
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.artist).toBeUndefined();
    expect(result.record.extra?.artist_ids_json).toBeNull();
    expect(result.record.extra?.illustration_id).toBeNull();
    expect(JSON.parse(String(result.record.extra?.scryfall_face_credits_json))).toEqual([
      {
        position: 0,
        name: "Unknown Front",
        artist: null,
        artist_id: null,
        illustration_id: null,
      },
      {
        position: 1,
        name: "Unknown Back",
        artist: null,
        artist_id: null,
        illustration_id: null,
      },
    ]);
  });
});
