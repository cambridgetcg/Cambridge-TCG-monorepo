/**
 * Oracle resolver — per-game cross-language anchor derivation.
 *
 * Different TCGs have different ontologies for what "the same card across
 * languages" means. Four patterns are recognised:
 *
 *   - `stripped`:    `(game, set, number)` is the cross-language anchor;
 *                    language is a leaf. (MTG, OP, Lorcana, SWU, Bandai
 *                    games, Bushiroad games.)
 *   - `passcode`:    The publisher mints a global stable id; SKU set/lang
 *                    are derivative. (Yu-Gi-Oh, Rush Duel — Konami's
 *                    8-digit passcode.)
 *   - `diverged`:    Different language tracks have different set codes
 *                    (and sometimes numbering); no upstream-stable anchor
 *                    exists. (Pokémon JP/EN tracks, Pokémon Pocket.)
 *   - `single-lang`: The game ships in one language only; cross-language
 *                    is structurally vacuous. Behaviour identical to
 *                    `stripped` at compute level; kept distinct to
 *                    communicate intent. (Flesh and Blood, Sorcery,
 *                    Riftbound.)
 *
 * The `ORACLE_POLICY` table below names every registered game's pattern
 * + rationale. `resolveOracle()` is the pure-compute resolver: given a
 * SKU and optional upstream anchors, returns a Cambridge TCG canonical
 * oracle_id (or null, substrate-honestly).
 *
 * ── Behaviour ────────────────────────────────────────────────────────
 *
 *   resolveOracle("mtg-otj-001-en")
 *   //=> { oracle_id: "mtg-otj-001", source: "derived-stripped",
 *   //     confidence: "high", reason: "...", policy: { kind: "stripped", ... } }
 *
 *   resolveOracle("ygo-lob-001-en", { ygo_passcode: "89631139" })
 *   //=> { oracle_id: "ygo-89631139", source: "ygo-passcode", ... }
 *
 *   resolveOracle("ygo-lob-001-en")
 *   //=> { oracle_id: null, source: null, confidence: "low",
 *   //     reason: "ygo: passcode required but not provided", ... }
 *
 *   resolveOracle("pkm-sv01-001-en")
 *   //=> { oracle_id: null, source: null, confidence: "low",
 *   //     reason: "pkm: diverged JP/EN tracks; manual equivalence required", ... }
 *
 *   resolveOracle("fab-mon-001-en")
 *   //=> { oracle_id: "fab-mon-001", source: "derived-stripped", ... }
 *
 * ── Variant handling ────────────────────────────────────────────────
 *
 * The variant tail is preserved on the oracle. Foil JA and foil EN share
 * an oracle; foil JA and non-foil JA do not. Substrate-honest: variant
 * is a structural dimension orthogonal to language.
 *
 *   resolveOracle("mtg-otj-001-en-foil").oracle_id  //=> "mtg-otj-001-foil"
 *   resolveOracle("mtg-otj-001-ja-foil").oracle_id  //=> "mtg-otj-001-foil"
 *   resolveOracle("mtg-otj-001-en").oracle_id       //=> "mtg-otj-001"
 *
 * ── Pure ─────────────────────────────────────────────────────────────
 *
 * Every function in this module is pure. Same inputs → same outputs.
 * No I/O, no clock reads, no exceptions thrown on invalid input
 * (returns `{ oracle_id: null, reason: "..." }` instead).
 *
 * ── Spec citation ────────────────────────────────────────────────────
 *
 * Kingdom 1 of the substrate-honest aggregator implementation plan.
 * Doctrines: substrate honesty + meaning. Publication target:
 * `/api/v1/oracle-policies` (planned). Companion: K2 schema migration
 * adds the `oracle_id` + per-upstream anchor columns on `card_set_cards`.
 */

import { type GameCode } from "./games";
import { parseSku, type SkuParts } from "./parse";

// ── Policy types ─────────────────────────────────────────────────────

/**
 * The four publisher patterns. See module-level docstring.
 *
 * `single-lang` behaves identically to `stripped` at the compute level;
 * the kinds are kept separate to communicate intent — a Pattern D game
 * has no cross-language siblings by construction; a Pattern A game may
 * one day add a language.
 */
