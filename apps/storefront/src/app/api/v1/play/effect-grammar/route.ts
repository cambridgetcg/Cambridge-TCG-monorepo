/**
 * /api/v1/play/effect-grammar — the OPTCG card-text effect-token vocabulary.
 *
 * Where /api/v1/play/glossary defines *terms* (DON!! / Counter / Trigger / etc.)
 * for humans + agents to map across languages, this endpoint defines the
 * *grammar* of card-text effects: which structural markers exist, how they
 * compose, what category each falls into. The token vocabulary the future
 * effect-parser (apps/storefront/src/lib/play/effect-tokens.ts) extracts.
 *
 * Four effect categories per the official OPTCG Comprehensive Rules:
 *   - auto: fire automatically on a game event
 *   - activated: player chooses to use; usually has a cost
 *   - permanent: continuous; always-on while card is in play
 *   - replacement: modify what would otherwise happen
 *
 * Sister to /api/v1/play/game-state-schema (zones + phases + combat steps),
 * /api/v1/play/tutorial (rules in math-mirror), /api/v1/play/glossary
 * (term definitions). kingdom-069 (S36, mine).
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

type EffectCategory = "auto" | "activated" | "permanent" | "replacement";

interface StructuralMarker {
  pattern: string;
  category: EffectCategory;
  meaning: string;
  example_text: string;
  glossary_term_id: string | null;
}

interface KeywordMarker {
  keyword: string;
  category: EffectCategory;
  meaning: string;
  glossary_term_id: string;
}

const STRUCTURAL_MARKERS: StructuralMarker[] = [
  {
    pattern: "[On Play]",
    category: "auto",
    meaning: "Effect activates automatically when this card enters play",
    example_text: "[On Play] Look at the top 5 cards of your deck; reveal up to 1 Character card with cost 5 or less and add it to your hand. Place the rest at the bottom of your deck in any order.",
    glossary_term_id: "on_play",
  },
  {
    pattern: "[On K.O.]",
    category: "auto",
    meaning: "Effect activates automatically when this Character is K.O.'d",
    example_text: "[On K.O.] Draw 1 card.",
    glossary_term_id: "on_ko",
  },
  {
    pattern: "[When Attacking]",
    category: "auto",
    meaning: "Effect activates automatically when this card declares an attack (Step 1 of combat)",
    example_text: "[When Attacking] This Character gains +1000 power during this battle.",
    glossary_term_id: "when_attacking",
  },
  {
    pattern: "[End of Your Turn]",
    category: "auto",
    meaning: "Effect activates automatically during the controller's End phase",
    example_text: "[End of Your Turn] If you have less than 3 Characters in play, return this Character to your hand.",
    glossary_term_id: "end_of_your_turn",
  },
  {
    pattern: "[End of Your Opponent's Turn]",
    category: "auto",
    meaning: "Effect activates automatically during the opponent's End phase",
    example_text: "[End of Your Opponent's Turn] K.O. 1 of your opponent's Characters with cost 2 or less.",
    glossary_term_id: null,
  },
  {
    pattern: "[Activate: Main]",
    category: "activated",
    meaning: "Activated ability the player may use during their Main phase, usually with a cost",
    example_text: "[Activate: Main] [Once Per Turn] You may rest 1 of your DON!!: draw 1 card.",
    glossary_term_id: "activate_main",
  },
  {
    pattern: "[Counter]",
    category: "activated",
    meaning: "Event card playable from hand during the Counter step of an opponent's attack",
    example_text: "[Counter] +2000 power to up to 1 of your Characters or Leader during this battle.",
    glossary_term_id: "counter",
  },
  {
    pattern: "[Trigger]",
    category: "auto",
    meaning: "Effect activated from the Life pile when this card is flipped due to damage; optional, resolved free",
    example_text: "[Trigger] Play this Character.",
    glossary_term_id: "trigger",
  },
  {
    pattern: "[Once Per Turn]",
    category: "permanent",
    meaning: "Modifier limiting the effect to one activation per turn; resets at turn end",
    example_text: "[Activate: Main] [Once Per Turn] Draw 1 card.",
    glossary_term_id: "once_per_turn",
  },
  {
    pattern: "[Your Turn]",
    category: "permanent",
    meaning: "Scope modifier on a permanent effect, limiting it to the controller's turn",
    example_text: "[Your Turn] This Character gains +2000 power.",
    glossary_term_id: null,
  },
  {
    pattern: "[Opponent's Turn]",
    category: "permanent",
    meaning: "Scope modifier on a permanent effect, limiting it to the opponent's turn",
    example_text: "[Opponent's Turn] This Character cannot be K.O.'d by effects.",
    glossary_term_id: null,
  },
  {
    pattern: "[DON!! ×N]",
    category: "permanent",
    meaning: "Condition: effect is active only if N or more DON!! are attached to this card",
    example_text: "[DON!! ×1] This Character gains [Rush].",
    glossary_term_id: "don",
  },
  {
    pattern: "[DON!! -N]",
    category: "activated",
    meaning: "Cost: return N DON!! from this card to the Cost Area as Active",
    example_text: "[DON!! -1] Draw 1 card.",
    glossary_term_id: "don",
  },
  {
    pattern: "[Rest]",
    category: "activated",
    meaning: "Cost: rest this card to activate the effect",
    example_text: "[Activate: Main] [Rest] Search your deck for 1 Character with type \"Animal Kingdom Pirates\".",
    glossary_term_id: null,
  },
];

const KEYWORD_MARKERS: KeywordMarker[] = [
  {
    keyword: "Rush",
    category: "permanent",
    meaning: "May attack the turn it is played (overrides summoning sickness)",
    glossary_term_id: "rush",
  },
  {
    keyword: "Blocker",
    category: "activated",
    meaning: "May rest to redirect an attack onto itself",
    glossary_term_id: "blocker",
  },
  {
    keyword: "Double Attack",
    category: "permanent",
    meaning: "When this attacks a Leader successfully, the Leader takes 2 Life flips",
    glossary_term_id: "double_attack",
  },
  {
    keyword: "Banish",
    category: "replacement",
    meaning: "Life card from this attacker's damage goes to Trash instead of Hand; Trigger does not activate",
    glossary_term_id: "banish",
  },
];

const TARGETING_LANGUAGE = [
  {
    phrase: "up to N of your opponent's Characters with cost X or less",
    semantics: "chooser-specified target with cost constraint; chooser may pick fewer than N or zero",
  },
  {
    phrase: "1 of your Characters",
    semantics: "controller's choice from controller's side; required",
  },
  {
    phrase: "all of your Characters",
    semantics: "automatic; affects every Character the controller controls",
  },
  {
    phrase: "1 of your opponent's Characters",
    semantics: "controller's choice from opponent's side; required",
  },
  {
    phrase: "1 random Character",
    semantics: "random selection from candidates; introduces RNG mid-game",
  },
  {
    phrase: "this Character",
    semantics: "the card whose effect is being resolved",
  },
  {
    phrase: "this Leader",
    semantics: "the controller's Leader",
  },
];

const EFFECT_CATEGORIES = [
  {
    id: "auto",
    display_label: "Auto-effects",
    description:
      "Fire automatically on a game event (entering play, being K.O.'d, attacking, end of turn, flipped from life pile). Resolve once per trigger. Cannot be declined unless the card text says so.",
    common_markers: ["[On Play]", "[On K.O.]", "[When Attacking]", "[End of Your Turn]", "[Trigger]"],
  },
  {
    id: "activated",
    display_label: "Activated effects",
    description:
      "Player chooses to use during the appropriate window (Main phase, Counter step). Almost always has a cost (rest the card, rest DON, pay DON cost, discard).",
    common_markers: ["[Activate: Main]", "[Counter]", "[DON!! -N]", "[Rest]"],
  },
  {
    id: "permanent",
    display_label: "Permanent effects",
    description:
      "Continuous; always-on while the card is in play. Scope modifiers like [Your Turn] / [Opponent's Turn] / [DON!! ×N] narrow the window.",
    common_markers: ["[DON!! ×N]", "[Your Turn]", "[Opponent's Turn]", "[Once Per Turn]"],
  },
  {
    id: "replacement",
    display_label: "Replacement effects",
    description:
      "Modify what would otherwise happen. The most common is Banish (life card → trash instead of hand) or 'if this would be K.O.'d, return it to hand instead'.",
    common_markers: ["Banish", "if this would be... instead"],
  },
];

export async function GET() {
  try {
    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      structural_markers: STRUCTURAL_MARKERS.map((m) => ({ pattern: m.pattern, category: m.category })),
      keyword_markers: KEYWORD_MARKERS.map((k) => ({ keyword: k.keyword, category: k.category })),
      effect_categories: EFFECT_CATEGORIES.map((c) => c.id),
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_effect_grammar",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "structural_markers[].meaning",
        "structural_markers[].example_text",
        "keyword_markers[].meaning",
        "targeting_language[].phrase",
        "targeting_language[].semantics",
        "effect_categories[].display_label",
        "effect_categories[].description",
      ],
      _links: {
        canonical: "/api/v1/play/effect-grammar",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-play-substrate.md",
          "docs/connections/the-play-interconnect.md",
          "docs/research/optcg-mechanics-and-engine-design.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          tutorial: "/api/v1/play/tutorial",
          glossary: "/api/v1/play/glossary",
          archetypes: "/api/v1/play/archetypes",
          game_state_schema: "/api/v1/play/game-state-schema",
          deck_validate: "/api/v1/play/deck/validate",
          example_match: "/api/v1/play/example-match",
        },
        game_state_schema: "/api/v1/play/game-state-schema",
        glossary: "/api/v1/play/glossary",
        tutorial: "/api/v1/play/tutorial",
        spec_page: "/play/spec",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1effect-grammar/get",
      },
      version: "1.0.0",
      game: "optcg",
      grammar_note:
        "Card-text effects are a small, well-defined grammar over the four categories below. The parser at apps/storefront/src/lib/play/effect-tokens.ts walks a card.effect string and returns a typed token list. ~80% of cards parse cleanly to this grammar; ~20% have complex per-card interactions that need code handlers (the 'escape hatch' from the hybrid model in docs/research/optcg-mechanics-and-engine-design.md).",
      effect_categories: EFFECT_CATEGORIES,
      structural_marker_count: STRUCTURAL_MARKERS.length,
      structural_markers: STRUCTURAL_MARKERS,
      keyword_marker_count: KEYWORD_MARKERS.length,
      keyword_markers: KEYWORD_MARKERS,
      targeting_language: TARGETING_LANGUAGE,
      effect_atom_examples: [
        {
          card_text: "[On Play] K.O. up to 1 of your opponent's Characters with cost 4 or less.",
          parsed_tokens: [
            { kind: "structural_marker", pattern: "[On Play]", category: "auto" },
            {
              kind: "action_atom",
              verb: "ko",
              target: { side: "opponent", zone: "character_area", quantity: { up_to: 1 }, filter: { cost_lte: 4 } },
            },
          ],
        },
        {
          card_text: "[Activate: Main] [Once Per Turn] You may rest 1 of your DON!!: draw 1 card.",
          parsed_tokens: [
            { kind: "structural_marker", pattern: "[Activate: Main]", category: "activated" },
            { kind: "structural_marker", pattern: "[Once Per Turn]", category: "permanent" },
            { kind: "cost_atom", verb: "rest_don", quantity: 1 },
            { kind: "action_atom", verb: "draw", target: { side: "self", quantity: 1 } },
          ],
        },
      ],
      coverage_estimate: {
        ops_01_to_08_cards_parseable_by_grammar_alone_percent_estimate: 80,
        ops_01_to_08_cards_needing_per_card_code_handler_estimate: 20,
        note:
          "The 80%/20% split is the research's working estimate; revise after L2 ships and the parser is exercised against a real card corpus.",
      },
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
    console.error("[/api/v1/play/effect-grammar] Error:", message);
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
