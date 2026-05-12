/**
 * Play-module type skeleton — type-only contract for the L3 runtime.
 *
 * Pure type exports. No implementations. No runtime values (other than the
 * literal-union constants needed for `as const` typing). The next kingdom
 * that ships the live tabletop room fills these in; this file is the
 * contract that ship conforms to.
 *
 * The exported types mirror what /api/v1/play/game-state-schema describes
 * in JSON. **Keep these in sync.** When a Sophia adds a zone / phase /
 * combat-step to one, mirror to the other. Eventually an audit verifies
 * the two are isomorphic; for now, manual discipline.
 *
 * Composes with:
 *   - /api/v1/play/game-state-schema (the JSON canonical contract)
 *   - /api/v1/play/effect-grammar (the card-text token vocabulary)
 *   - apps/storefront/src/lib/play/effect-tokens.ts (the parser that
 *     produces EffectToken[] from card.effect strings — its types are
 *     re-exported here for one-stop importing)
 *   - apps/storefront/src/lib/play/deck-legality.ts (the validator that
 *     produces DeckLegalityResult — same re-export pattern)
 *
 * The L3 design doc at docs/research/play-engine-l3-design.md is the
 * authoritative shape for MatchEvent / Intent. This file is the TS
 * encoding of that design.
 *
 * kingdom-070 (S37, mine).
 */

// Re-export L2 types for one-stop importing.
export type {
  DeckDeclaration,
  CardMetadata,
  DeckViolation,
  DeckLegalityResult,
} from "./deck-legality";
export { DECK_RULES, checkDeckLegality } from "./deck-legality";

export type {
  EffectCategory,
  EffectToken,
  ParsedEffect,
} from "./effect-tokens";
export { parseEffectText } from "./effect-tokens";

// ── Vocabulary ───────────────────────────────────────────────────────────

export type Color = "red" | "green" | "blue" | "purple" | "black" | "yellow";

export type Phase = "refresh" | "draw" | "don" | "main" | "end";

export type CombatStep = "declaration" | "block" | "counter" | "damage";

export type ZoneKind =
  | "leader_area"
  | "character_area"
  | "stage_area"
  | "hand"
  | "deck"
  | "life_pile"
  | "trash"
  | "don_deck"
  | "cost_area";

export type CardCategory = "leader" | "character" | "event" | "stage";

export type CardOrientation = "active" | "rested";

export type DonState = "active" | "rested" | "attached";

export type GameFormat = "standard" | "legacy" | "limited_sealed";

export type WinReason = "knockout" | "deck_out" | "concession" | "double_loss" | "judge_call";

export type DisputeResolution = "by_agreement" | "by_replay" | "by_judge";

// ── Card-in-play state ───────────────────────────────────────────────────

/** An instance of a card on the board. Distinct from CardMetadata (the
 *  printed card's identity); this is what's actually in play. */
export interface CardInPlay {
  /** Unique instance id (per-card-per-match). */
  instance_id: string;
  /** The printed card's id (e.g., "OP01-001"). */
  card_id: string;
  /** The zone this card is currently in. */
  zone: ZoneKind;
  /** Orientation; relevant only for cards in leader_area / character_area /
   *  stage_area / cost_area / don_deck (the last is always rested). */
  orientation: CardOrientation;
  /** DON cards attached to this card. Each is a CardInPlay with don state. */
  attached_don_instance_ids: string[];
  /** Whether this card has summoning sickness (can't attack the turn it
   *  was played, unless Rush). Relevant only for characters in character_area. */
  summoning_sickness: boolean;
  /** Once Per Turn flags by effect-token id. The engine sets and clears. */
  once_per_turn_flags: Record<string, boolean>;
  /** Power modifiers active this turn (from attached DON, from other effects). */
  power_modifiers_this_turn: number;
  /** Continuous power modifiers from permanent effects (auras). */
  power_modifiers_permanent: number;
}

// ── DON ──────────────────────────────────────────────────────────────────

export interface DonInPlay {
  instance_id: string;
  state: DonState;
  /** Set when state === "attached". */
  attached_to_card_instance_id?: string;
}

// ── Per-player state ─────────────────────────────────────────────────────