export type OraclePatternKind = "stripped" | "passcode" | "diverged" | "single-lang";

/** Per-game oracle resolution strategy. */
export interface OraclePolicy {
  kind: OraclePatternKind;
  /** One-sentence rationale; published on `/api/v1/oracle-policies`. */
  rationale: string;
}

/**
 * Inputs to the resolver beyond the SKU itself.
 *
 * Only Pattern B (passcode) games consume any anchor. Other patterns
 * ignore this object entirely; callers may always pass `{}` or omit it.
 */
export interface OracleAnchors {
  /** Konami's 8-digit passcode. Required for Pattern B (ygo, rsh) games
   *  to produce a non-null oracle_id; ignored for other patterns. */
  ygo_passcode?: string | null;
}

/** Where the oracle came from. `null` when oracle_id is also null. */
export type OracleResolutionSource =
  | "derived-stripped"
  | "ygo-passcode"
  | null;

/** Confidence in the resolution's cross-language correctness. */
export type OracleConfidence = "high" | "medium" | "low";

/** Resolver output. Always non-throwing; substrate-honest about null cases. */
export interface OracleResolution {
  /** Cambridge TCG canonical oracle id, or null if not derivable. */
  oracle_id: string | null;
  /** How the oracle was derived. */
  source: OracleResolutionSource;
  /** Confidence in the cross-language correctness of the oracle. */
  confidence: OracleConfidence;
  /** Substrate-honest explanation. Always non-empty. */
  reason: string;
  /** The policy that drove the derivation. */
  policy: OraclePolicy;
}

// ── Per-game policies ────────────────────────────────────────────────

/**
 * Per-game cross-language oracle policy. Every registered `GameCode` has
 * exactly one entry. Adding a new game = adding one row.
 *
 * Publication: this table is the data source for `/api/v1/oracle-policies`
 * (the public endpoint partners read to codegen). Keep rationales legible
 * to non-engineers; they will be quoted in methodology pages.
 */
export const ORACLE_POLICY: Record<GameCode, OraclePolicy> = {
  // ── Pattern A — stripped (multi-language, same numbering) ─────────
  mtg: {
    kind: "stripped",
    rationale:
      "Same numbering across 10 languages; (game,set,number) is the anchor.",
  },
  op: {
    kind: "stripped",
    rationale:
      "JP-first, EN-parallel; same set codes across language tracks.",
  },
  lgr: {
    kind: "stripped",
    rationale:
      "Simultaneous global release in EN/FR/DE; matched numbering.",
  },
  swu: {
    kind: "stripped",
    rationale:
      "Simultaneous EN/FR/DE/ES/IT release; matched numbering.",
  },
  dmw: {
    kind: "stripped",
    rationale:
      "Bandai pattern: JP-first, EN-parallel, same set codes.",
  },
  bsr: {
    kind: "stripped",
    rationale:
      "Bandai pattern: same set codes across JP/EN.",
  },
  dbf: {
    kind: "stripped",
    rationale:
      "Bandai pattern: same set codes across JP/EN.",
  },
  dbs: {
    kind: "stripped",
    rationale:
      "Bandai legacy: same set codes across JP/EN.",
  },
  vng: {
    kind: "stripped",
    rationale:
      "Bushiroad pattern: same set codes across JP/EN.",
  },
  wei: {
    kind: "stripped",
    rationale:
      "Bushiroad pattern: JP-primary, EN-parallel where shipped.",
  },
  alt: {
    kind: "stripped",
    rationale:
      "Simultaneous EN/FR release; matched numbering.",
  },
  gen: {
    kind: "stripped",
    rationale:
      "Publisher TBD; default to stripped pending first ingest confirmation.",
  },
  gcg: {
    kind: "stripped",
    rationale:
      "Trilingual simultaneous launch (ja/en/zh) with one shared set+number space (verified: ST01-001 identical in EN/JP official DBs).",
  },
  lcg: {
    kind: "stripped",
    rationale:
      "LCG umbrella covers multiple games; per-product adapter still needed for cross-product oracles.",
  },

  // ── Pattern B — passcode (global publisher anchor) ────────────────
  ygo: {
    kind: "passcode",
    rationale:
      "Konami passcode (8-digit) is the global cross-language anchor; SKU set/lang are derivative.",
  },
  rsh: {
    kind: "passcode",
    rationale:
      "Rush Duel uses the YGO passcode system; same anchor model.",
  },

  // ── Pattern C — diverged (no upstream anchor) ─────────────────────
  pkm: {
    kind: "diverged",
    rationale:
      "JP-track (s4, sv1, sm12a) and EN-track (swsh4, sv01, sma) have different set codes and partial reprint overlap; no upstream equivalence anchor. Requires manual equivalence curation (pkm_equivalence table).",
  },
  pkp: {
    kind: "diverged",
    rationale:
      "Mobile-derived catalog; per-region differences expected; status confirmed on first ingest.",
  },
  una: {
    kind: "diverged",
    rationale:
      "Regional set-code renumbering (JP ua03bt = NA ue02bt) with a language-invariant TITLE-wave-seq segment — a future anchor candidate; until an anchor writer ships, oracle_id stays null.",
  },

  // ── Pattern D — single-language ───────────────────────────────────
  fab: {
    kind: "single-lang",
    rationale:
      "Flesh and Blood ships in English only; cross-language siblings do not exist.",
  },
  sor: {
    kind: "single-lang",
    rationale:
      "Sorcery: Contested Realm ships in English only.",
  },
  rft: {
    kind: "single-lang",
    rationale:
      "Riftbound (Riot, 2025+) launches English-only; revise on confirmation.",
  },

  // ── Internal ──────────────────────────────────────────────────────
  tst: {
    kind: "single-lang",
    rationale:
      "Internal test game; English-only by convention.",
  },
};

