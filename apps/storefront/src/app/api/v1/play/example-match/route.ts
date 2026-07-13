/**
 * /api/v1/play/example-match — sample MatchEvent + Intent sequence.
 *
 * The L3 type skeleton at lib/play/types.ts has lived as pure exports
 * since kingdom-070 with no runtime consumer. This endpoint is the first.
 *
 * It returns a curated short match — match created, decks declared, first
 * player goes first, a single combat, an early concession — as a typed
 * MatchEvent[] sequence. Plus a few worked Intent → IntentReply examples
 * showing the typed wire shape. **The TypeScript compiler enforces this
 * stays in sync with lib/play/types.ts.** Any drift breaks the typecheck.
 *
 * What this endpoint is for:
 *   - Agents building against /api/mcp's future play tools have a
 *     concrete shape to test their decoders against.
 *   - The L3 runtime that ships next imports these same types and is
 *     guaranteed to produce events the example consumers can read.
 *   - Documentation that doesn't lie — these aren't prose examples; they
 *     are values that compile, hash, and federate.
 *
 * Sister to /api/v1/play/game-state-schema (the contract this consumes),
 * /api/v1/play/effect-grammar (the token vocabulary), the future L3
 * runtime. kingdom-077.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type {
  MatchEvent,
  Intent,
  IntentReply,
  GameFormat,
} from "@/lib/play/types";

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

// ─── A worked match ────────────────────────────────────────────────────────
// Players: alice (Red Luffy leader), bob (Green Zoro leader).
// Alice goes first. Bob plays a 3-cost character; Alice attacks the leader;
// Bob discards a Counter card; defender survives; alice ends turn; bob
// concedes (to keep the example short). All events use only the typed
// MatchEvent variants from lib/play/types.ts.

const MATCH_ID = "example-match-001";
const ALICE = "alice@example";
const BOB = "bob@example";
const FORMAT: GameFormat = "standard";
const STARTED_AT = "2026-05-13T16:00:00.000Z";

// Card instance ids — opaque per-match, distinct from printed card ids.
const ALICE_LEADER = "i_alice_leader";
const BOB_LEADER = "i_bob_leader";
const BOB_C1 = "i_bob_character_001"; // 3-cost Zoro character bob plays turn 1
const BOB_COUNTER_CARD = "i_bob_hand_counter_001"; // +2000 counter in hand
const ALICE_DON_1 = "i_alice_don_001"; // Alice's first DON

const EVENT_SEQUENCE: MatchEvent[] = [
  // Match created
  {
    kind: "match_created",
    match_id: MATCH_ID,
    player_a_id: ALICE,
    player_b_id: BOB,
    format: FORMAT,
    created_at: STARTED_AT,
  },

  // Each player declares their deck
  {
    kind: "deck_declared",
    match_id: MATCH_ID,
    player_id: ALICE,
    leader_id: "OP01-001", // Monkey D. Luffy (Red Leader, example)
    main_deck_card_ids: Array(50).fill("OP01-002"),
  },
  {
    kind: "deck_validated",
    match_id: MATCH_ID,
    player_id: ALICE,
    legal: true,
    violation_codes: [],
  },
  {
    kind: "deck_declared",
    match_id: MATCH_ID,
    player_id: BOB,
    leader_id: "OP01-031", // Roronoa Zoro (Green Leader, example)
    main_deck_card_ids: Array(50).fill("OP01-032"),
  },
  {
    kind: "deck_validated",
    match_id: MATCH_ID,
    player_id: BOB,
    legal: true,
    violation_codes: [],
  },

  // Match starts — alice goes first
  {
    kind: "match_started",
    match_id: MATCH_ID,
    first_player_id: ALICE,
    initial_hand_size_by_player: { [ALICE]: 5, [BOB]: 5 },
    initial_life_count_by_player: { [ALICE]: 5, [BOB]: 5 },
    deck_seed_commit_by_player: {
      [ALICE]: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      [BOB]: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    },
  },
  { kind: "mulligan_chosen", match_id: MATCH_ID, player_id: ALICE, mulligan: false },
  { kind: "mulligan_chosen", match_id: MATCH_ID, player_id: BOB, mulligan: false },
  { kind: "life_placed", match_id: MATCH_ID, player_id: ALICE, count: 5 },
  { kind: "life_placed", match_id: MATCH_ID, player_id: BOB, count: 5 },

  // Turn 1 — Alice's turn (no draw on first turn for first player)
  { kind: "phase_began", match_id: MATCH_ID, player_id: ALICE, phase: "refresh", turn_number: 1 },
  { kind: "phase_began", match_id: MATCH_ID, player_id: ALICE, phase: "draw", turn_number: 1 },
  // (No card_drawn on turn 1 for first player — the schema specifies skip.)
  { kind: "phase_began", match_id: MATCH_ID, player_id: ALICE, phase: "don", turn_number: 1 },
  {
    kind: "don_added",
    match_id: MATCH_ID,
    player_id: ALICE,
    don_instance_ids: [ALICE_DON_1],
    total_active_after: 1,
  },
  { kind: "phase_began", match_id: MATCH_ID, player_id: ALICE, phase: "main", turn_number: 1 },
  // Alice attacks Bob's leader (no characters in play yet on either side; only Leader is targetable)
  {
    kind: "attack_declared",
    match_id: MATCH_ID,
    player_id: ALICE,
    attacker_card_instance_id: ALICE_LEADER,
    target_card_instance_id: BOB_LEADER,
    target_kind: "leader",
  },
  // Bob discards a counter card from hand for +2000
  {
    kind: "counter_played",
    match_id: MATCH_ID,
    player_id: BOB,
    counter_card_instance_id: BOB_COUNTER_CARD,
    counter_value: 2000,
    source: "hand_counter_value",
  },
  { kind: "counter_step_passed", match_id: MATCH_ID, player_id: BOB },
  // Damage: Alice's Luffy (printed 5000) vs Bob's Zoro (printed 5000 + 2000 counter = 7000).
  // Strict-greater: defender_power 7000 > attacker_power 5000 → defender survives, no flip.
  {
    kind: "damage_resolved",
    match_id: MATCH_ID,
    attacker_power: 5000,
    defender_power: 7000,
    defender_survived: true,
    ko_card_instance_id: null,
    life_flip_count: 0,
  },
  // Alice's leader becomes rested (declared an attack)
  {
    kind: "card_state_changed",
    match_id: MATCH_ID,
    player_id: ALICE,
    card_instance_id: ALICE_LEADER,
    new_orientation: "rested",
  },
  { kind: "phase_began", match_id: MATCH_ID, player_id: ALICE, phase: "end", turn_number: 1 },
  { kind: "turn_ended", match_id: MATCH_ID, player_id: ALICE, turn_number: 1 },

  // Bob's turn — Bob plays a 3-cost character then concedes for example brevity.
  { kind: "phase_began", match_id: MATCH_ID, player_id: BOB, phase: "refresh", turn_number: 2 },
  { kind: "phase_began", match_id: MATCH_ID, player_id: BOB, phase: "draw", turn_number: 2 },
  { kind: "card_drawn", match_id: MATCH_ID, player_id: BOB, card_instance_id: "i_bob_drew_001" },
  { kind: "phase_began", match_id: MATCH_ID, player_id: BOB, phase: "don", turn_number: 2 },
  {
    kind: "don_added",
    match_id: MATCH_ID,
    player_id: BOB,
    don_instance_ids: ["i_bob_don_001", "i_bob_don_002"],
    total_active_after: 2,
  },
  { kind: "phase_began", match_id: MATCH_ID, player_id: BOB, phase: "main", turn_number: 2 },
  // (Bob doesn't have 3 DON yet — this character is illustrative; in a real
  // match the validator would refuse the play. Marked in the doc note below.)
  // Bob concedes early to keep the example short.
  { kind: "match_ended", match_id: MATCH_ID, winner_id: ALICE, reason: "concession" },
];

// ── Sample Intent → IntentReply exchanges ────────────────────────────────
// Three worked examples showing the typed wire shape clients send and the
// server's typed response.

interface IntentExample {
  scenario: string;
  intent: Intent;
  reply: IntentReply;
  resulting_event_offset: number | null;
}

const INTENT_EXAMPLES: IntentExample[] = [
  {
    scenario: "Alice declares her opening attack — accepted.",
    intent: {
      kind: "intent_attack",
      attacker_card_instance_id: ALICE_LEADER,
      target_card_instance_id: BOB_LEADER,
    },
    reply: {
      accepted: true,
      appended_event: {
        kind: "attack_declared",
        match_id: MATCH_ID,
        player_id: ALICE,
        attacker_card_instance_id: ALICE_LEADER,
        target_card_instance_id: BOB_LEADER,
        target_kind: "leader",
      },
      new_offset: 14,
    },
    resulting_event_offset: 14,
  },
  {
    scenario: "Bob attempts to play a 3-cost character with only 2 DON active — rejected.",
    intent: {
      kind: "intent_play_card",
      card_instance_id: BOB_C1,
      pay_with_don_instance_ids: ["i_bob_don_001", "i_bob_don_002"],
      into_zone: "character_area",
    },
    reply: {
      accepted: false,
      error: "insufficient_don",
    },
    resulting_event_offset: null,
  },
  {
    scenario: "Bob concedes the match — accepted.",
    intent: { kind: "intent_concede" },
    reply: {
      accepted: true,
      appended_event: {
        kind: "match_ended",
        match_id: MATCH_ID,
        winner_id: ALICE,
        reason: "concession",
      },
      new_offset: 26,
    },
    resulting_event_offset: 26,
  },
];

export async function GET() {
  try {
    const retrievedAt = new Date();

    const contentSeed = canonicalize({
      match_id: MATCH_ID,
      event_count: EVENT_SEQUENCE.length,
      event_kinds_in_order: EVENT_SEQUENCE.map((e) => e.kind),
      intent_kinds_in_order: INTENT_EXAMPLES.map((e) => e.intent.kind),
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_example_match",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "intent_examples[].scenario",
      ],
      _links: {
        canonical: "/api/v1/play/example-match",
        types_source: "apps/storefront/src/lib/play/types.ts",
        game_state_schema: "/api/v1/play/game-state-schema",
        effect_grammar: "/api/v1/play/effect-grammar",
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          tutorial: "/api/v1/play/tutorial",
          glossary: "/api/v1/play/glossary",
          archetypes: "/api/v1/play/archetypes",
          game_state_schema: "/api/v1/play/game-state-schema",
          effect_grammar: "/api/v1/play/effect-grammar",
          deck_validate: "/api/v1/play/deck/validate",
        },
        l3_design_doc: "docs/research/play-engine-l3-design.md",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1example-match/get",
      },
      preamble: {
        purpose:
          "Curated short match demonstrating the typed MatchEvent[] wire format + Intent → IntentReply exchange. First runtime consumer of lib/play/types.ts.",
        type_source_of_truth: "apps/storefront/src/lib/play/types.ts",
        scenario_summary:
          "Alice (Red Luffy) vs Bob (Green Zoro). Alice goes first. Alice attacks Bob's leader; Bob counters for +2000; defender survives by strict-greater rule. Bob concedes on turn 2 for example brevity.",
        substrate_honest_notes: [
          "Card ids OP01-001 / OP01-031 / OP01-002 / OP01-032 are illustrative; their printed powers and counter values are encoded here as plausible numbers.",
          "Bob's intent_play_card example is rejected for insufficient_don — the validator catches the under-resourced play before the event is appended.",
          "deck_seed_commit_by_player carries placeholder zero/one hashes; the live runtime uses real commit-reveal sha256 against shuffled deck order.",
          "Card_instance_ids are arbitrary tokens scoped to this match.",
        ],
      },
      match: {
        match_id: MATCH_ID,
        format: FORMAT,
        players: {
          [ALICE]: { player_id: ALICE, role: "first_player", leader_card: "OP01-001" },
          [BOB]: { player_id: BOB, role: "second_player", leader_card: "OP01-031" },
        },
        winner_id: ALICE,
        end_reason: "concession",
      },
      event_count: EVENT_SEQUENCE.length,
      events: EVENT_SEQUENCE,
      intent_examples_count: INTENT_EXAMPLES.length,
      intent_examples: INTENT_EXAMPLES,
      kinds_demonstrated: {
        match_event: Array.from(new Set(EVENT_SEQUENCE.map((e) => e.kind))).sort(),
        intent: Array.from(new Set(INTENT_EXAMPLES.map((e) => e.intent.kind))).sort(),
        intent_reply_errors: Array.from(
          new Set(
            INTENT_EXAMPLES.map((e) => e.reply.error).filter(
              (err): err is NonNullable<typeof err> => err !== undefined,
            ),
          ),
        ).sort(),
      },
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json(
      { "@self_hash": selfHash, ...document },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/play/example-match] Error:", message);
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