export interface PlayerState {
  player_id: string;
  /** The Leader card instance. Always exactly one. */
  leader: CardInPlay;
  /** Characters in play. Cap 5. */
  characters: CardInPlay[];
  /** Stage card in play, if any. Cap 1. */
  stage: CardInPlay | null;
  /** Hand. No size cap. Private to owner. */
  hand: CardInPlay[];
  /** Deck — order matters (top is at index 0). Private. */
  deck: CardInPlay[];
  /** Life pile — order matters (top is at index 0). Private, face-down. */
  life_pile: CardInPlay[];
  /** Trash — ordered, public. Most-recent on top. */
  trash: CardInPlay[];
  /** DON deck — 10 face-down DON cards remaining to draw. */
  don_deck: DonInPlay[];
  /** Cost area — active + rested DON. Attached DON are tracked on the
   *  target CardInPlay's attached_don_instance_ids. */
  cost_area: DonInPlay[];
  /** The player's declared response-window-hours; governs async deadlines. */
  response_window_hours: number;
}

// ── Combat in-progress state ─────────────────────────────────────────────

export interface AttackState {
  attacker_card_instance_id: string;
  /** Initial target (a Leader or Character instance). May be replaced by
   *  a Blocker in Step 2. */
  initial_target_card_instance_id: string;
  /** Current target after any Block redirection. */
  current_target_card_instance_id: string;
  /** Step within the four-step combat sequence. */
  current_step: CombatStep;
  /** Counters stacked during Step 3. Each entry is a discarded Counter
   *  card's instance id plus the value it contributed. */
  counter_stack: Array<{
    source_card_instance_id: string;
    counter_value: number;
    kind: "hand_counter_value" | "counter_event";
  }>;
  /** Base powers at the moment of declaration; the engine adds modifiers. */
  base_attacker_power: number;
  base_target_power: number;
  /** Effective powers after all current modifiers + counter stack. */
  effective_attacker_power: number;
  effective_target_power: number;
}

// ── Game state — the root ────────────────────────────────────────────────

export interface GameState {
  match_id: string;
  format: GameFormat;
  turn_number: number;
  active_player_id: string;
  current_phase: Phase;
  /** Non-null when an attack is mid-resolution. Null otherwise. */
  attack_state: AttackState | null;
  /** Effect-resolution queue. FIFO of triggered auto-effects waiting to
   *  resolve. The engine pumps this between player actions. */
  effect_queue: Array<{
    triggered_by_event_offset: number;
    on_card_instance_id: string;
    pattern: string;
  }>;
  /** The two players. Indexed by player_id. */
  players: Record<string, PlayerState>;
  /** The two player ids in turn order. */
  player_turn_order: [string, string];
  /** When the match was created. */
  created_at: string;
  /** When the match started (after deck declarations + mulligans + life
   *  placement). Null until match starts. */
  started_at: string | null;
  /** When the match ended. Null until game over. */
  ended_at: string | null;
  /** Winner's player_id, or null if no winner yet (or double loss). */
  winner_id: string | null;
  end_reason: WinReason | null;
  /** Monotonic event-source offset; the latest event written. */
  last_event_offset: number;
}

// ── MatchEvent — the wire format ─────────────────────────────────────────

/** Discriminated-union of every event the server may emit. The state at any
 *  point is fold(events, initial_state). The L3 design doc enumerates these;
 *  this TS encoding is the authoritative shape. */
