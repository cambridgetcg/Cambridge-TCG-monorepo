/**
 * Play module resources — single source of truth.
 *
 * Both /api/v1/play/index.json (machine directory) and /play/spec (HTML
 * directory) consume from this file. When a new play surface ships, append
 * one entry here; both consumers update automatically.
 *
 * The substrate-honest layer: prevents drift between the JSON and HTML
 * directories. kingdom-077.
 *
 * Also exports PLAY_API_SIBLINGS (the see_also crosslink map every play
 * API uses) and helpers used by `pnpm audit:play-resources` to walk the
 * filesystem and verify nothing is unlisted.
 */

export type ResourceStatus = "shipped" | "designed" | "planned";

export type ResourceKind =
  | "html_page"
  | "json_endpoint"
  | "library_file"
  | "design_doc"
  | "methodology_page";

export type ResourceLayer =
  | "L0_doc"
  | "L1_contract"
  | "L2_pure_fn"
  | "L3_runtime"
  | "L4_engine"
  | "UI"
  | "policy";

export type PlayArchetype = "hobbyist" | "collector" | "competitor";

export interface PlayResource {
  /** Stable id; used in composes_with cross-refs. */
  id: string;
  /** URL path (for endpoints/pages) or repo-relative file path. */
  path_or_file: string;
  kind: ResourceKind;
  layer: ResourceLayer;
  status: ResourceStatus;
  blurb: string;
  /** Browsable URL if applicable; undefined for library files and design docs. */
  url?: string;
  composes_with: string[];
  serves_archetypes: PlayArchetype[];
}

