/**
 * Tests for the cross-language oracle resolver.
 *
 * Coverage:
 *   1. ORACLE_POLICY completeness — every registered GameCode has a policy
 *   2. Pattern A (stripped) — multi-language same-numbering games
 *   3. Pattern B (passcode) — Yu-Gi-Oh / Rush Duel with + without anchor
 *   4. Pattern C (diverged) — Pokémon JP/EN tracks
 *   5. Pattern D (single-lang) — FaB / Sorcery / Riftbound
 *   6. Variant preservation across all kinds
 *   7. Edge cases — unparseable, empty, uppercase, unknown game
 *   8. `strippedOracleId` pure helper
 *   9. `groupByOracle` utility
 *  10. Resolution shape invariants — reason non-empty, source/oracle null-parity
 *
 * Kingdom 1 of the substrate-honest aggregator implementation plan.
 */

import { describe, it, expect } from "vitest";

import { GAME_CODES, type GameCode } from "../games";
import {
  ORACLE_POLICY,
  resolveOracle,
  strippedOracleId,
  groupByOracle,
  type OracleResolution,
} from "../oracle";

// ── ORACLE_POLICY completeness ───────────────────────────────────────

describe("ORACLE_POLICY", () => {
  it("has an entry for every registered GameCode", () => {
    for (const code of GAME_CODES) {
      const policy = ORACLE_POLICY[code];
      expect(policy, `missing oracle policy for game "${code}"`).toBeTruthy();
      expect(policy.kind, `policy for "${code}" missing kind`).toBeTruthy();
      expect(policy.rationale.trim().length, `policy for "${code}" empty rationale`)
        .toBeGreaterThan(0);
    }
  });

  it("uses only the four declared pattern kinds", () => {
    const valid = new Set(["stripped", "passcode", "diverged", "single-lang"]);
    for (const code of GAME_CODES) {
      expect(valid.has(ORACLE_POLICY[code].kind),
        `policy for "${code}" has invalid kind: ${ORACLE_POLICY[code].kind}`)
        .toBe(true);
    }
  });

  it("rationales are short enough to publish as endpoint copy", () => {
    // Heuristic: keep them under ~250 chars so they fit comfortably in
    // /api/v1/oracle-policies and in methodology pages.
    for (const code of GAME_CODES) {
      expect(ORACLE_POLICY[code].rationale.length,
        `rationale too long for "${code}"`).toBeLessThan(300);
    }
  });
});

// ── Pattern A: stripped ──────────────────────────────────────────────

describe("Pattern A (stripped) — multi-language same-numbering games", () => {
  it("strips language for MTG", () => {
    const r = resolveOracle("mtg-otj-001-en");
    expect(r.oracle_id).toBe("mtg-otj-001");
    expect(r.source).toBe("derived-stripped");
    expect(r.confidence).toBe("high");
    expect(r.policy.kind).toBe("stripped");
  });

  it("strips language for One Piece", () => {
    const r = resolveOracle("op-op01-001-ja");
    expect(r.oracle_id).toBe("op-op01-001");
    expect(r.source).toBe("derived-stripped");
  });

  it("strips language for Lorcana", () => {
    expect(resolveOracle("lgr-1-001-fr").oracle_id).toBe("lgr-1-001");
  });

  it("strips language for Star Wars Unlimited", () => {
    expect(resolveOracle("swu-sor-001-de").oracle_id).toBe("swu-sor-001");
  });

  it("strips language for Digimon (Bandai)", () => {
    expect(resolveOracle("dmw-bt01-001-en").oracle_id).toBe("dmw-bt01-001");
  });

  it("preserves single-token variant on the oracle (foil)", () => {
    const en = resolveOracle("mtg-otj-001-en-foil");
    const ja = resolveOracle("mtg-otj-001-ja-foil");
    const plain = resolveOracle("mtg-otj-001-en");

    expect(en.oracle_id).toBe("mtg-otj-001-foil");
    expect(ja.oracle_id).toBe("mtg-otj-001-foil");
    expect(plain.oracle_id).toBe("mtg-otj-001");
    expect(en.oracle_id).not.toBe(plain.oracle_id);
  });

  it("preserves multi-token variant on the oracle", () => {
    expect(resolveOracle("mtg-otj-001-en-alt-art-foil").oracle_id)
      .toBe("mtg-otj-001-alt-art-foil");
  });

  it("MTG cross-language siblings share an oracle", () => {
    const langs = ["en", "ja", "de", "fr", "it", "es", "pt", "ru", "ko", "zh"];
    const oracles = new Set(
      langs.map((l) => resolveOracle(`mtg-otj-001-${l}`).oracle_id),
    );
    expect(oracles.size).toBe(1);
    expect(oracles.has("mtg-otj-001")).toBe(true);
  });

  it("OP cross-language siblings share an oracle", () => {
    const oracles = new Set(
      ["ja", "en", "zh", "ko"].map(
        (l) => resolveOracle(`op-op01-001-${l}`).oracle_id,
      ),
    );
    expect(oracles.size).toBe(1);
    expect(oracles.has("op-op01-001")).toBe(true);
  });

  it("different numbers in the same set produce different oracles", () => {
    const a = resolveOracle("mtg-otj-001-en").oracle_id;
    const b = resolveOracle("mtg-otj-002-en").oracle_id;
    expect(a).not.toBe(b);
  });
});