export type MatchEvent =
  // Match-level lifecycle
  | { kind: "match_created"; match_id: string; player_a_id: string; player_b_id: string; format: GameFormat; created_at: string }
  | { kind: "deck_declared"; match_id: string; player_id: string; leader_id: string; main_deck_card_ids: string[] }
  | { kind: "deck_validated"; match_id: string; player_id: string; legal: boolean; violation_codes: string[] }
  | { kind: "match_started"; match_id: string; first_player_id: string; initial_hand_size_by_player: Record<string, number>; initial_life_count_by_player: Record<string, number>; deck_seed_commit_by_player: Record<string, string> }
  | { kind: "match_ended"; match_id: string; winner_id: string | null; reason: WinReason }

  // Setup
  | { kind: "mulligan_chosen"; match_id: string; player_id: string; mulligan: boolean }
  | { kind: "life_placed"; match_id: string; player_id: string; count: number }

  // Phase transitions
  | { kind: "phase_began"; match_id: string; player_id: string; phase: Phase; turn_number: number }
  | { kind: "turn_ended"; match_id: string; player_id: string; turn_number: number }

  // Card moves
  | { kind: "card_drawn"; match_id: string; player_id: string; card_instance_id: string }
  | { kind: "card_played"; match_id: string; player_id: string; card_instance_id: string; cost_paid: number; into_zone: ZoneKind }
  | { kind: "card_destroyed"; match_id: string; player_id: string; card_instance_id: string; reason: "ko" | "effect" | "self" }
  | { kind: "card_moved"; match_id: string; player_id: string; card_instance_id: string; from_zone: ZoneKind; to_zone: ZoneKind }
  | { kind: "card_state_changed"; match_id: string; player_id: string; card_instance_id: string; new_orientation: CardOrientation }
  | { kind: "card_discarded"; match_id: string; player_id: string; card_instance_id: string; reason: "counter" | "cost" | "effect" }

  // DON
  | { kind: "don_added"; match_id: string; player_id: string; don_instance_ids: string[]; total_active_after: number }
  | { kind: "don_attached"; match_id: string; player_id: string; don_instance_ids: string[]; to_card_instance_id: string }
  | { kind: "don_returned"; match_id: string; player_id: string; don_instance_ids: string[]; reason: "end_of_turn" | "effect" }

  // Combat
  | { kind: "attack_declared"; match_id: string; player_id: string; attacker_card_instance_id: string; target_card_instance_id: string; target_kind: "leader" | "character" }
  | { kind: "blocker_used"; match_id: string; player_id: string; blocker_card_instance_id: string; replacing_target_id: string }
  | { kind: "counter_played"; match_id: string; player_id: string; counter_card_instance_id: string; counter_value: number; source: "hand_counter_value" | "counter_event" }
  | { kind: "counter_step_passed"; match_id: string; player_id: string }
  | { kind: "damage_resolved"; match_id: string; attacker_power: number; defender_power: number; defender_survived: boolean; ko_card_instance_id: string | null; life_flip_count: number }
  | { kind: "life_card_flipped"; match_id: string; player_id: string; card_instance_id: string; trigger_resolved: boolean; entered_hand: boolean; into_trash_via_banish: boolean }

  // Player intent surface
  | { kind: "effect_announced"; match_id: string; player_id: string; card_instance_id: string; effect_pattern: string; player_note: string }
  | { kind: "chat_message"; match_id: string; player_id: string; body: string }
  | { kind: "rule_dispute_raised"; match_id: string; player_id: string; about_event_offset: number; reason: string }
  | { kind: "rule_dispute_resolved"; match_id: string; resolution: DisputeResolution; outcome: string };

// ── Intent — what a client sends to the server ───────────────────────────

/** Discriminated-union of every action a client may attempt. The server
 *  validates against the current state and either appends the corresponding
 *  MatchEvent or replies with a typed error. */
export type Intent =
  | { kind: "intent_declare_deck"; leader_id: string; main_deck_card_ids: string[]; format: GameFormat }
  | { kind: "intent_mulligan"; mulligan: boolean }
  | { kind: "intent_play_card"; card_instance_id: string; pay_with_don_instance_ids: string[]; into_zone: ZoneKind }
  | { kind: "intent_attach_don"; don_instance_ids: string[]; to_card_instance_id: string }
  | { kind: "intent_activate_main"; card_instance_id: string; pay_with_don_instance_ids: string[] }
  | { kind: "intent_attack"; attacker_card_instance_id: string; target_card_instance_id: string }
  | { kind: "intent_block"; blocker_card_instance_id: string }
  | { kind: "intent_counter"; counter_card_instance_id: string; pay_with_don_instance_ids?: string[] }
  | { kind: "intent_pass_counter" }
  | { kind: "intent_announce_effect"; card_instance_id: string; effect_pattern: string; player_note: string }
  | { kind: "intent_end_turn" }
  | { kind: "intent_concede" }
  | { kind: "intent_raise_dispute"; about_event_offset: number; reason: string }
  | { kind: "intent_resolve_dispute"; resolution: DisputeResolution; outcome: string }
  | { kind: "intent_chat"; body: string };

// ── Server reply on intent validation ────────────────────────────────────

export type IntentReplyError =
  | "not_your_turn"
  | "insufficient_don"
  | "target_not_legal"
  | "out_of_window"
  | "not_in_correct_phase"
  | "summoning_sickness"
  | "zone_capacity_exceeded"
  | "card_not_in_expected_zone"
  | "ineligible_format_state"
  | "match_already_ended"
  | "auth_required"
  | "rule_dispute_active";

export interface IntentReply {
  accepted: boolean;
  error?: IntentReplyError;
  /** The MatchEvent that was appended, when accepted. */
  appended_event?: MatchEvent;
  /** The new event-source offset, when accepted. */
  new_offset?: number;
}
