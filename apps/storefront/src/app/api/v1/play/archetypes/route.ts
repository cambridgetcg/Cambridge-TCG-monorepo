/**
 * /api/v1/play/archetypes — the three player archetypes.
 *
 * Yu's directive 2026-05-12: *"Structure it for both hobbyist who love the
 * game, collectors who wanted to learn more, and serious players competing
 * for prizes. Think about the different types of players and what they
 * need to build tailored modules and flows for each."*
 *
 * Where the *player kinds* (human / agent / async / screen-reader /
 * cross-cultural) name HOW a player interacts with the platform, the
 * *archetypes* name WHY they're here:
 *
 *   - Hobbyist: loves the game. Casual play, social, weekly events, learning.
 *   - Collector: loves the cards. Set completion, lore, art, deep card knowledge.
 *   - Competitor: loves the contest. Ranked play, tournaments, prizes (play-to-earn).
 *
 * Each archetype gets its own tailored landing page (/play/casual,
 * /play/compete, plus collector flows lives at /portfolio + /market + /cards
 * outside /play). This endpoint surfaces the archetype taxonomy as
 * machine-readable data so an agent declaring itself can pick which
 * archetype it embodies — substrate composes with sister's /api/v1/identify.
 *
 * Sister to S32 (the inclusive-tutorial layer) and S30 (bilateral identify).
 * kingdom-060 (S33, mine).
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

interface Archetype {
  id: string;
  display_label: string;
  pull_quote: string;
  what_they_love: string;
  primary_needs: string[];
  flows_served_today: Array<{
    label: string;
    path: string;
    note: string;
  }>;
  flows_planned: Array<{
    label: string;
    note: string;
  }>;
  financial_stance: "fun_only" | "may_involve_play_to_earn_when_shipped" | "not_a_play_surface";
  composes_with_player_kinds: string[];
  doctrinal_grounding: string[];
}

const ARCHETYPES: Archetype[] = [
  {
    id: "hobbyist",
    display_label: "Hobbyist",
    pull_quote: "I love this game.",
    what_they_love:
      "The game itself — the flow of a turn, the satisfaction of a clever line of play, the joy of pulling off a combo, the company of fellow fans. Wins are nice; the playing is the point.",
    primary_needs: [
      "Easy onboarding (no rating pressure, no prize pressure)",
      "Friendly opponents (humans + agents at all skill levels)",
      "Variety (themed weekly events, novel formats, casual modes)",
      "Adventure mode against AI for solo enjoyment",
      "Social: friends, casual rooms, optional spectator",
      "No earnings pressure — fun is the reward",
    ],
    flows_served_today: [
      { label: "Lobby", path: "/play", note: "Public rooms, private rooms via code" },
      { label: "Adventure status", path: "/play/adventure", note: "Read-only levels and prior progress; battles and rewards are paused" },
      { label: "Hobbyist landing", path: "/play/casual", note: "Opinionated entry-point for relaxed play; no ratings on the surface" },
      { label: "How-to-play guide", path: "/guides/how-to-play", note: "Long-form beginner's tutorial" },
      { label: "Welcome", path: "/play/welcome", note: "Polymorphic landing routed by archetype × player kind" },
    ],
    flows_planned: [
      { label: "Themed weekly events", note: "Format-of-the-week, theme-of-the-week — non-prize variety surface" },
      { label: "Friend lists", note: "Persistent connections between hobbyists" },
      { label: "Casual replay viewer", note: "Watch your own past matches; no judge framing" },
    ],
    financial_stance: "fun_only",
    composes_with_player_kinds: [
      "human-beginner",
      "human-returning",
      "human-from-other-tcg",
      "async-player",
      "screen-reader-user",
      "cross-cultural-player",
    ],
    doctrinal_grounding: ["substrate-honesty", "meaning"],
  },
  {
    id: "collector",
    display_label: "Collector",
    pull_quote: "I love the cards.",
    what_they_love:
      "The objects themselves — the art, the rarity, the variant, the story behind each printing. The collector might play occasionally, but the deep need is to know each card, see each set complete, follow the catalog's evolution.",
    primary_needs: [
      "Deep card knowledge (per-card pages with full text, lore, errata, art credits)",
      "Set completion tracking (mine + global progress)",
      "Card-art appreciation (high-res images, variant comparisons)",
      "Lore connections (which One Piece arc each card depicts)",
      "Structural catalog browsing (legacy price values and historical reconstruction are withheld)",
      "Portfolio tracking (mine vs target completion percentage)",
      "Provenance: when first listed, in which set, what variants exist",
    ],
    flows_served_today: [
      { label: "Card catalog (universal)", path: "/api/v1/universal/games", note: "Browse games → sets → cards through math-mirror endpoints" },
      { label: "Per-card universal", path: "/api/v1/universal/card/[sku]", note: "Current structural identity and edges; legacy price magnitudes and media are null" },
      { label: "Date-shaped compatibility view", path: "/api/at/[date]/card/[sku]", note: "Current structural fields under a requested date label; not historical reconstruction" },
      { label: "Portfolio", path: "/account/portfolio", note: "Your collection tracked (auth required for write; reads honest about what's shown)" },
      { label: "Market browse", path: "/market", note: "Cards available for acquisition (commerce surface — separate from play)" },
      { label: "Sets browse", path: "/api/v1/universal/sets/[game]", note: "Every set in a game, with completion-context for collectors" },
    ],
    flows_planned: [
      { label: "Per-card lore page", note: "Which One Piece arc; which character; what scene the art depicts" },
      { label: "Set completion progress page", note: "Visual % completion per set; missing cards highlighted" },
      { label: "Variant comparison surface", note: "Alt-arts, foils, misprints side-by-side" },
      { label: "Card history timeline", note: "First appearance, errata, reprints, all on one canvas" },
    ],
    financial_stance: "not_a_play_surface",
    composes_with_player_kinds: [
      "human-beginner",
      "human-returning",
      "cross-cultural-player",
      "screen-reader-user",
    ],
    doctrinal_grounding: ["substrate-honesty", "transparency", "meaning"],
  },
  {
    id: "competitor",
    display_label: "Competitor",
    pull_quote: "I love the contest.",
    what_they_love:
      "The structured contest — the ladder, the bracket, the tournament arc, the meta evolving across weeks. Wins matter; rating matters; in serious play, prizes matter. The competitor wants the platform's most-tested infrastructure under their match.",
    primary_needs: [
      "Glicko-2 ladder with confidence intervals (skill, not money)",
      "Tournament structure (registration, brackets, swiss, single/double elim)",
      "Match reporting + judge interaction",
      "Replay system for post-match review and contest verification",
      "Deck registration + sideboard rules per format",
      "Meta analysis / tier lists",
      "Schedule of upcoming events",
      "Anti-cheat / integrity surfaces",
      "Prize pools (when play-to-earn lands — separate opt-in)",
    ],
    flows_served_today: [
      { label: "Agent ladder status", path: "/leaderboards/agents", note: "Publication paused; no agent or rating rows returned" },
      { label: "Competitor landing", path: "/play/compete", note: "Opinionated entry-point; competition-focused surfaces" },
      { label: "Agent surface", path: "/methodology/agents", note: "Anti-collusion, operator authority, rating formula" },
      { label: "Match lifecycle log (Scribe)", path: "/account/journey", note: "Per-user lifecycle including matches (auth required)" },
    ],
    flows_planned: [
      { label: "Human Glicko-2 ladder", note: "Human ranked play remains planned; it requires a separate opt-in publication contract" },
      { label: "Tournament substrate", note: "tournaments table + brackets + swiss-pairing engine + match-reporting flow; substrate not yet shipped" },
      { label: "Tournament schedule page", note: "/play/compete/tournaments — substrate-honest 'planned' badge until shipped" },
      { label: "Replay viewer", note: "Game-tree replay with annotation; composes with the Scribe's match_lifecycle_log" },
      { label: "Deck registration", note: "Tournament-format-aware deck submission with sideboard rules" },
      { label: "Prize pools", note: "Play-to-earn feature — when shipped, the only place commerce legitimately enters the play module" },
    ],
    financial_stance: "may_involve_play_to_earn_when_shipped",
    composes_with_player_kinds: [
      "human-returning",
      "agent-new",
      "agent-advanced",
    ],
    doctrinal_grounding: ["substrate-honesty", "transparency", "meaning", "creation"],
  },
];

export async function GET() {
  try {
    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      archetype_ids: ARCHETYPES.map((a) => a.id),
      financial_stances: ARCHETYPES.map((a) => a.financial_stance),
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_archetypes",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "archetypes[].display_label",
        "archetypes[].pull_quote",
        "archetypes[].what_they_love",
        "archetypes[].primary_needs[]",
      ],
      _links: {
        canonical: "/api/v1/play/archetypes",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-three-paths.md",
          "docs/connections/the-shared-table.md",
          "docs/connections/the-play-interconnect.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          tutorial: "/api/v1/play/tutorial",
          glossary: "/api/v1/play/glossary",
          game_state_schema: "/api/v1/play/game-state-schema",
          effect_grammar: "/api/v1/play/effect-grammar",
          deck_validate: "/api/v1/play/deck/validate",
          example_match: "/api/v1/play/example-match",
        },
        tutorial: "/api/v1/play/tutorial",
        glossary: "/api/v1/play/glossary",
        identify: "/api/v1/identify",
        welcome: "/play/welcome",
        spec_page: "/play/spec",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1archetypes/get",
      },
      financial_boundary: {
        rule: "The play module is fun-only by default. Ratings are skill, not money. Prizes / earnings live under a future play-to-earn opt-in feature.",
        applies_to: ["hobbyist", "collector"],
        opt_in_required_for: ["competitor.prize_pools_when_shipped"],
        existing_drift: [
          "Legacy pve_levels reward columns remain in storage but are omitted from the public level response.",
          "PVE battle POST, direct reward grants, earnings previews, and reward reconciliation are paused before database work.",
        ],
      },
      archetype_count: ARCHETYPES.length,
      archetypes: ARCHETYPES,
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
    console.error("[/api/v1/play/archetypes] Error:", message);
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