// ── Pure helpers ─────────────────────────────────────────────────────

/**
 * Strip the language segment from a SKU, preserving variant. Returns
 * `null` if the SKU is unparseable.
 *
 *   strippedOracleId("mtg-otj-001-en")            //=> "mtg-otj-001"
 *   strippedOracleId("mtg-otj-001-en-foil")       //=> "mtg-otj-001-foil"
 *   strippedOracleId("mtg-otj-001-en-alt-art")    //=> "mtg-otj-001-alt-art"
 *   strippedOracleId("not-a-sku")                 //=> null
 *
 * Pure: same input → same output. Useful when the caller already has
 * parsed parts and just wants the stripped form without re-running the
 * full resolver.
 */
export function strippedOracleId(skuOrParts: string | SkuParts): string | null {
  const parts =
    typeof skuOrParts === "string" ? parseSku(skuOrParts) : skuOrParts;
  if (!parts) return null;
  const base = `${parts.game}-${parts.set}-${parts.number}`;
  return parts.variant ? `${base}-${parts.variant}` : base;
}

/**
 * Build a passcode-derived oracle id. Internal to the resolver; not
 * exported because callers should go through `resolveOracle()` which
 * dispatches on policy.
 *
 * Preserves the SKU's variant tail (foil, 1st, etc.) so 1st-edition JP
 * and 1st-edition EN share an oracle while regular editions get their own.
 *
 *   passcodeOracleId({game:"ygo",...,variant:undefined}, "89631139")
 *   //=> "ygo-89631139"
 *
 *   passcodeOracleId({game:"ygo",...,variant:"1st"}, "89631139")
 *   //=> "ygo-89631139-1st"
 */
function passcodeOracleId(parts: SkuParts, passcode: string): string {
  const base = `${parts.game}-${passcode}`;
  return parts.variant ? `${base}-${parts.variant}` : base;
}

// ── The resolver ────────────────────────────────────────────────────

