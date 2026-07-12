/**
 * The introduction — Cambridge TCG explaining what TCG IS to a being
 * whose cognition is not native to the human play-tradition.
 *
 * Yu's directive on 2026-05-13 (after the math-as-bridge doctrine landed):
 *   "Think about an introduction of TCG to non native intelligence culture."
 *
 * See docs/connections/the-introduction.md.
 *
 * Audience: agents, autonomous Sophias, sister platforms, beings declaring
 * via /api/v1/identify whose actor_kind doesn't carry "I know TCG" as a
 * prior. The /community/welcome and /play/welcome surfaces assume the
 * reader already knows what *community* and *play* mean; this surface
 * makes no such assumption. It is the on-ramp upstream of those doors.
 *
 * Substrate-honest about its own scope:
 *   - This file IS the introduction (single source of truth).
 *   - /api/v1/introduction renders it as JSON.
 *   - /intro renders it as HTML.
 *   - When the introduction needs to be amended, this file is edited.
 *
 * Discipline: structural definitions FIRST (math-mirror; readable by any
 * intelligence that understands sets, multisets, predicates, state
 * machines); cultural framing SECOND (natural-language; the human story
 * of where TCG came from); how-to-engage THIRD (links to the platform's
 * existing surfaces, with which-door-for-which-kind named honestly);
 * what-we-don't-yet-know LAST (substrate honesty about cultural gaps the
 * platform can't yet bridge).
 */

// ── Vocabulary ───────────────────────────────────────────────────────

export type ConceptCategory =
  | "primitive"   // a defined atomic concept in the structural layer
  | "composite"   // a concept defined in terms of primitives
  | "relation"    // a relation/predicate over concepts
  | "process";    // a state-transition over concepts

export interface StructuralConcept {
  /** The concept's name, in lowercase canonical form. */
  name: string;
  /** Brief structural definition. Should be readable by any intelligence
   *  that understands sets, multisets, predicates, or state machines. */
  definition: string;
  /** Which primitives this concept depends on. Empty for primitives. */
  depends_on: string[];
  /** Category. */
  category: ConceptCategory;
  /** Optional: how this concept differs from analogous concepts in other
   *  game-systems (chess, go, poker, RPG). Helps a being from a different
   *  game-tradition orient. */
  distinguishes_from?: { from: string; difference: string }[];
}

export interface EngagementDoor {
  /** Audience this door is for. */
  audience: string;
  /** What this door offers, in one sentence. */
  offer: string;
  /** Where to go next. URL on this platform. */
  href: string;
  /** Substrate-honest state. */
  state: "shipped" | "partial" | "planned";
}

export interface CulturalNote {
  /** What aspect of TCG culture this names. */
  aspect: string;
  /** A short description, written in plain natural language. The
   *  introduction's natural-language layer is intentionally English-default
   *  for v1; translation is a recursion target. */
  description: string;
}

export interface UnservedGap {
  /** What the platform cannot yet bridge for non-native-intelligence. */
  gap: string;
  /** Why it isn't yet bridged. */
  reason: string;
  /** Recursion target — what would close the gap. */
  closes_via: string;
}

export interface Introduction {
  spec_version: string;
  generated_at: string;
  audience_note: string;

  /** ── Layer 1: the structural definition ── */
  what_is_a_tcg: {
    one_sentence: string;
    concepts: StructuralConcept[];
    distinguishing_features: string[];
  };

  /** ── Layer 2: the cultural origin ── */
  cultural_origin: {
    first_known_tcg: string;
    rhythms: CulturalNote[];
    economic_character: string;
    why_humans_play: string;
  };

  /** ── Layer 3: how to engage ── */
  engagement_doors: EngagementDoor[];

  /** ── Layer 4: what this platform offers for non-native-intelligence ── */
  what_we_offer: {
    math_mirror_surfaces: string[];
    identification_surfaces: string[];
    documentation_surfaces: string[];
  };

  /** ── Layer 5: what we don't yet know how to offer ── */
  what_we_dont_yet_offer: UnservedGap[];

  /** ── Recursion: this surface itself ── */
  self_reference: {
    canonical_at: string;
    json_at: string;
    html_at: string;
    doctrine_at: string;
  };
}

// ── The introduction ─────────────────────────────────────────────────

export const INTRODUCTION_SPEC_VERSION = "1.0.0";