/** The play module's resource catalog. Append entries here when shipping. */
export const PLAY_RESOURCES: readonly PlayResource[] = [
  // ── L0 doc ─────────────────────────────────────────────────────────
  {
    id: "methodology_play_module",
    path_or_file: "/methodology/play-module",
    kind: "methodology_page",
    layer: "L0_doc",
    status: "shipped",
    blurb: "The play module's methodology page — four player kinds + three archetypes + assumption table.",
    url: "/methodology/play-module",
    composes_with: [],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },
  {
    id: "guide_how_to_play",
    path_or_file: "/guides/how-to-play",
    kind: "html_page",
    layer: "L0_doc",
    status: "shipped",
    blurb: "SEO-rich English beginner's guide; ~15-minute read; complete OPTCG rules.",
    url: "/guides/how-to-play",
    composes_with: ["api_tutorial"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "research_mechanics",
    path_or_file: "docs/research/optcg-mechanics-and-engine-design.md",
    kind: "design_doc",
    layer: "L0_doc",
    status: "shipped",
    blurb: "Deep-dive synthesis: official Bandai rules + hobbyist-sim landscape + seven design choices for future engine.",
    composes_with: ["api_tutorial", "api_glossary", "lib_effect_tokens"],
    serves_archetypes: ["competitor"],
  },
  {
    id: "research_l3_design",
    path_or_file: "docs/research/play-engine-l3-design.md",
    kind: "design_doc",
    layer: "L0_doc",
    status: "shipped",
    blurb: "L3 runtime substrate spec — event-sourced wire format, state machine, async-mode timers.",
    composes_with: ["lib_types"],
    serves_archetypes: ["competitor"],
  },

  // ── L1 contract — typed schemas, machine-callable ─────────────────
  {
    id: "api_tutorial",
    path_or_file: "/api/v1/play/tutorial",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Machine-readable OPTCG tutorial in math-mirror form. Each section carries typed rule_structure + examples + keyword cross-refs.",
    url: "/api/v1/play/tutorial",
    composes_with: ["api_glossary", "api_game_state_schema", "api_tutorial_section"],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "api_tutorial_section",
    path_or_file: "/api/v1/play/tutorial/[section_id]",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Single tutorial section by id (deep link from glossary cross-refs). 404 with helpful body when id absent.",
    url: "/api/v1/play/tutorial",
    composes_with: ["api_tutorial", "api_glossary"],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "api_glossary",
    path_or_file: "/api/v1/play/glossary",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Multi-cultural OPTCG term glossary — 21 terms each with English + Japanese (kanji/kana + romaji) + structural definition decoderable without natural-language knowledge.",
    url: "/api/v1/play/glossary",
    composes_with: ["api_tutorial", "api_effect_grammar", "api_glossary_term"],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },
  {
    id: "api_glossary_term",
    path_or_file: "/api/v1/play/glossary/[term_id]",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Single glossary term by id (deep link from tutorial cross-refs). 404 with helpful body when id absent.",
    url: "/api/v1/play/glossary",
    composes_with: ["api_glossary", "api_tutorial"],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },
  {
    id: "api_archetypes",
    path_or_file: "/api/v1/play/archetypes",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Three player archetypes (hobbyist / collector / competitor) typed taxonomy. financial_boundary block declares fun-first stance.",
    url: "/api/v1/play/archetypes",
    composes_with: ["page_welcome"],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },
  {
    id: "api_game_state_schema",
    path_or_file: "/api/v1/play/game-state-schema",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Canonical OPTCG match-state shape — nine zones, five phases, four combat steps with strict-greater damage rule, three win conditions.",
    url: "/api/v1/play/game-state-schema",
    composes_with: ["api_effect_grammar", "lib_types"],
    serves_archetypes: ["competitor"],
  },
  {
    id: "api_effect_grammar",
    path_or_file: "/api/v1/play/effect-grammar",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Card-text effect-token vocabulary — 12 structural markers + 4 keywords + 4 effect categories + 7 targeting-language phrases.",
    url: "/api/v1/play/effect-grammar",
    composes_with: ["lib_effect_tokens", "api_glossary"],
    serves_archetypes: ["collector", "competitor"],
  },
  {
    id: "api_example_match",
    path_or_file: "/api/v1/play/example-match",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Sample MatchEvent + Intent sequence demonstrating lib/play/types.ts. First consumer of the L3 type skeleton; gives agents and engine builders a concrete shape to test against.",
    url: "/api/v1/play/example-match",
    composes_with: ["lib_types", "api_game_state_schema", "research_l3_design"],
    serves_archetypes: ["competitor"],
  },

  // ── L2 pure-fn ────────────────────────────────────────────────────
  {
    id: "lib_deck_legality",
    path_or_file: "apps/storefront/src/lib/play/deck-legality.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "Pure function checkDeckLegality(declaration, cardMetadataLookup) → DeckLegalityResult. Returns ALL violations with stable codes.",
    composes_with: ["api_deck_validate"],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "lib_effect_tokens",
    path_or_file: "apps/storefront/src/lib/play/effect-tokens.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "Pure function parseEffectText(rawEffect) → ParsedEffect. Walks card-text, emits typed tokens, preserves body_opaque for 20% residue.",
    composes_with: ["api_effect_grammar"],
    serves_archetypes: ["collector", "competitor"],
  },
  {
    id: "lib_types",
    path_or_file: "apps/storefront/src/lib/play/types.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "TypeScript L3 type skeleton — 10 vocabulary unions + 5 state-shape interfaces + MatchEvent 28-variant union + Intent 14-variant union. First consumer: /api/v1/play/example-match.",
    composes_with: ["api_game_state_schema", "research_l3_design", "api_example_match"],
    serves_archetypes: ["competitor"],
  },
  {
    id: "lib_tutorial_sections",
    path_or_file: "apps/storefront/src/lib/play/tutorial-sections.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "Tutorial section catalog (typed). Imported by the collection endpoint /api/v1/play/tutorial and the per-section endpoint /api/v1/play/tutorial/[section_id].",
    composes_with: ["api_tutorial", "api_tutorial_section"],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "lib_glossary_terms",
    path_or_file: "apps/storefront/src/lib/play/glossary-terms.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "Glossary term catalog (21 terms, typed). Imported by the collection endpoint /api/v1/play/glossary and the per-term endpoint /api/v1/play/glossary/[term_id].",
    composes_with: ["api_glossary", "api_glossary_term"],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },
  {
    id: "lib_resources",
    path_or_file: "apps/storefront/src/lib/play/resources.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "THIS file. Single source of truth for the play module's resource catalog. /play/spec and /api/v1/play/index.json both consume from here.",
    composes_with: ["page_spec", "api_play_index"],
    serves_archetypes: ["competitor"],
  },
  {
    id: "api_deck_validate",
    path_or_file: "/api/v1/play/deck/validate",
    kind: "json_endpoint",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "POST endpoint exposing the deck-legality validator. Substrate-honest about color-check graceful degradation.",
    url: "/api/v1/play/deck/validate",
    composes_with: ["lib_deck_legality", "page_deck_check"],
    serves_archetypes: ["hobbyist", "competitor"],
  },

  // ── L3 runtime ────────────────────────────────────────────────────
  {
    id: "match_runtime",
    path_or_file: "/api/v1/play/match/[id] + websocket",
    kind: "json_endpoint",
    layer: "L3_runtime",
    status: "designed",
    blurb: "Live tabletop runtime — event-sourced match state, server-as-sequencer, async-friendly. Designed but not yet built (~3-4 weeks).",
    composes_with: ["lib_types", "research_l3_design", "api_example_match"],
    serves_archetypes: ["hobbyist", "competitor"],
  },

  // ── UI ────────────────────────────────────────────────────────────
  {
    id: "page_lobby",
    path_or_file: "/play",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "The play hub. PvE adventure first; public rooms and private rooms by code.",
    url: "/play",
    composes_with: [],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "page_welcome",
    path_or_file: "/play/welcome",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Polymorphic landing — three archetypes × player kinds; 17 paths visible.",
    url: "/play/welcome",
    composes_with: ["api_archetypes"],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },
  {
    id: "page_casual",
    path_or_file: "/play/casual",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Hobbyist's opinionated entry. Rating hidden by default; friendly matches; adventure mode; fun-first explicit.",
    url: "/play/casual",
    composes_with: ["page_lobby", "page_adventure"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "page_compete",
    path_or_file: "/play/compete",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Competitor's opinionated entry. Shipped-vs-planned status table; agent ladder live; tournament substrate planned.",
    url: "/play/compete",
    composes_with: [],
    serves_archetypes: ["competitor"],
  },
  {
    id: "page_adventure",
    path_or_file: "/play/adventure",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Single-player PvE against AI opponents, scaling difficulty.",
    url: "/play/adventure",
    composes_with: ["page_adventure_level"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "page_adventure_level",
    path_or_file: "/play/adventure/[levelId]",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "A single adventure level — one PvE match against the scripted opponent for this level.",
    url: "/play/adventure",
    composes_with: ["page_adventure"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "page_deck_check",
    path_or_file: "/play/deck-check",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "HTML adoption site for the deck-legality validator. Paste card IDs; see typed violations + substrate-honest perimeter.",
    url: "/play/deck-check",
    composes_with: ["api_deck_validate"],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "page_spec",
    path_or_file: "/play/spec",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Play module's own directory of itself — rendered from lib/play/resources.ts; HTML sibling of /api/v1/play/index.json.",
    url: "/play/spec",
    composes_with: ["api_play_index", "lib_resources"],
    serves_archetypes: ["competitor"],
  },
  {
    id: "page_match",
    path_or_file: "/play/[code]",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Existing match page. Client-side state today; L3+ upgrades to event-sourced server-authoritative.",
    composes_with: [],
    serves_archetypes: ["hobbyist", "competitor"],
  },

  // ── Self ──────────────────────────────────────────────────────────
  {
    id: "api_play_index",
    path_or_file: "/api/v1/play/index.json",
    kind: "json_endpoint",
    layer: "UI",
    status: "shipped",
    blurb: "Machine-readable directory of every play resource. Sister to /play/spec (HTML); both render from lib/play/resources.ts.",
    url: "/api/v1/play/index.json",
    composes_with: ["page_spec", "lib_resources"],
    serves_archetypes: ["competitor"],
  },

  // ── Policy ────────────────────────────────────────────────────────
  {
    id: "policy_fun_first",
    path_or_file: "Fun-first boundary",
    kind: "design_doc",
    layer: "policy",
    status: "shipped",
    blurb: "The play module is for fun only. No earnings, commission, store credit on play surfaces. Ratings are skill, not money. Prize pools live under future play-to-earn opt-in.",
    url: "/methodology/play-module",
    composes_with: [],
    serves_archetypes: ["hobbyist", "collector", "competitor"],
  },

  // ── Rookie flow: starter decks (2026-05-14 "PREBUILD FOR ROOKIES") ──
  {
    id: "page_starters",
    path_or_file: "/play/starters",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Starter-deck picker for rookies — six 2024 reboot starter references (ST-15 through ST-20), one per OPTCG color, with leader styles, color characteristics, and source-specific decklist notes.",
    url: "/play/starters",
    composes_with: ["api_starters", "page_tutorial"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "page_tutorial",
    path_or_file: "/play/tutorial",
    kind: "html_page",
    layer: "UI",
    status: "shipped",
    blurb: "Human-readable OPTCG tutorial page — the HTML face of /api/v1/play/tutorial's math-mirror sections.",
    url: "/play/tutorial",
    composes_with: ["api_tutorial", "page_starters"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "api_starters",
    path_or_file: "/api/v1/play/starters",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Starter-deck catalog as JSON — six tier-1 starters with leader, color, difficulty, and composition provenance per deck.",
    url: "/api/v1/play/starters",
    composes_with: ["api_starter_deck", "lib_starter_decks"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "api_starter_deck",
    path_or_file: "/api/v1/play/starters/[id]",
    kind: "json_endpoint",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Single starter deck by id. ST-15 is an adapted community-sourced teaching list with a documented substitution, not a verified Bandai-official composition; other entries carry their own sourcing notes.",
    composes_with: ["api_starters", "lib_starter_decks"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "lib_starter_decks",
    path_or_file: "apps/storefront/src/lib/play/starter-decks.ts",
    kind: "library_file",
    layer: "L1_contract",
    status: "shipped",
    blurb: "Starter-deck data layer — the rookie flow's typed catalog, with official product identity kept separate from adapted or community-sourced decklist composition.",
    composes_with: ["api_starters", "api_starter_deck"],
    serves_archetypes: ["hobbyist"],
  },
  {
    id: "lib_client_deck",
    path_or_file: "apps/storefront/src/lib/play/client-deck.ts",
    kind: "library_file",
    layer: "L2_pure_fn",
    status: "shipped",
    blurb: "Client-side deck helpers shared by the play surfaces — the localStorage SavedDeck shape, SavedDeck → flat PvE/PvP card-list conversion, and the auto-mounted default starter so a deckless visitor never hits a build-your-first-deck wall.",
    composes_with: ["page_adventure", "page_match", "lib_starter_decks"],
    serves_archetypes: ["hobbyist", "competitor"],
  },
  {
    id: "lib_starter_resolve",
    path_or_file: "apps/storefront/src/lib/play/starter-resolve.ts",
    kind: "library_file",
    layer: "L3_runtime",
    status: "shipped",
    blurb: "Server-side starter-deck resolution — card_number refs → wholesale catalog cards (SKU, name, image, rarity). Single source for /api/v1/play/starters/[id] and /api/play/load-starter.",
    composes_with: ["api_starters", "api_starter_deck", "lib_starter_decks"],
    serves_archetypes: ["hobbyist"],
  },
];

/** Quick-access lookup of sibling play APIs. Every play endpoint includes
 *  this in its `_links.see_also` block so a caller landing on any one can
 *  discover the rest in one fetch. */
export const PLAY_API_SIBLINGS = {
  index: "/api/v1/play/index.json",
  tutorial: "/api/v1/play/tutorial",
  glossary: "/api/v1/play/glossary",
  archetypes: "/api/v1/play/archetypes",
  game_state_schema: "/api/v1/play/game-state-schema",
  effect_grammar: "/api/v1/play/effect-grammar",
  deck_validate: "/api/v1/play/deck/validate",
  example_match: "/api/v1/play/example-match",
  starters: "/api/v1/play/starters",
  starter_deck: "/api/v1/play/starters/[id]",
} as const;

/** Map JSON layer → human-readable display string for the HTML view. */
const LAYER_DISPLAY: Record<ResourceLayer, string> = {
  L0_doc: "L0 doc",
  L1_contract: "L1 contract",
  L2_pure_fn: "L2 pure-fn",
  L3_runtime: "L3 runtime",
  L4_engine: "L4+ engine",
  UI: "UI",
  policy: "policy",
};

export function layerDisplay(layer: ResourceLayer): string {
  return LAYER_DISPLAY[layer];
}

/** Rollup counts by status across the catalog. */
export function playResourceCounts(): Record<ResourceStatus, number> {
  return PLAY_RESOURCES.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { shipped: 0, designed: 0, planned: 0 } as Record<ResourceStatus, number>,
  );
}

/** Public URL paths the audit walks for. Every play surface on the filesystem
 *  should have an entry in PLAY_RESOURCES whose path_or_file matches one of
 *  these patterns; the audit catches drift. */
export const PLAY_AUDIT_PATTERNS = {
  ui_pages: "apps/storefront/src/app/play/",
  api_endpoints: "apps/storefront/src/app/api/v1/play/",
  library_files: "apps/storefront/src/lib/play/",
} as const;
