import type { Metadata } from "next";
import type { ReactNode } from "react";
import PlayNav from "./PlayNav";

/** Default metadata for /play/* routes whose page is a client component
 *  (and therefore can't export `metadata` itself). Child server-rendered
 *  pages override the title/description with their own metadata exports —
 *  no template suffix, so titles like "Welcome to OPTCG on Cambridge TCG"
 *  don't end up double-branded as "Welcome to OPTCG on Cambridge TCG —
 *  Cambridge TCG".
 *
 *  The `alternates` and `other` blocks below are the play module's
 *  HTML-side discovery affordances — every /play/* page emits link tags
 *  pointing at the JSON center node + manifest + methodology, so machine
 *  readers parsing the HTML find the module's API surface without
 *  scraping body content. kingdom-077 (S40 follow-through). */
export const metadata: Metadata = {
  title: "Play — OPTCG on Cambridge TCG",
  description:
    "OPTCG match-hosting + tutorials + multi-cultural glossary + three player archetypes. Fun-first; prize pools live under future play-to-earn opt-in.",
  alternates: {
    types: {
      "application/json": "/api/v1/play/index.json",
    },
  },
  other: {
    "play:index_json": "/api/v1/play/index.json",
    "play:tutorial_json": "/api/v1/play/tutorial",
    "play:glossary_json": "/api/v1/play/glossary",
    "play:archetypes_json": "/api/v1/play/archetypes",
    "play:game_state_schema_json": "/api/v1/play/game-state-schema",
    "play:effect_grammar_json": "/api/v1/play/effect-grammar",
    "play:deck_validate_json": "/api/v1/play/deck/validate",
    "play:example_match_json": "/api/v1/play/example-match",
    "play:methodology": "/methodology/play-module",
    "play:manifest": "/api/v1/manifest",
    "play:fun_first": "true",
  },
};

/**
 * /play/* shared layout — a thin nav strip above each play-module surface.
 *
 * Yu's directive 2026-05-13 (after the contract-before-runtime kingdom):
 * *"follow through and give the play module structure."* This layout is
 * the structural follow-through — every /play/* page now shares a top
 * nav that surfaces the archetype landings, deck-check, adventure mode,
 * and the module's own spec page.
 *
 * The nav itself is `PlayNav` — a client subcomponent that reads
 * usePathname() to highlight the active route. Splitting the layout
 * (server) from the nav (client) keeps the page bodies server-rendered
 * while still giving the nav an active state.
 *
 * E2E test finding (test cycle, this turn): the original server-only nav
 * had no active-state signal; the split into PlayNav.tsx + layout.tsx
 * fixes that while preserving SSR for everything else.
 *
 * kingdom-070 (S38). See docs/connections/the-play-structure.md.
 */

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <PlayNav />
      {children}
    </div>
  );
}
