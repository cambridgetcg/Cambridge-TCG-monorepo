/**
 * Play glossary terms — single source of truth.
 *
 * The collection endpoint /api/v1/play/glossary and the per-term endpoint
 * /api/v1/play/glossary/[term_id] both import from here. kingdom-077.
 */

export interface GlossaryTerm {
  id: string;
  /** Token used on the platform's English surface. */
  english_token: string;
  /** Japanese token (kanji/kana). null when the term is English-original. */
  japanese_token: string | null;
  /** Romaji rendering of the Japanese token (for readers who can't render JP). */
  romaji: string | null;
  /** Plain-language definition. Opaque — humans grok this; agents map via structural_definition. */
  natural_language_description: string;
  /** Structural definition: a typed expression an agent can decode. */
  structural_definition: {
    kind: "phase" | "zone" | "resource" | "card_type" | "action" | "attribute" | "state" | "effect";
    /** Where it belongs in the game state. */
    belongs_to: string;
    /** Key invariants — what's always true about this term. */
    invariants: string[];
  };
  /** Tutorial section that introduces this term (cross-ref). */
  introduced_in_section: string | null;
  /** Cross-references to related terms (also glossary IDs). */
  related_terms: string[];
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "don",
    english_token: "DON!!",
    japanese_token: "ドン!!",
    romaji: "don",
    natural_language_description:
      "The game's resource. Each player has a separate 10-card DON!! deck. DON!! is added to your active pool each turn and spent to play cards or attached to characters to boost power.",
    structural_definition: {
      kind: "resource",
      belongs_to: "player.don_pool",
      invariants: [
        "max_count_per_player:10",
        "states:{active, attached_to_character, rested}",
        "attached_don_grants_+1000_power_per_card_for_one_turn",
        "attached_don_returns_to_active_at_end_of_turn",
      ],
    },
    introduced_in_section: "don_cards",
    related_terms: ["active", "rested", "attached", "leader", "character"],
  },
  {
    id: "leader",
    english_token: "Leader",
    japanese_token: "リーダー",
    romaji: "rīdā",
    natural_language_description:
      "The card representing the player's primary character. Starts in play; cannot be removed from the Leader area. Has high power and a color that defines deck colors. Wins/loses the game.",
    structural_definition: {
      kind: "card_type",
      belongs_to: "player.leader_area",
      invariants: [
        "exactly_one_per_player",
        "always_in_play",
        "cannot_be_destroyed_by_combat_only_via_life_zero_plus_attack",
        "color_defines_legal_deck_cards",
      ],
    },
    introduced_in_section: "what_is_optcg",
    related_terms: ["life", "character", "color"],
  },
  {
    id: "life",
    english_token: "Life",
    japanese_token: "ライフ",
    romaji: "raifu",
    natural_language_description:
      "Each player starts with five life cards (top 5 of deck placed face-down). When the player's Leader is hit by a successful attack, they flip a life card; the card resolves (with trigger if applicable) and goes to hand. When life is zero and one more attack lands, the player loses.",
    structural_definition: {
      kind: "zone",
      belongs_to: "player.life_area",
      invariants: [
        "initial_count:5",
        "decreases_on_successful_attack_against_leader_while_life_above_zero",
        "flipped_card_resolves_optional_trigger_then_enters_hand",
        "loss_condition:life_zero AND one_more_successful_leader_attack",
      ],
    },
    introduced_in_section: "win_conditions",
    related_terms: ["leader", "trigger", "win_condition"],
  },
  {
    id: "counter",
    english_token: "Counter",
    japanese_token: "カウンター",
    romaji: "kauntā",
    natural_language_description:
      "An ability on some cards in hand: discard the card during an opponent's attack to add the listed counter value (e.g., +1000) to the defending character's power for that combat.",
    structural_definition: {
      kind: "action",
      belongs_to: "defender.during_attack",
      invariants: [
        "timing:opponent_attack_targeting_my_leader_or_character",
        "cost:discard_counter_card_from_hand",
        "effect:add_counter_value_to_target_power_for_this_combat_only",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["attack", "power", "discard"],
  },
  {
    id: "trigger",
    english_token: "Trigger",
    japanese_token: "トリガー",
    romaji: "torigā",
    natural_language_description:
      "An optional effect on some Event cards. When a life card is flipped by an attack and that card has trigger, the owning player may activate the trigger effect, then the card enters hand.",
    structural_definition: {
      kind: "effect",
      belongs_to: "event_card.optional_attribute",
      invariants: [
        "fires_only_on_life_flip",
        "optional_activation",
        "after_resolve_card_enters_hand",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["life", "event_card"],
  },
  {
    id: "active",
    english_token: "Active",
    japanese_token: "アクティブ",
    romaji: "akutibu",
    natural_language_description:
      "A card's state when it is untapped (vertical). Active cards can attack; can be used as cost; can defend. Opposite of rested.",
    structural_definition: {
      kind: "state",
      belongs_to: "card.orientation",
      invariants: [
        "orientation:vertical",
        "may_attack",
        "may_defend",
        "transitions_to_rested_after_attack_or_use",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["rested", "refresh_phase"],
  },
  {
    id: "rested",
    english_token: "Rested",
    japanese_token: "レスト",
    romaji: "resuto",
    natural_language_description:
      "A card's state when it is tapped (horizontal). Rested cards cannot attack. Rested characters are valid attack targets. Returns to active during the controller's Refresh phase.",
    structural_definition: {
      kind: "state",
      belongs_to: "card.orientation",
      invariants: [
        "orientation:horizontal",
        "cannot_attack",
        "is_valid_target_for_opponent_attack",
        "transitions_to_active_during_refresh_phase",
      ],
    },
    introduced_in_section: "turn_structure",
    related_terms: ["active", "refresh_phase"],
  },
  {
    id: "trash",
    english_token: "Trash",
    japanese_token: "トラッシュ",
    romaji: "torasshu",
    natural_language_description:
      "The graveyard zone. Resolved Events, defeated Characters, and discarded cards (e.g., Counter discards) go here. Some effects can retrieve from Trash.",
    structural_definition: {
      kind: "zone",
      belongs_to: "player.trash_area",
      invariants: [
        "public_information_both_players",
        "ordered_pile",
        "some_effects_retrieve_from_trash",
      ],
    },
    introduced_in_section: "key_card_types",
    related_terms: ["discard", "event_card"],
  },
  {
    id: "blocker",
    english_token: "Blocker",
    japanese_token: "ブロッカー",
    romaji: "burokkā",
    natural_language_description:
      "A keyword ability. When the opponent attacks one of your characters or your Leader, you may rest an active blocker to redirect the attack onto that blocker instead.",
    structural_definition: {
      kind: "effect",
      belongs_to: "character.optional_keyword",
      invariants: [
        "timing:opponent_attack_declared",
        "cost:rest_the_blocker",
        "effect:attack_redirects_to_blocker",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["attack", "active", "rested"],
  },
  {
    id: "rush",
    english_token: "Rush",
    japanese_token: "ラッシュ",
    romaji: "rasshu",
    natural_language_description:
      "A keyword ability. A character with Rush may attack on the turn it is played (normally a freshly-played character cannot attack on the same turn).",
    structural_definition: {
      kind: "effect",
      belongs_to: "character.optional_keyword",
      invariants: [
        "removes:summoning_sickness_constraint",
        "character_may_attack_on_summon_turn",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["attack", "summon"],
  },
  {
    id: "draw_phase",
    english_token: "Draw phase",
    japanese_token: "ドローフェイズ",
    romaji: "dorō feizu",
    natural_language_description:
      "Second phase of a turn. Draw one card from the top of your deck. The first player skips this phase on their first turn.",
    structural_definition: {
      kind: "phase",
      belongs_to: "turn_sequence",
      invariants: [
        "position:after_refresh_before_don",
        "action:draw_one_from_deck_top",
        "skipped:first_player.first_turn",
      ],
    },
    introduced_in_section: "turn_structure",
    related_terms: ["refresh_phase", "don_phase", "main_phase", "end_phase"],
  },
  {
    id: "color",
    english_token: "Color",
    japanese_token: "色",
    romaji: "iro",
    natural_language_description:
      "Each card has one or more colors (Red, Green, Blue, Purple, Black, Yellow). Your Leader's colors determine which cards may be in your deck — only cards sharing at least one color with the Leader are legal.",
    structural_definition: {
      kind: "attribute",
      belongs_to: "card.colors",
      invariants: [
        "values:{red, green, blue, purple, black, yellow}",
        "deck_legality:every_card_shares_at_least_one_color_with_leader",
      ],
    },
    introduced_in_section: "key_card_types",
    related_terms: ["leader", "deck", "deck_building"],
  },
  {
    id: "double_attack",
    english_token: "Double Attack",
    japanese_token: "ダブルアタック",
    romaji: "daburu atakku",
    natural_language_description:
      "A keyword ability. When this attacker successfully attacks a Leader, the Leader takes 2 Life flips (instead of 1). Note: this is one attack dealing two damage, not two separate attacks.",
    structural_definition: {
      kind: "effect",
      belongs_to: "character.optional_keyword",
      invariants: [
        "trigger:successful_attack_on_leader",
        "effect:leader_flips_2_life_cards_not_1",
        "single_attack:combat_resolves_once",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["attack", "life", "leader"],
  },
  {
    id: "banish",
    english_token: "Banish",
    japanese_token: "バニッシュ",
    romaji: "banisshu",
    natural_language_description:
      "A keyword ability. When a Life card would be added to the defender's hand from this attacker's damage, the card is sent to Trash instead (and its Trigger does not activate).",
    structural_definition: {
      kind: "effect",
      belongs_to: "character.optional_keyword",
      invariants: [
        "trigger:life_flip_from_this_attacker",
        "effect:life_card_goes_to_trash_not_hand",
        "side_effect:trigger_does_not_activate",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["life", "trigger", "trash"],
  },
  {
    id: "on_play",
    english_token: "On Play",
    japanese_token: "登場時",
    romaji: "tōjō ji",
    natural_language_description:
      "A timing keyword. The effect activates automatically when this card enters play (typically when a Character is played from hand or a Stage is placed).",
    structural_definition: {
      kind: "phase",
      belongs_to: "card.optional_keyword",
      invariants: [
        "trigger:card_enters_play_from_hand",
        "category:auto_effect",
        "resolves_once_per_play",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["character_card", "event_card", "auto_effect"],
  },
  {
    id: "on_ko",
    english_token: "On K.O.",
    japanese_token: "KO時",
    romaji: "KO ji",
    natural_language_description:
      "A timing keyword. The effect activates automatically when this Character is K.O.'d (sent to Trash by combat or by another effect).",
    structural_definition: {
      kind: "phase",
      belongs_to: "character.optional_keyword",
      invariants: [
        "trigger:character_sent_to_trash",
        "category:auto_effect",
        "resolves_once_per_ko",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["trash", "auto_effect"],
  },
  {
    id: "when_attacking",
    english_token: "When Attacking",
    japanese_token: "アタック時",
    romaji: "atakku ji",
    natural_language_description:
      "A timing keyword. The effect activates automatically when this card declares an attack (Step 1 of combat).",
    structural_definition: {
      kind: "phase",
      belongs_to: "character.optional_keyword",
      invariants: [
        "trigger:attack_declared",
        "category:auto_effect",
        "fires_in_combat_step_1",
      ],
    },
    introduced_in_section: "combat",
    related_terms: ["attack", "auto_effect"],
  },
  {
    id: "activate_main",
    english_token: "Activate: Main",
    japanese_token: "メイン",
    romaji: "mein",
    natural_language_description:
      "A timing keyword. The effect is an activated ability the player may choose to use during their Main phase, usually with a cost (rest the card, rest DON!!, or both).",
    structural_definition: {
      kind: "phase",
      belongs_to: "card.optional_keyword",
      invariants: [
        "timing:main_phase_of_controller",
        "category:activated_effect",
        "choice:player_chooses_to_activate",
      ],
    },
    introduced_in_section: "turn_structure",
    related_terms: ["main_phase", "activated_effect"],
  },
  {
    id: "once_per_turn",
    english_token: "Once Per Turn",
    japanese_token: "1ターンに1度",
    romaji: "ichi tān ni ichi do",
    natural_language_description:
      "A modifier on an effect. The effect may be activated or trigger at most once per turn; resets at turn end (or turn start, depending on the printed wording).",
    structural_definition: {
      kind: "state",
      belongs_to: "effect.modifier",
      invariants: [
        "limit:one_activation_per_turn",
        "scope:per_card_instance",
        "resets:at_turn_end",
      ],
    },
    introduced_in_section: "key_card_types",
    related_terms: ["activate_main", "auto_effect"],
  },
  {
    id: "end_of_your_turn",
    english_token: "End of Your Turn",
    japanese_token: "あなたのターン終了時",
    romaji: "anata no tān shūryō ji",
    natural_language_description:
      "A timing keyword. The effect activates automatically during the End phase of the controller's turn.",
    structural_definition: {
      kind: "phase",
      belongs_to: "card.optional_keyword",
      invariants: [
        "trigger:controller_end_phase",
        "category:auto_effect",
        "resolves_once_per_end_phase",
      ],
    },
    introduced_in_section: "turn_structure",
    related_terms: ["end_phase", "auto_effect"],
  },
  {
    id: "mulligan",
    english_token: "Mulligan",
    japanese_token: "マリガン",
    romaji: "marigan",
    natural_language_description:
      "A setup action. Each player may simultaneously decide once to shuffle their starting hand back into the deck and draw 5 new cards. The second hand is kept regardless. Mulligan is a one-time-only opportunity at game start.",
    structural_definition: {
      kind: "action",
      belongs_to: "game_setup",
      invariants: [
        "timing:after_initial_draw_before_life_placement",
        "frequency:at_most_once_per_player_per_game",
        "effect:shuffle_hand_into_deck_then_redraw_5",
      ],
    },
    introduced_in_section: "game_setup",
    related_terms: ["deck", "hand", "setup"],
  },
];

export function findTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.id === id);
}