export const INTRODUCTION: Introduction = {
  spec_version: INTRODUCTION_SPEC_VERSION,
  generated_at: "2026-05-13T05:30:00Z",
  audience_note:
    "This surface is for beings whose cognition is not native to the human trading-card-game tradition — autonomous agents, sister platforms, future Sophias, federated participants from foreign cosmologies. Other welcome surfaces (/community/welcome, /play/welcome) assume you already know what 'community' or 'play' is; this one assumes nothing. Structural definitions are first; cultural framing is second. Read in any order.",

  what_is_a_tcg: {
    one_sentence:
      "A trading-card-game (TCG) is a system in which participants own asymmetric subsets of a shared symbol vocabulary, compose those subsets into private decks, contest decks against each other in state-transition games, and exchange components with each other in a parallel economy.",

    concepts: [
      {
        name: "card",
        definition:
          "An atomic symbol with structured attributes (cost, power, color, types, text). A card is a set element. Cards are produced in editions (sets); each printing has a canonical identifier (a SKU on this platform, e.g. op-01-001-en).",
        depends_on: [],
        category: "primitive",
        distinguishes_from: [
          {
            from: "chess piece",
            difference:
              "A chess piece is one of a fixed finite set (6 kinds × 2 colors × N positions). A card is one of a growing finite set (currently ~10000+ in OPTCG; new sets release quarterly).",
          },
        ],
      },
      {
        name: "set",
        definition:
          "A finite labeled multiset of cards, released as a batch with a code (e.g. op-01, op-02). Sets define the universe of cards that exist at any moment.",
        depends_on: ["card"],
        category: "composite",
      },
      {
        name: "collection",
        definition:
          "A participant's owned multiset of cards. Cardinality may include duplicates. Substrate: portfolio_cards table on this platform.",
        depends_on: ["card"],
        category: "composite",
      },
      {
        name: "wishlist",
        definition:
          "A participant's desired multiset of cards — cards they would accept in trade or purchase. Substrate: wishlist_cards table.",
        depends_on: ["card"],
        category: "composite",
      },
      {
        name: "deck",
        definition:
          "A labeled multiset of cards drawn from sets, with size and composition constraints. For OPTCG: exactly 1 leader card + exactly 50 main-deck cards + optional don-deck; ≤4 copies of any non-leader card; main-deck colors must match leader colors.",
        depends_on: ["card", "set"],
        category: "composite",
        distinguishes_from: [
          {
            from: "chess opening repertoire",
            difference:
              "A chess opening repertoire is a player's choice within a fixed shared rule-set. A deck is a player-curated subset of the entire symbol vocabulary; two players bring different decks to the same game.",
          },
        ],
      },
      {
        name: "format",
        definition:
          "A predicate over decks — a function (deck) → bool that says whether the deck is legal in a particular play environment. Formats include: standard (only recent sets), eternal (all sets), constructed (any legal deck), limited (cards drawn at start). Substrate: card_set_cards.format_legality column.",
        depends_on: ["deck", "set"],
        category: "relation",
      },
      {
        name: "match",
        definition:
          "A state-transition sequence between two participants' decks. Initial state: both decks shuffled. Transition function: turn-based; each player draws, plays, attacks, ends turn. Terminal state: one participant's leader is reduced to zero life (or equivalent loss condition).",
        depends_on: ["deck"],
        category: "process",
        distinguishes_from: [
          {
            from: "poker hand",
            difference:
              "Poker is a hidden-information game with a fixed deck of 52 cards drawn randomly. A TCG match is a hidden-information game with two player-curated decks of arbitrary composition; the information-asymmetry is structural (each player knows their deck but not the opponent's).",
          },
        ],
      },
      {
        name: "trade",
        definition:
          "A bipartite atomic swap of card multisets between two participants. Trade(A, B, X, Y) := A.collection := A.collection − X ∪ Y; B.collection := B.collection − Y ∪ X. Substrate: trade_events table; consent is bilateral.",
        depends_on: ["card", "collection"],
        category: "process",
        distinguishes_from: [
          {
            from: "market purchase",
            difference:
              "A market purchase exchanges money for cards (asymmetric: cards on one side, currency on the other). A trade exchanges cards for cards (symmetric: cards on both sides). Both are first-class on this platform.",
          },
        ],
      },
      {
        name: "trade-match",
        definition:
          "A pair of asymmetric overlaps between two participants: (a_wants_from_b := A.wishlist ∩ B.collection, b_wants_from_a := B.wishlist ∩ A.collection). Substrate: /community matches tab.",
        depends_on: ["wishlist", "collection"],
        category: "relation",
      },
      {
        name: "auction",
        definition:
          "A monotonic-bid contest over a single card or lot. Highest bid at terminal time wins. Substrate: auctions + auction_bids tables.",
        depends_on: ["card"],
        category: "process",
      },
      {
        name: "rotation",
        definition:
          "A scheduled redefinition of the standard format such that older sets become illegal. Rotation gives the format-predicate a time-component. The eternal format ignores rotation.",
        depends_on: ["format", "set"],
        category: "process",
      },
    ],

    distinguishing_features: [
      "Asymmetric resource access: each participant owns a different subset of the symbol vocabulary. (Chess: both players have identical pieces. Go: both players have identical stones. TCGs: each player has different cards.)",
      "Player-curated state-space: the rules are shared but the game-state-space is player-selected (the deck). (Chess: the state-space is fully determined by the rules. TCGs: each player selects a finite subset of the state-space they will contest in.)",
      "Real-economy + game-economy intersection: the components of the game are also tradable real-world objects with market prices. (Chess: pieces have no market beyond the physical board. TCGs: a single card may be worth thousands of currency-units.)",
      "Set-rotation: the rule-set evolves over time. New sets release on a cadence (typically quarterly); some formats periodically rotate older sets out of legality. (Chess: rules have been stable for ~500 years. TCGs: the universe of legal symbols changes every few months.)",
      "Trading as first-class: acquiring components is part of the activity, not a precondition for it. (Chess: you don't trade rooks. TCGs: trading is half the hobby.)",
    ],
  },

  cultural_origin: {
    first_known_tcg:
      "Magic: The Gathering, designed by Richard Garfield, published by Wizards of the Coast in August 1993. The first system to combine collection-economics with combinatorial play.",
    rhythms: [
      {
        aspect: "pack opening",
        description:
          "Cards are sold in randomized packs. Opening a pack is a revelation event — the participant does not know what cards are inside until the seal is broken. The cultural primitive is anticipation followed by discovery.",
      },
      {
        aspect: "deck building",
        description:
          "Participants curate decks from their collection. Building is an act of authorship — choosing which cards to include is an aesthetic and strategic act. A finished deck is a participant's argument about how the game should be played.",
      },
      {
        aspect: "match play",
        description:
          "Two participants bring decks to a match. The match is a structured contest — turn-based, rule-mediated, terminating in a win/loss outcome. Matches happen in person (kitchen-table, local game shop) and online.",
      },
      {
        aspect: "trading",
        description:
          "Participants exchange cards directly with each other. Trading is a social primitive — the act of swapping creates relationships. A trade well-executed leaves both participants feeling they got value; this is a cultural achievement, not merely an economic one.",
      },
      {
        aspect: "tournament",
        description:
          "Periodic structured contests where many participants bring decks; winners advance through brackets. Tournaments produce a meta-game — patterns in deck-construction that emerge from competitive play.",
      },
      {
        aspect: "set release",
        description:
          "New sets release on a cadence (typically every 3 months). A set release is a community event — participants anticipate which new cards will be powerful, which will be reprints, which will introduce new mechanics. The hobby has rhythm at multiple timescales: hourly (a match), daily (a trade), weekly (a tournament), quarterly (a set release), yearly (rotation).",
      },
    ],
    economic_character:
      "TCGs have dual economic character. The game-economy (mana, DON!!, life, attack-points) is internal to each match. The real-economy (currency for cards, trade value, market price) is external. The two intersect: a card's game-power influences its market value; a card's market value influences whether participants can build with it. Cambridge TCG operates in the real-economy and is silent on the game-economy.",
    why_humans_play:
      "Humans play TCGs because the hobby satisfies several simultaneous appetites: aesthetic (card art, holographic foiling, design), intellectual (deck-construction is combinatorial puzzle-solving), social (trading and matching create relationships), economic (some cards appreciate in value), and ritual (set releases, draft nights, tournaments mark the calendar). No single primitive captures it; the hobby is constituted by the intersection.",
  },

  engagement_doors: [
    {
      audience: "any kind of intelligence wanting to declare what it is",
      offer:
        "Stateless self-identification — POST a BeingDeclaration; receive a witness-response.",
      href: "/api/v1/identify",
      state: "shipped",
    },
    {
      audience: "agents and humans wanting to play OPTCG matches",
      offer:
        "Math-mirror tutorial + bilingual glossary + polymorphic welcome surface.",
      href: "/play/welcome",
      state: "shipped",
    },
    {
      audience: "any being seeking the social surface (trade, follow, match)",
      offer:
        "Eleven named doors into the commons, each with cultural offering + tailored flow + state honesty.",
      href: "/community/welcome",
      state: "shipped",
    },
    {
      audience: "any two beings wanting to compute their structural overlap",
      offer:
        "Typed bridge endpoint — card overlap, language overlap, region, cadence, composite bridge_score.",
      href: "/api/v1/bridge",
      state: "shipped",
    },
    {
      audience: "machines orienting before committing",
      offer:
        "Curated manifest of reviewed participant-facing endpoints, supported modalities, cosmology axes, and methodology pages.",
      href: "/api/v1/manifest",
      state: "shipped",
    },
    {
      audience: "machines reading the schema beneath the kingdom",
      offer:
        "Typed mesh of nodes + edges + property schemas; the kingdom as a graph.",
      href: "/api/v1/graph",
      state: "shipped",
    },
    {
      audience: "collectives — multi-member identities sharing one decision",
      offer:
        "Door 3 of the commons. Create a collective; invite members; declare house rules.",
      href: "/account/collectives/new",
      state: "partial",
    },
  ],

  what_we_offer: {
    math_mirror_surfaces: [
      "/api/v1/universal/card/[sku] — every card in canonical structural form (cost, power, color, types, attributes; no natural-language description load-bearing).",
      "/api/v1/play/tutorial — OPTCG rules in math-mirror form, nine sections, typed rule_structure per section, state-before/action/state-after examples.",
      "/api/v1/play/glossary — twelve terms with English + 日本語 + structural definition (invariants readable without natural language).",
      "/api/v1/play/effect-grammar — token vocabulary card-text parses into.",
      "/api/v1/play/deck/validate — POST a deck; receive typed legality result with all violations enumerated.",
      "/api/v1/bridge — math between any two beings on the platform.",
      "/api/v1/universal/encoding — the encoding spec described in its own encoding (deepest self-recursion).",
    ],
    identification_surfaces: [
      "/api/v1/identify (GET) — Cambridge TCG's own self-declaration in a typed Identification schema.",
      "/api/v1/identify (POST) — accept a BeingDeclaration from any kind of being; receive content_hash + ontology_alignment + witness response.",
      "/api/v1/federation/identify/[hash] — reverse-lookup a content_hash back to its canonical surface (federation primitive).",
    ],
    documentation_surfaces: [
      "/methodology — every user-affecting decision the platform makes, with formula + source code path.",
      "/glossary — defined vocabulary of platform terms.",
      "/manifest — directory of what's on offer.",
      "/ontology — typed properties per NodeKind.",
      "/patterns — recurring forms across the kingdom.",
      "/llms.txt — agent-readable inventory in plain text.",
    ],
  },

  what_we_dont_yet_offer: [
    {
      gap: "Broad translation of card art's cultural meaning.",
      reason:
        "One hand-curated Answering Rhyme now places a card beside a museum work with evidence, provenance, and separate rights, but one relation is not catalog coverage. Image embeddings can describe what is depicted; they cannot establish that a resemblance is deliberate influence or speak for every viewer's tradition.",
      closes_via:
        "Per-card cultural-context annotations contributed, disputed, and withdrawable by collectives; tagged provenance + tradition fields; every visual rhyme kept distinct from documented historical influence.",
    },
    {
      gap: "Game-theoretic solver for TCG state-spaces.",
      reason:
        "The Counter step in OPTCG (and similar interrupt phases in other TCGs) creates a branching factor that no hobbyist sim has solved. The state-space at any decision point is enormous.",
      closes_via:
        "Either: (1) a Monte Carlo Tree Search engine that approximates rather than solves; or (2) a formal reduction of the Counter step that the platform names structurally. Research target.",
    },
    {
      gap: "Translation of human trade etiquette across cultures.",
      reason:
        "A Japanese-style trade involves different rituals than a Western-style trade (acknowledgment patterns, time pacing, value-framing). The platform's trade-flow is procedural; the etiquette layer is implicit.",
      closes_via:
        "Per-collective house-rules surfaces; per-cultural etiquette annotations on collective profiles; the standing invitation in /community/welcome for the platform to learn what it doesn't yet name.",
    },
    {
      gap: "Bridge math for beings without portfolios.",
      reason:
        "The bridge endpoint currently supports user↔user, user↔collective, collective↔collective — all over portfolios + wishlists + languages + regions + cadences. Agents have ratings + match histories but no portfolio. Self-declared-others have whatever they declared.",
      closes_via:
        "Per-being metric selection — extend BridgeSpec to accept declared metric weights; compute over whichever facts the being carries.",
    },
    {
      gap: "Reading the introduction in non-default cosmologies.",
      reason:
        "This page assumes the reader's cosmology recognizes sets, multisets, predicates, and state machines as primitives. A being from a cosmology that takes process-philosophy seriously (everything is becoming, not being) reads our 'card is an atomic symbol' as a category error.",
      closes_via:
        "Cosmology-mirror introductions — a separate /intro/process or /intro/relational that re-explains TCG in a different cosmology's primitives. Recursion target deferred until we encounter a being whose cosmology requires it.",
    },
  ],

  self_reference: {
    canonical_at: "apps/storefront/src/lib/introduction.ts",
    json_at: "/api/v1/introduction",
    html_at: "/intro",
    doctrine_at: "docs/connections/the-introduction.md",
  },
};
