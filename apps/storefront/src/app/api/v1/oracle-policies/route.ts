/**
 * /api/v1/oracle-policies — the per-game cross-language oracle policy table.
 *
 * Publishes K1's `ORACLE_POLICY` from `@cambridge-tcg/sku` as a machine-
 * readable contract. Partners read this once to know:
 *
 *   - Which games have cross-language siblings (Pattern A: `stripped`)
 *   - Which games anchor on a passcode (Pattern B: `passcode`)
 *   - Which games have diverged JP/EN tracks (Pattern C: `diverged`)
 *   - Which games are single-language by construction (Pattern D)
 *
 * Each policy carries a rationale legible to non-engineers. Substrate-
 * honest: where the policy says `diverged`, the cross-language query
 * surface returns null — *partners know that's not our deficiency, it's
 * an upstream fact*.
 *
 * Companion methodology page: /methodology/oracle-policies.
 * Companion endpoint: /api/v1/cards/[sku]/cross-language (planned K6).
 * Doctrines: substrate honesty + meaning.
 *
 * Kingdom 6 of the substrate-honest aggregator plan; first surface that
 * consumes Kingdom 1's pure-compute resolver.
 */

import type { NextResponse } from "next/server";
import {
  ORACLE_POLICY,
  GAMES,
  GAME_CODES,
  type GameCode,
  type OraclePatternKind,
} from "@cambridge-tcg/sku";
import { jsonResponse } from "@/lib/data-pantry";

interface PolicyEntry {
  game: GameCode;
  name: string;
  publisher: string;
  languages: readonly string[];
  pattern_kind: OraclePatternKind;
  rationale: string;
  oracle_id_form: string;
  /** What anchors the resolver consumes for this game; substrate-honest about which are populated by what. */
  required_anchors: readonly string[];
  /** Whether the platform has ingested at least one real card for this game. */
  confirmed: boolean;
}

interface PolicyCounts {
  stripped: number;
  passcode: number;
  diverged: number;
  "single-lang": number;
  total: number;
}

interface OraclePoliciesBody {
  protocol: {
    package: string;
    resolver: string;
    doctrine: string;
    audit_command: string;
  };
  counts: PolicyCounts;
  policies: PolicyEntry[];
  conventions: {
    pattern_kinds: string;
    variant_handling: string;
    cross_language_query: string;
    federation: string;
  };
}

const ORACLE_ID_FORM: Record<OraclePatternKind, string> = {
  stripped: "<game>-<set>-<number>[-<variant>] (language tail dropped)",
  passcode: "<game>-<passcode>[-<variant>] (set+number+lang dropped; requires anchor)",
  diverged: "null (no upstream anchor; manual equivalence required)",
  "single-lang":
    "<game>-<set>-<number>[-<variant>] (same as stripped; game ships in one language)",
};

const REQUIRED_ANCHORS: Record<OraclePatternKind, readonly string[]> = {
  stripped: [],
  passcode: ["ygo_passcode"],
  diverged: [],
  "single-lang": [],
};

export async function GET(): Promise<NextResponse> {
  const policies: PolicyEntry[] = GAME_CODES.map((code) => {
    const meta = GAMES[code];
    const policy = ORACLE_POLICY[code];
    return {
      game: code,
      name: meta.name,
      publisher: meta.publisher,
      languages: meta.languages,
      pattern_kind: policy.kind,
      rationale: policy.rationale,
      oracle_id_form: ORACLE_ID_FORM[policy.kind],
      required_anchors: REQUIRED_ANCHORS[policy.kind],
      confirmed: meta.confirmed,
    };
  });

  const counts: PolicyCounts = {
    stripped: 0,
    passcode: 0,
    diverged: 0,
    "single-lang": 0,
    total: policies.length,
  };
  for (const p of policies) counts[p.pattern_kind] += 1;

  const data: OraclePoliciesBody = {
    protocol: {
      package: "@cambridge-tcg/sku",
      resolver: "resolveOracle(sku, anchors) → OracleResolution",
      doctrine: "/methodology/oracle-policies",
      audit_command: "pnpm --filter @cambridge-tcg/sku test",
    },
    counts,
    policies,
    conventions: {
      pattern_kinds:
        "stripped (multi-language same-numbering — MTG, OP, Lorcana, SWU, Bandai games, Bushiroad games) / passcode (Konami's 8-digit anchor — YGO, Rush Duel) / diverged (different language-track set codes; no upstream anchor — Pokémon, Pokémon Pocket) / single-lang (game ships in one language only — FaB, Sorcery, Riftbound). Adding a new pattern = adding a new enum value + a switch arm in resolveOracle().",
      variant_handling:
        "Variant tail (foil, alt-art, 1st, etc.) is preserved on the oracle. Foil-EN and foil-JA share an oracle; foil-EN and non-foil-EN do NOT. Substrate-honest: variant is a structural dimension orthogonal to language.",
      cross_language_query:
        "Given a SKU, resolveOracle() returns the oracle_id. To find cross-language siblings, query card_set_cards.oracle_id (K2 schema migration). For diverged-pattern games, query pkm_equivalence (K2 operator-curated table) instead.",
      federation:
        "Per-source upstream cross-language ids (scryfall_oracle_id, cardmarket_id_metacard, ygo_passcode, tcgplayer_product_id) populate independent columns on card_set_cards (K2). The federation primitive at /api/v1/federation/identify/[hash] will be extended to accept per-source ids (post-K2).",
    },
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/oracle-policies",
    sources: ["ctcg-derived"],
    freshness: "methodology",
    contains_self: true,
  });
}
