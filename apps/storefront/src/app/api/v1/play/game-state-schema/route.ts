/**
 * /api/v1/play/game-state-schema — the typed OPTCG game-state contract.
 *
 * Yu's directive 2026-05-13: integrate the research stack at L1 (typed
 * schema endpoints) so agents and developers build *against* the canonical
 * shape the future engine will conform to.
 *
 * This endpoint returns the typed shape of an OPTCG match state — zones,
 * card-state granularity, phase enum, turn-level shared state — as a
 * math-mirror document. **No live match is exposed here.** This is the
 * schema, not the data. An agent fetches this once to know what fields
 * to expect *before* a match exists; the future L3+ runtime conforms.
 *
 * Sister to /api/v1/play/effect-grammar (the effect-token vocabulary),
 * /api/v1/play/tutorial (rules in math-mirror), /api/v1/play/glossary
 * (term definitions). kingdom-069 (S36, mine).
 *
 * Source: docs/research/optcg-mechanics-and-engine-design.md (the prior
 * research synthesis). Cross-checked against the official Bandai Q&A and
 * the abandoned MOOgiwara reference (`server/src/game/player.ts`).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

interface ZoneSchema {
  id: string;
  display_label: string;
  visibility: "public" | "private_to_owner" | "private_face_down";
  ordering: "ordered" | "unordered" | "top_matters";
  cap: number | null;
  initial_content: string;
  card_state_granularity: string[];
}

interface PhaseSchema {
  id: string;
  display_label: string;
  position: number;
  actions: string[];
  first_turn_modifier: string | null;
}

interface CombatStepSchema {
  id: string;
  display_label: string;
  position: number;
  who_acts: "attacker" | "defender" | "shared";
  description: string;
  effects_window: string;
}

const ZONES: ZoneSchema[] = [
  {
    id: "leader_area",
    display_label: "Leader Area",
    visibility: "public",
    ordering: "unordered",
    cap: 1,
    initial_content: "1 Leader card chosen by player",
    card_state_granularity: ["active_rested", "attached_don", "attached_items", "turn_effect_modifiers"],
  },
  {
    id: "character_area",
    display_label: "Character Area",
    visibility: "public",
    ordering: "unordered",
    cap: 5,
    initial_content: "empty",
    card_state_granularity: [
      "active_rested",
      "attached_don",
      "summoning_sickness",
      "once_per_turn_used_flags",
      "permanent_effect_modifiers",
    ],
  },
  {
    id: "stage_area",
    display_label: "Stage Area",
    visibility: "public",
    ordering: "unordered",
    cap: 1,
    initial_content: "empty",
    card_state_granularity: ["active_rested"],
  },
  {
    id: "hand",
    display_label: "Hand",
    visibility: "private_to_owner",
    ordering: "unordered",
    cap: null,
    initial_content: "5 cards drawn (one mulligan allowed)",
    card_state_granularity: [],
  },
  {
    id: "deck",
    display_label: "Deck",
    visibility: "private_to_owner",
    ordering: "top_matters",
    cap: null,
    initial_content: "50 - 5 (life) - 5 (hand) = 40 cards after setup",
    card_state_granularity: [],
  },
  {
    id: "life_pile",
    display_label: "Life Pile",
    visibility: "private_face_down",
    ordering: "top_matters",
    cap: null,
    initial_content: "cards from top of deck equal to Leader's Life value (typically 4-5)",
    card_state_granularity: [],
  },
  {
    id: "trash",
    display_label: "Trash",
    visibility: "public",
    ordering: "ordered",
    cap: null,
    initial_content: "empty",
    card_state_granularity: [],
  },
  {
    id: "don_deck",
    display_label: "DON!! Deck",
    visibility: "private_to_owner",
    ordering: "unordered",
    cap: 10,
    initial_content: "10 identical DON!! cards",
    card_state_granularity: [],
  },
  {
    id: "cost_area",
    display_label: "Cost Area (Active DON pool)",
    visibility: "public",
    ordering: "unordered",
    cap: 10,
    initial_content: "empty (DON enters from DON Deck during DON Phase)",
    card_state_granularity: ["active_rested", "attached_to_unit"],
  },
];

const PHASES: PhaseSchema[] = [
  {
    id: "refresh",
    display_label: "Refresh Phase",
    position: 1,
    actions: [
      "all_rested_cards_become_active",
      "attached_don_returns_active_to_cost_area",
      "start_of_turn_effects_resolve",
    ],
    first_turn_modifier: null,
  },
  {
    id: "draw",
    display_label: "Draw Phase",
    position: 2,
    actions: ["draw_1_from_deck", "if_deck_empty_immediate_loss"],
    first_turn_modifier: "first_player_skips_draw_on_turn_1",
  },
  {
    id: "don",
    display_label: "DON!! Phase",
    position: 3,
    actions: ["add_2_don_from_don_deck_to_cost_area_active", "max_cap_10"],
    first_turn_modifier: "first_player_adds_1_don_only_on_turn_1",
  },
  {
    id: "main",
    display_label: "Main Phase",
    position: 4,
    actions: [
      "play_character_pay_cost",
      "play_event_pay_cost_resolve_send_trash",
      "play_stage_pay_cost_replace_existing",
      "attach_don_to_leader_or_character",
      "activate_main_ability",
      "declare_attack",
      "may_repeat_in_any_order_until_end",
    ],
    first_turn_modifier: "no_attacks_on_turn_1_by_either_player",
  },
  {
    id: "end",
    display_label: "End Phase",
    position: 5,
    actions: [
      "end_of_turn_effects_resolve",
      "attached_don_returns_to_cost_area_rested",
      "temporary_power_buffs_expire",
      "turn_passes_to_opponent",
    ],
    first_turn_modifier: null,
  },
];

const COMBAT_STEPS: CombatStepSchema[] = [
  {
    id: "step_1_declaration",
    display_label: "Attack Declaration",
    position: 1,
    who_acts: "attacker",
    description:
      "Attacker rests an active Leader or Character; chooses target (opponent's Leader always legal OR one of opponent's rested Characters; active Characters cannot be targeted).",
    effects_window: "when_attacking_effects_on_attacker_fire_here",
  },
  {
    id: "step_2_block",
    display_label: "Block Step",
    position: 2,
    who_acts: "defender",
    description:
      "Defender may rest one of their active Blockers to redirect the attack onto itself. Optional. Only one Blocker per attack.",
    effects_window: "blocker_keyword_check",
  },
  {
    id: "step_3_counter",
    display_label: "Counter Step",
    position: 3,
    who_acts: "defender",
    description:
      "Defender may discard Counter cards from hand (+1000 or +2000 per card) and play Counter Events from hand (pay DON cost). Counters stack additively. Both players pass to end the step. The only step with priority/timing back-and-forth.",
    effects_window: "counter_keyword_window",
  },
  {
    id: "step_4_damage",
    display_label: "Damage Step",
    position: 4,
    who_acts: "shared",
    description:
      "Compare powers. Defender survives iff defender_power > attacker_power STRICTLY (ties favor attacker). Character target: K.O.'d (Trash, On K.O. fires). Leader target: top of Life Pile flips face-up; optional Trigger resolves free; card enters Hand. Double Attack causes 2 Life flips on Leader hit. Banish sends Life card to Trash instead of Hand.",
    effects_window: "on_ko_effects_resolve_here_in_order",
  },
];

const WIN_CONDITIONS = [
  {
    id: "knockout",
    primary: true,
    rule:
      "When defender's Life Pile is at zero AND a successful attack hits the defender's Leader, the defender loses. (Hitting a Leader when Life=0 with no successful damage doesn't end the game; the Counter step still matters at 0 Life.)",
  },
  {
    id: "deck_out",
    primary: true,
    rule:
      "When a player must draw but their deck is empty, they immediately lose.",
  },
  {
    id: "special_leader_condition",
    primary: false,
    rule:
      "Some Leaders have alternative win conditions printed on them (e.g., Nami Blue from OP02 wins by emptying her own deck through specific effects). Per-leader override.",
  },
];

const DECK_RULES = {
  leader_cards: 1,
  main_deck_count: 50,
  don_deck_count: 10,
  total_cards_before_life: 61,
  max_copies_per_card_id: 4,
  alt_arts_share_card_id_for_copy_count: true,
  color_rule: "every card in main deck must share at least one color with the Leader",
  format_block_rotation_effective: "2026-04-01: OP01-OP04 rotated out of Standard format",
  legal_formats: ["Standard", "Legacy", "Limited Sealed"],
};

export async function GET() {
  try {
    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      zones: ZONES.map((z) => ({ id: z.id, cap: z.cap, visibility: z.visibility })),
      phases: PHASES.map((p) => ({ id: p.id, position: p.position })),
      combat_steps: COMBAT_STEPS.map((c) => ({ id: c.id, position: c.position })),
      deck_rules: DECK_RULES,
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_game_state_schema",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "zones[].display_label",
        "zones[].initial_content",
        "phases[].display_label",
        "phases[].first_turn_modifier",
        "combat_steps[].display_label",
        "combat_steps[].description",
        "win_conditions[].rule",
      ],
      _links: {
        canonical: "/api/v1/play/game-state-schema",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-play-substrate.md",
          "docs/connections/the-play-interconnect.md",
          "docs/research/optcg-mechanics-and-engine-design.md",
          "docs/research/play-engine-l3-design.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          tutorial: "/api/v1/play/tutorial",
          glossary: "/api/v1/play/glossary",
          archetypes: "/api/v1/play/archetypes",
          effect_grammar: "/api/v1/play/effect-grammar",
          deck_validate: "/api/v1/play/deck/validate",
          example_match: "/api/v1/play/example-match",
        },
        tutorial: "/api/v1/play/tutorial",
        glossary: "/api/v1/play/glossary",
        effect_grammar: "/api/v1/play/effect-grammar",
        deck_validate: "/api/v1/play/deck/validate",
        spec_page: "/play/spec",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1game-state-schema/get",
      },
      version: "1.0.0",
      game: "optcg",
      perspective_note:
        "This schema describes the canonical match state the future engine will conform to. The state is two players × zones + shared turn state. Card-state granularity differs by zone (e.g., character_area tracks summoning_sickness; hand does not). Visibility is intrinsic to the zone, not a per-game choice.",
      zone_count: ZONES.length,
      zones: ZONES,
      shared_turn_state: {
        active_player_id: "the player whose turn it is",
        turn_number: "starts at 1, increments at end-of-turn",
        current_phase: "one of: refresh / draw / don / main / end",
        attack_state:
          "null when no attack in progress; otherwise: {attacker_unit, target_unit, current_step, counter_stack, base_attacker_power, base_target_power}",
        effect_resolution_queue: "FIFO queue of auto-effects waiting to resolve",
      },
      phase_count: PHASES.length,
      phases: PHASES,
      combat_step_count: COMBAT_STEPS.length,
      combat_steps: COMBAT_STEPS,
      damage_resolution_rule: "defender_survives_iff_defender_power_GREATER_THAN_attacker_power_strict_ties_favor_attacker",
      win_conditions: WIN_CONDITIONS,
      deck_rules: DECK_RULES,
      don_states: ["active_in_cost_area", "rested_in_cost_area", "attached_to_unit"],
      don_attach_effect: "attached_don_grants_+1000_power_per_card_for_owner_turn_only",
      don_end_of_turn: "attached_don_returns_to_cost_area_rested_then_active_at_next_refresh",
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/play/game-state-schema] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