// ── Pattern B: passcode ──────────────────────────────────────────────

describe("Pattern B (passcode) — Yu-Gi-Oh and Rush Duel", () => {
  it("produces a passcode-anchored oracle when passcode provided", () => {
    const r = resolveOracle("ygo-lob-001-en", { ygo_passcode: "89631139" });
    expect(r.oracle_id).toBe("ygo-89631139");
    expect(r.source).toBe("ygo-passcode");
    expect(r.confidence).toBe("high");
    expect(r.policy.kind).toBe("passcode");
  });

  it("returns null with reason when passcode missing", () => {
    const r = resolveOracle("ygo-lob-001-en");
    expect(r.oracle_id).toBeNull();
    expect(r.source).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/passcode required/);
  });

  it("returns null when passcode is empty string", () => {
    expect(resolveOracle("ygo-lob-001-en", { ygo_passcode: "" }).oracle_id)
      .toBeNull();
  });

  it("returns null when passcode is whitespace", () => {
    expect(resolveOracle("ygo-lob-001-en", { ygo_passcode: "   " }).oracle_id)
      .toBeNull();
  });

  it("returns null when passcode is explicitly null", () => {
    expect(resolveOracle("ygo-lob-001-en", { ygo_passcode: null }).oracle_id)
      .toBeNull();
  });

  it("trims whitespace from the passcode", () => {
    expect(resolveOracle("ygo-lob-001-en", { ygo_passcode: "  89631139  " }).oracle_id)
      .toBe("ygo-89631139");
  });

  it("preserves variant on passcode oracle", () => {
    expect(resolveOracle("ygo-lob-001-en-1st", { ygo_passcode: "89631139" }).oracle_id)
      .toBe("ygo-89631139-1st");
  });

  it("YGO cross-printing cross-language siblings share an oracle via passcode", () => {
    const passcode = "89631139";
    const printings = [
      "ygo-lob-001-en",
      "ygo-jpr-001-ja",
      "ygo-rabb-001-de",
      "ygo-mp23-001-en",
    ];
    const oracles = new Set(
      printings.map(
        (sku) => resolveOracle(sku, { ygo_passcode: passcode }).oracle_id,
      ),
    );
    expect(oracles.size).toBe(1);
    expect(oracles.has("ygo-89631139")).toBe(true);
  });

  it("Rush Duel uses the same passcode anchor", () => {
    const r = resolveOracle("rsh-rd01-001-ja", { ygo_passcode: "12345678" });
    expect(r.source).toBe("ygo-passcode");
    expect(r.oracle_id).toBe("rsh-12345678");
  });

  it("different passcodes yield different oracles", () => {
    const bewd = resolveOracle("ygo-lob-001-en", { ygo_passcode: "89631139" });
    const dm = resolveOracle("ygo-lob-002-en", { ygo_passcode: "46986414" });
    expect(bewd.oracle_id).not.toBe(dm.oracle_id);
  });
});

// ── Pattern C: diverged ──────────────────────────────────────────────