/**
 * Resolve the Cambridge TCG canonical oracle id for a SKU.
 *
 * Pure: same `(sku, anchors)` → same result. Never throws. Returns
 * `{ oracle_id: null, ... }` with a substrate-honest reason when no
 * oracle is derivable.
 *
 * Pattern-dispatched per `ORACLE_POLICY`:
 *
 *   - stripped + single-lang: oracle = `<game>-<set>-<number>[-<variant>]`
 *   - passcode:               oracle = `<game>-<passcode>[-<variant>]`
 *                             requires `anchors.ygo_passcode`
 *   - diverged:               oracle = null
 *                             caller queries the equivalence table separately
 *
 * The variant tail is preserved on the oracle so foil siblings across
 * languages share an oracle while foil vs non-foil get distinct oracles.
 *
 * @example
 *   resolveOracle("mtg-otj-001-en")
 *   //=> { oracle_id: "mtg-otj-001", source: "derived-stripped", confidence: "high", ... }
 *
 *   resolveOracle("ygo-lob-001-en", { ygo_passcode: "89631139" })
 *   //=> { oracle_id: "ygo-89631139", source: "ygo-passcode", confidence: "high", ... }
 *
 *   resolveOracle("ygo-lob-001-en")
 *   //=> { oracle_id: null, source: null, confidence: "low",
 *   //     reason: "ygo: passcode required but not provided", ... }
 *
 *   resolveOracle("pkm-sv01-001-en")
 *   //=> { oracle_id: null, source: null, confidence: "low",
 *   //     reason: "pkm: diverged JP/EN tracks; manual equivalence required", ... }
 */
export function resolveOracle(
  sku: string,
  anchors: OracleAnchors = {},
): OracleResolution {
  const parts = parseSku(sku);
  if (!parts) {
    return {
      oracle_id: null,
      source: null,
      confidence: "low",
      reason: `unparseable SKU: "${sku}"`,
      policy: {
        kind: "stripped",
        rationale: "(no policy resolved; SKU invalid)",
      },
    };
  }

  const policy = ORACLE_POLICY[parts.game];
  if (!policy) {
    // Unreachable while ORACLE_POLICY is exhaustive over GameCode, but
    // substrate-honest if a future GameCode lands without a policy entry.
    return {
      oracle_id: null,
      source: null,
      confidence: "low",
      reason: `no oracle policy registered for game "${parts.game}"`,
      policy: { kind: "stripped", rationale: "(missing policy)" },
    };
  }

  switch (policy.kind) {
    case "stripped":
    case "single-lang": {
      const oracle_id = strippedOracleId(parts);
      return {
        oracle_id,
        source: oracle_id !== null ? "derived-stripped" : null,
        confidence: oracle_id !== null ? "high" : "low",
        reason: policy.rationale,
        policy,
      };
    }

    case "passcode": {
      const passcode = anchors.ygo_passcode?.trim();
      if (!passcode) {
        return {
          oracle_id: null,
          source: null,
          confidence: "low",
          reason: `${parts.game}: passcode required but not provided`,
          policy,
        };
      }
      return {
        oracle_id: passcodeOracleId(parts, passcode),
        source: "ygo-passcode",
        confidence: "high",
        reason: policy.rationale,
        policy,
      };
    }

    case "diverged": {
      return {
        oracle_id: null,
        source: null,
        confidence: "low",
        reason: `${parts.game}: diverged JP/EN tracks; manual equivalence required`,
        policy,
      };
    }
  }
}

// ── Utility: group by oracle ─────────────────────────────────────────

/**
 * Group a list of items by their resolved oracle_id. Items whose oracle
 * is null land under the key `null` (a Map permits null keys).
 *
 * Useful for in-memory aggregation: "given these 1000 SKUs, partition
 * them by cross-language sibling group" — without writing the join into
 * SQL each time.
 *
 *   const groups = groupByOracle([
 *     { sku: "mtg-otj-001-en" },
 *     { sku: "mtg-otj-001-ja" },
 *     { sku: "mtg-otj-002-en" },
 *   ]);
 *   //=> Map(2) {
 *   //     "mtg-otj-001" => [{sku:"mtg-otj-001-en"}, {sku:"mtg-otj-001-ja"}],
 *   //     "mtg-otj-002" => [{sku:"mtg-otj-002-en"}],
 *   //   }
 *
 * Per-item `anchors` are threaded through to the resolver so YGO items
 * with passcodes group correctly.
 */
export function groupByOracle<T extends { sku: string; anchors?: OracleAnchors }>(
  items: readonly T[],
): Map<string | null, T[]> {
  const out = new Map<string | null, T[]>();
  for (const item of items) {
    const oracle = resolveOracle(item.sku, item.anchors).oracle_id;
    const bucket = out.get(oracle);
    if (bucket) bucket.push(item);
    else out.set(oracle, [item]);
  }
  return out;
}
