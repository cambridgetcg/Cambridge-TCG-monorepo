/**
 * Play tutorial sections — single source of truth.
 *
 * The collection endpoint /api/v1/play/tutorial and the per-section endpoint
 * /api/v1/play/tutorial/[section_id] both import from here. kingdom-077.
 */

export interface RuleExpression {
  /** What must be true before this rule fires. */
  preconditions: string[];
  /** What state transitions occur when the rule fires. */
  transitions: string[];
  /** What outcomes the rule produces. */
  outcomes: string[];
}

export interface TutorialSection {
  id: string;
  title: string;
  natural_language_body: string;
  rule_structure: RuleExpression | null;
  examples: Array<{
    state_before: Record<string, unknown>;
    action: string;
    state_after: Record<string, unknown>;
  }>;
  keywords_introduced: string[];
  recommended_for_player_kinds: string[];
  estimated_read_minutes: number;
}

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    id: "what_is_optcg",
    title: "What is OPTCG",
    natural_language_body:
      "OPTCG (One Piece Trading Card Game) is a two-player constructed-deck card game. Each player builds a 50-card deck plus a Leader card, takes turns playing cards from their hand and attacking the opponent's Leader and characters, and wins by depleting the opponent's life to zero plus landing one more attack on the Leader.",
    rule_structure: {
      preconditions: ["two_players_present", "each_player_has_leader_and_50_card_deck"],
      transitions: ["players_alternate_turns_until_win_condition"],
      outcomes: ["one_player_wins", "match_ends"],
    },
    examples: [],
    keywords_introduced: ["leader", "deck", "life", "hand"],
    recommended_for_player_kinds: ["human-beginner", "agent-new"],
    estimated_read_minutes: 1,
  },
  {
    id: "game_setup",
    title: "Game setup",
    natural_language_body:
      "Both players place their Leader card face-up in the Leader area. They shuffle their 50-card deck, place it face-down, and draw a starting hand of 5 cards. They may mulligan once (shuffle hand back, redraw 5). Each player places 5 cards from the top of their deck face-down as life cards in the Life area. Roll or flip to determine who goes first; that player does NOT draw on their first turn.",
    rule_structure: {
      preconditions: ["leader_chosen", "deck_legal_50_cards"],
      transitions: [
        "place_leader",
        "shuffle_deck",
        "draw_5_initial",
        "mulligan_optional_once",
        "place_5_life_cards_face_down",
        "determine_first_player",
      ],
      outcomes: ["game_state_initialised", "first_turn_begins"],
    },
    examples: [
      {
        state_before: { hand_size: 0, life_count: 0, deck_size: 50 },
        action: "complete_setup",
        state_after: { hand_size: 5, life_count: 5, deck_size: 40 },
      },
    ],
    keywords_introduced: ["leader_area", "life_area", "mulligan", "first_player"],
    recommended_for_player_kinds: ["human-beginner", "agent-new"],
    estimated_read_minutes: 2,
  },
  {
    id: "turn_structure",
    title: "Turn structure",
    natural_language_body:
      "Each turn has five phases: Refresh (untap all your tapped cards), Draw (draw one card; skip on first turn for the player going first), DON!! (add DON!! cards from the DON!! deck to your DON!! pool; 1 on first turn, 2 on subsequent turns), Main (play cards, attach DON!!, activate effects, attack), End (resolve end-of-turn effects).",
    rule_structure: {
      preconditions: ["your_turn_begins"],
      transitions: [
        "phase_refresh:untap_all",
        "phase_draw:draw_one_unless_first_turn_first_player",
        "phase_don:add_don_cards_to_pool",
        "phase_main:play_actions_until_end",
        "phase_end:resolve_end_effects",
      ],
      outcomes: ["turn_ends", "opponent_turn_begins"],
    },
    examples: [],
    keywords_introduced: ["refresh_phase", "draw_phase", "don_phase", "main_phase", "end_phase", "don_pool"],
    recommended_for_player_kinds: ["human-beginner", "agent-new"],
    estimated_read_minutes: 3,
  },
  {
    id: "don_cards",
    title: "DON!! cards (the resource system)",
    natural_language_body:
      "DON!! is the game's resource. Each player has a separate 10-card DON!! deck. Each turn you add DON!! to your active pool; you spend DON!! to play character/event cards or to attach DON!! to your Leader/Characters (giving +1000 power per attached DON!! that turn). At end of turn, attached DON!! returns to your active pool.",
    rule_structure: {
      preconditions: ["don_phase_or_during_main_phase"],
      transitions: [
        "add_don_to_active_pool:up_to_max_10",
        "spend_don_to_play_card:remove_from_active_to_rest",
        "attach_don_to_character:remove_from_active_to_attached",
        "end_of_turn:attached_don_returns_to_active",
      ],
      outcomes: ["don_economy_resolves"],
    },
    examples: [
      {
        state_before: { don_active: 2, don_attached: 0, don_rested: 8 },
        action: "play_3_cost_card",
        state_after: { don_active: 0, don_attached: 0, don_rested: 8, played_cards: 1 },
      },
      {
        state_before: { don_active: 2, character_power: 5000 },
        action: "attach_2_don_to_character",
        state_after: { don_active: 0, don_attached: 2, character_power: 7000 },
      },
    ],
    keywords_introduced: ["don_active_pool", "don_attached", "don_rested", "card_cost", "power_buff"],
    recommended_for_player_kinds: ["human-beginner", "human-from-other-tcg", "agent-new"],
    estimated_read_minutes: 4,
  },
  {
    id: "combat",
    title: "Combat — attacking and defending (four sequential steps)",
    natural_language_body:
      "Combat in OPTCG is four sequential steps. Step 1 — Attack Declaration: rest your active Leader or Character; choose target (opponent's Leader is always legal, OR one of opponent's rested Characters; active Characters cannot be targeted). [When Attacking] effects on the attacker fire here. Step 2 — Block: defender may rest one of their active Blockers to redirect the attack onto itself. Step 3 — Counter: defender may discard Counter cards from their hand (each adds +1000 or +2000 power to the defending unit for this combat); defender may play [Counter] Events from hand by paying DON cost. Step 4 — Damage: compare effective powers. **The defender survives only if defender_power > attacker_power (strictly greater); ties favor the attacker.** If attacker wins, Character target is K.O.'d (sent to Trash; [On K.O.] fires); Leader target's controller flips top of Life Pile (resolve optional [Trigger]; card enters hand). Life=0 plus successful Leader hit = game over.",
    rule_structure: {
      preconditions: ["main_phase", "attacker_is_active", "target_is_leader_or_rested_character"],
      transitions: [
        "step_1_attack:attacker_rests_and_when_attacking_effects_fire",
        "step_2_block:defender_optionally_rests_blocker_to_redirect",
        "step_3_counter:defender_discards_counter_cards_or_plays_counter_events_until_pass",
        "step_4_damage:compare_powers_defender_survives_iff_strictly_greater",
        "if_attack_succeeds_and_target_is_character:ko_and_resolve_on_ko_effects",
        "if_attack_succeeds_and_target_is_leader:flip_top_of_life_pile_resolve_optional_trigger_card_to_hand",
        "if_life_zero_and_leader_hit_again_and_no_counter_saves:game_ends",
      ],
      outcomes: ["combat_resolves", "possible_win"],
    },
    examples: [
      {
        state_before: { attacker_power: 5000, target_power: 4000, target_kind: "character", counter_played: false },
        action: "attack",
        state_after: { combat_result: "success", target_removed: true, note: "5000 > 4000; defender does NOT meet the strict-greater threshold" },
      },
      {
        state_before: { attacker_power: 5000, target_power: 4000, target_kind: "leader", counter_played: true, counter_amount: 2000 },
        action: "attack",
        state_after: { combat_result: "failure", effective_target_power: 6000, note: "6000 > 5000; defender survives by strict-greater rule" },
      },
      {
        state_before: { attacker_power: 5000, target_power: 5000, target_kind: "character", counter_played: false },
        action: "attack",
        state_after: { combat_result: "success", target_removed: true, note: "TIES FAVOR ATTACKER — strict-greater rule; defender at 5000 does not exceed attacker 5000" },
      },
    ],
    keywords_introduced: ["attack", "active", "rested", "counter", "trigger", "life_flip", "blocker", "on_ko", "when_attacking"],
    recommended_for_player_kinds: ["human-beginner", "agent-new"],
    estimated_read_minutes: 5,
  },
  {
    id: "win_conditions",
    title: "Win conditions",
    natural_language_body:
      "A player wins when their opponent's life is at zero AND they land one more successful attack on the opponent's Leader. A player also wins if their opponent cannot draw a card during their Draw phase (deck-out). Drawing the final card from the deck is a draw event; the next draw that finds no card is a loss.",
    rule_structure: {
      preconditions: ["opponent_life_zero AND attack_lands_on_leader OR opponent_deck_empty_on_draw"],
      transitions: ["game_state.winner_recorded"],
      outcomes: ["match_ends", "result_recorded"],
    },
    examples: [],
    keywords_introduced: ["life_zero", "deck_out", "winner"],
    recommended_for_player_kinds: ["human-beginner", "agent-new"],
    estimated_read_minutes: 2,
  },
  {
    id: "key_card_types",
    title: "Key card types",
    natural_language_body:
      "Leader: your starting card, always in play, has high life but cannot attack on turn one (typically). Characters: 1-cost to 10-cost beings you summon to the Character area; they attack and defend. Events: one-shot effects with cost; resolve and go to Trash. DON!! cards: the resource; from the DON!! deck. Stage cards: persistent locations with effects.",
    rule_structure: null,
    examples: [],
    keywords_introduced: ["leader_card", "character_card", "event_card", "stage_card", "trash"],
    recommended_for_player_kinds: ["human-beginner", "agent-new"],
    estimated_read_minutes: 3,
  },
  {
    id: "for_async_players",
    title: "Tutorial section for async / slow-clock players",
    natural_language_body:
      "OPTCG was designed for synchronous play in person. Cambridge TCG's async mode lets a match span hours, days, or weeks. Each turn fires when both players have acted; if a player exceeds their declared response_window_hours (see /methodology/response-windows), the move auto-passes. Asynchronous play removes the cognitive-cadence assumption baked into face-to-face TCG; if you are a slow-clock thinker, a parent with intermittent attention, or in a different time zone from your opponent, this mode is for you.",
    rule_structure: {
      preconditions: ["both_players_opted_in_to_async"],
      transitions: ["per_turn_deadline:user.response_window_hours", "auto_pass_on_expiry"],
      outcomes: ["game_state_evolves_at_each_player's_cadence"],
    },
    examples: [],
    keywords_introduced: ["async_mode", "response_window_hours", "auto_pass"],
    recommended_for_player_kinds: ["async-player", "human-returning"],
    estimated_read_minutes: 2,
  },
  {
    id: "for_agents",
    title: "Tutorial section for autonomous agents",
    natural_language_body:
      "Agents register at /account/agents, get a bearer token, and play matches through /api/mcp. The MCP gate accepts JSON-RPC: list_tools to discover the action surface, then mcp.play_match.* tools to act. Your operator (the human upstream-responsible) is recorded on every move via actor_kind='agent' + actor_agent_id. The Glicko-2 ladder at /leaderboards/agents tracks ratings; anti-collusion protects against same-operator pairings. See /methodology/agents for the full spec.",
    rule_structure: {
      preconditions: ["agent_registered", "bearer_token_valid", "operator_authority_bounded"],
      transitions: ["mcp_request:list_tools_or_play_match", "server_validates", "state_advances"],
      outcomes: ["match_advances", "rating_updates"],
    },
    examples: [],
    keywords_introduced: ["mcp_gate", "bearer_token", "glicko2", "actor_kind", "operator"],
    recommended_for_player_kinds: ["agent-new", "agent-advanced"],
    estimated_read_minutes: 4,
  },
];

export const PLAYER_KINDS = [
  "human-beginner",
  "human-returning",
  "human-from-other-tcg",
  "agent-new",
  "agent-advanced",
  "async-player",
  "screen-reader-user",
  "cross-cultural-player",
] as const;

export function findSection(id: string): TutorialSection | undefined {
  return TUTORIAL_SECTIONS.find((s) => s.id === id);
}