describe("Pattern C (diverged) — Pokémon JP/EN tracks", () => {
  it("returns null with manual-equivalence reason for Pokémon", () => {
    const r = resolveOracle("pkm-sv01-001-en");
    expect(r.oracle_id).toBeNull();
    expect(r.source).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/diverged/);
    expect(r.reason).toMatch(/manual equivalence/);
    expect(r.policy.kind).toBe("diverged");
  });

  it("returns null for JP Pokémon", () => {
    expect(resolveOracle("pkm-sv1-001-ja").oracle_id).toBeNull();
  });

  it("returns null for Pokémon Pocket", () => {
    const r = resolveOracle("pkp-a1-001-en");
    expect(r.oracle_id).toBeNull();
    expect(r.policy.kind).toBe("diverged");
  });

  it("ignores ygo_passcode anchor (wrong pattern)", () => {
    expect(resolveOracle("pkm-sv01-001-en", { ygo_passcode: "89631139" }).oracle_id)
      .toBeNull();
  });
});

// ── Pattern D: single-lang ───────────────────────────────────────────

describe("Pattern D (single-lang) — single-language games", () => {
  it("strips language for Flesh and Blood", () => {
    const r = resolveOracle("fab-mon-001-en");
    expect(r.oracle_id).toBe("fab-mon-001");
    expect(r.source).toBe("derived-stripped");
    expect(r.confidence).toBe("high");
    expect(r.policy.kind).toBe("single-lang");
  });

  it("strips language for Sorcery", () => {
    const r = resolveOracle("sor-beta-001-en");
    expect(r.oracle_id).toBe("sor-beta-001");
    expect(r.policy.kind).toBe("single-lang");
  });

  it("strips language for Riftbound", () => {
    const r = resolveOracle("rft-set1-001-en");
    expect(r.oracle_id).toBe("rft-set1-001");
    expect(r.policy.kind).toBe("single-lang");
  });

  it("preserves variant for single-lang games", () => {
    expect(resolveOracle("fab-mon-001-en-cf").oracle_id).toBe("fab-mon-001-cf");
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe("edge cases", () => {
  it("returns null with reason for unparseable SKU", () => {
    const r = resolveOracle("not-a-sku");
    expect(r.oracle_id).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/unparseable/);
  });

  it("returns null for empty string", () => {
    expect(resolveOracle("").oracle_id).toBeNull();
  });

  it("returns null for uppercase (legacy) SKU — parseSku is strict", () => {
    const r = resolveOracle("MTG-OTJ-001-EN");
    expect(r.oracle_id).toBeNull();
    expect(r.reason).toMatch(/unparseable/);
  });

  it("returns null for SKU with unregistered game", () => {
    const r = resolveOracle("xxx-set-001-en");
    expect(r.oracle_id).toBeNull();
    expect(r.reason).toMatch(/unparseable/);
  });

  it("returns null for too-few segments", () => {
    expect(resolveOracle("mtg-otj-001").oracle_id).toBeNull();
  });

  it("never throws on unusual input", () => {
    expect(() => resolveOracle("")).not.toThrow();
    expect(() => resolveOracle("---")).not.toThrow();
    expect(() => resolveOracle("\n\t")).not.toThrow();
    expect(() => resolveOracle("a-b-c-d-e-f-g-h-i-j-k")).not.toThrow();
  });
});

// ── strippedOracleId pure helper ─────────────────────────────────────

describe("strippedOracleId", () => {
  it("strips language from a valid SKU", () => {
    expect(strippedOracleId("mtg-otj-001-en")).toBe("mtg-otj-001");
  });

  it("preserves variant", () => {
    expect(strippedOracleId("mtg-otj-001-en-foil")).toBe("mtg-otj-001-foil");
  });

  it("handles multi-token variants", () => {
    expect(strippedOracleId("mtg-otj-001-en-alt-art-foil"))
      .toBe("mtg-otj-001-alt-art-foil");
  });

  it("returns null for invalid SKU", () => {
    expect(strippedOracleId("not-a-sku")).toBeNull();
  });

  it("accepts pre-parsed SkuParts", () => {
    expect(
      strippedOracleId({
        game: "mtg" as GameCode,
        set: "otj",
        number: "001",
        lang: "en",
        variant: "foil",
        canonical: "mtg-otj-001-en-foil",
      }),
    ).toBe("mtg-otj-001-foil");
  });

  it("handles parts with no variant", () => {
    expect(
      strippedOracleId({
        game: "mtg" as GameCode,
        set: "otj",
        number: "001",
        lang: "en",
        variant: undefined,
        canonical: "mtg-otj-001-en",
      }),
    ).toBe("mtg-otj-001");
  });
});

// ── groupByOracle utility ────────────────────────────────────────────

describe("groupByOracle", () => {
  it("groups cross-language siblings under one oracle", () => {
    const groups = groupByOracle([
      { sku: "mtg-otj-001-en" },
      { sku: "mtg-otj-001-ja" },
      { sku: "mtg-otj-001-de" },
      { sku: "mtg-otj-002-en" },
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get("mtg-otj-001")?.length).toBe(3);
    expect(groups.get("mtg-otj-002")?.length).toBe(1);
  });

  it("places diverged-pattern items under the null key", () => {
    const groups = groupByOracle([
      { sku: "pkm-sv01-001-en" },
      { sku: "pkm-sv01-002-en" },
    ]);

    expect(groups.size).toBe(1);
    expect(groups.get(null)?.length).toBe(2);
  });

  it("preserves variant grouping (foil siblings cluster separately)", () => {
    const groups = groupByOracle([
      { sku: "mtg-otj-001-en" },
      { sku: "mtg-otj-001-en-foil" },
      { sku: "mtg-otj-001-ja-foil" },
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get("mtg-otj-001")?.length).toBe(1);
    expect(groups.get("mtg-otj-001-foil")?.length).toBe(2);
  });

  it("threads anchors through to the resolver", () => {
    const groups = groupByOracle([
      { sku: "ygo-lob-001-en", anchors: { ygo_passcode: "89631139" } },
      { sku: "ygo-jpr-001-ja", anchors: { ygo_passcode: "89631139" } },
      { sku: "ygo-lob-002-en", anchors: { ygo_passcode: "70781052" } },
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get("ygo-89631139")?.length).toBe(2);
    expect(groups.get("ygo-70781052")?.length).toBe(1);
  });

  it("places passcode-missing YGO items under null", () => {
    const groups = groupByOracle([
      { sku: "ygo-lob-001-en" },
      { sku: "ygo-lob-002-en", anchors: { ygo_passcode: "70781052" } },
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get(null)?.length).toBe(1);
    expect(groups.get("ygo-70781052")?.length).toBe(1);
  });

  it("handles empty input", () => {
    const groups = groupByOracle([]);
    expect(groups.size).toBe(0);
  });

  it("preserves item references (no copy)", () => {
    const a = { sku: "mtg-otj-001-en", meta: { custom: 1 } };
    const b = { sku: "mtg-otj-001-ja", meta: { custom: 2 } };
    const groups = groupByOracle([a, b]);
    const bucket = groups.get("mtg-otj-001");
    expect(bucket).toBeDefined();
    expect(bucket?.[0]).toBe(a);
    expect(bucket?.[1]).toBe(b);
  });
});

// ── Resolution shape invariants ──────────────────────────────────────

describe("OracleResolution shape", () => {
  const samples: OracleResolution[] = [
    resolveOracle("mtg-otj-001-en"),
    resolveOracle("ygo-lob-001-en"),
    resolveOracle("ygo-lob-001-en", { ygo_passcode: "89631139" }),
    resolveOracle("pkm-sv01-001-en"),
    resolveOracle("fab-mon-001-en"),
    resolveOracle("not-a-sku"),
    resolveOracle(""),
  ];

  it("always returns a non-empty reason string", () => {
    for (const r of samples) {
      expect(typeof r.reason).toBe("string");
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("always populates policy with kind + rationale", () => {
    for (const r of samples) {
      expect(r.policy).toBeTruthy();
      expect(r.policy.kind).toBeTruthy();
      expect(typeof r.policy.rationale).toBe("string");
    }
  });

  it("source is null iff oracle_id is null", () => {
    for (const r of samples) {
      expect(r.source === null).toBe(r.oracle_id === null);
    }
  });

  it("confidence is low iff oracle_id is null", () => {
    for (const r of samples) {
      if (r.oracle_id === null) expect(r.confidence).toBe("low");
      else expect(r.confidence).toBe("high");
    }
  });
});
