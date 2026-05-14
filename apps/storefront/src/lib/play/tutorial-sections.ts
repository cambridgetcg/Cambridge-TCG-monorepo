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
    id: "what_is_a_card_game",
    title: "First, what is a trading card game?",
    natural_language_body:
      "A trading card game (TCG) is a strategy game played with cards that each player buys, trades, or collects. Both players bring their own deck of cards. The game is played in turns: each turn, you draw cards from the top of your deck, hold them in your hand (private to you), and play cards from your hand onto the table to score, attack, defend, or set up bigger plays. The goal is usually to reduce the opponent's resource to zero — in some games that's life points, in some it's prize cards, in OPTCG it's life cards. Each TCG has its own rules but the universal pieces are: deck (face-down stack of cards), hand (private to owner), table (the shared play area), turns (alternating), and a win condition. If you've never played any TCG before, that's exactly who this tutorial is for.",
    rule_structure: {
      preconditions: ["two_players_present", "each_brings_own_deck"],
      transitions: [
        "draw_from_deck_to_hand",
        "play_from_hand_to_table",
        "alternate_turns",
      ],
      outcomes: ["one_player_wins_via_game_specific_condition"],
    },
    examples: [],
    keywords_introduced: ["tcg", "deck", "hand", "turn", "win_condition"],
    recommended_for_player_kinds: ["human-absolute-beginner", "human-beginner"],
    estimated_read_minutes: 1,
  },
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
    id: "the_playmat",
    title: "The playmat — where things go on the table",
    natural_language_body:
      "Each player has eight zones on their side of the table, sourced from Bandai's official Rule Manual. Your Leader sits in the centre-left (the Leader Area, face-up, immobile). To its right is the Stage (face-up, max one card at a time). To the right of that is your Main Deck (face-down, the count is public, the contents are private). Above the Leader stretches your Character Area — up to five Characters in a row, face-up. Top-left is your Life pile (face-down, secret to BOTH players unless an effect reveals — even you can't peek). Bottom-left is your DON!! Deck (face-down, but the content is open to both players). Bottom-centre is your Cost Area where active and rested DON!! sit. Bottom-right is your Trash (face-up, ordered, either player may inspect). The opposite side of the table is your opponent's mirror. The four field zones (Leader, Character, Stage, Cost) are collectively called 'the field'.",
    rule_structure: {
      preconditions: ["game_setup_complete"],
      transitions: [],
      outcomes: ["zones_occupy_official_positions"],
    },
    examples: [
      {
        state_before: { zone: "leader_area", visibility: "public", mobility: "immobile" },
        action: "place_leader_at_setup",
        state_after: { zone: "leader_area", contents: "1_leader_card_face_up" },
      },
      {
        state_before: { zone: "life", visibility: "secret_to_both" },
        action: "place_5_life_cards_face_down_at_setup",
        state_after: { zone: "life", count: 5, contents: "face_down_hidden_from_both_players" },
      },
    ],
    keywords_introduced: [
      "leader_area",
      "character_area",
      "stage_area",
      "main_deck",
      "trash",
      "cost_area",
      "don_deck",
      "life_area",
      "field",
    ],
    recommended_for_player_kinds: ["human-absolute-beginner", "human-beginner"],
    estimated_read_minutes: 2,
  },
  {
    id: "card_anatomy",
    title: "How to read a card",
    natural_language_body:
      "Every card has a few fields you'll read repeatedly. (1) Name — the character or event. (2) Cost — the number of DON!! you must rest to play this card from hand (Leader cards have no cost; they're placed at setup). (3) Power — used in battle, the higher number wins (with one exception named below). (4) Counter — a number printed on most Character cards (0, 1000, or 2000) usable from hand during the opponent's attack to boost your defender's power. (5) Color hexagon — bottom-left, showing the card's colors. Your deck can only include cards of colors your Leader has. (6) Type and Traits — short labels for tribal effects. (7) Effect text — what the card does, written in a small block at the bottom; we don't enforce effects in the current engine but the text tells you what would happen in a real game. (8) Block number — bottom-right, used to determine which sets are legal in Standard format.",
    rule_structure: {
      preconditions: ["card_visible_in_hand_or_field"],
      transitions: [],
      outcomes: ["player_can_interpret_card_fields"],
    },
    examples: [],
    keywords_introduced: ["cost", "power", "counter", "color", "trait", "effect_text", "block_number"],
    recommended_for_player_kinds: ["human-absolute-beginner", "human-beginner"],
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
    id: "try_it",
    title: "Try it — your first game",
    natural_language_body:
      "You've read the substrate. Now play. The /play page accepts anonymous visitors with a guest cookie — no sign-in required. The deck builder is at /deck-builder; build a small deck (at least 10 cards) and the Play button takes you to Level 1, East Blue Rookie versus Alvida (Easy). The engine runs the turn loop, applies your moves server-side, generates Alvida's responses, and shows you the game log. The first time through, expect the action menu to feel busy — that's normal; the next-phase / +DON!! / End Turn buttons walk you through the turn structure. If you lose, no penalty — try again. If you win, the kingdom remembers your progress in this browser. Sign in to save it across devices and unlock Berries-rewards, but only when you want.",
    rule_structure: {
      preconditions: ["tutorial_read_or_skimmed", "deck_built_in_deck_builder"],
      transitions: ["click_play_button", "engine_initializes_match", "play_first_turn"],
      outcomes: ["first_match_in_progress", "learning_by_doing"],
    },
    examples: [],
    keywords_introduced: ["deck_builder", "guest_play", "pve", "adventure_mode"],
    recommended_for_player_kinds: ["human-absolute-beginner", "human-beginner"],
    estimated_read_minutes: 1,
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
