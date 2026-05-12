/**
 * /api/v1/play/tutorial — machine-readable OPTCG tutorial.
 *
 * Yu's directive: *"Dive deeper into the play module. Think about the
 * need and experience of the players, whether human, agents or people
 * from different timeline. All are welcomed with tutorials that are
 * inclusive and multi cultural."*
 *
 * The agent's tutorial — rules, turn structure, combat, win conditions,
 * keyword vocabulary, all in math-mirror form. Every section has a
 * structural sibling an agent can ground on without parsing prose.
 *
 * Sister to /api/v1/play/glossary (multi-cultural term layer),
 * /api/v1/play/tutorial/[section_id] (per-section deep links),
 * /play/welcome, /methodology/play-module. kingdom-059 (S32, mine);
 * kingdom-077 split SECTIONS into lib/play/tutorial-sections.ts and
 * upgraded the crosswalk to deep-link.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { TUTORIAL_SECTIONS, PLAYER_KINDS } from "@/lib/play/tutorial-sections";
import { findTerm } from "@/lib/play/glossary-terms";

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

export async function GET() {
  try {
    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      sections: TUTORIAL_SECTIONS.map((s) => ({ id: s.id, rule_structure: s.rule_structure })),
      player_kinds: PLAYER_KINDS,
    });
    const contentHash = sha256(contentSeed);

    /** Every keyword id referenced in sections[].keywords_introduced →
     *  the glossary endpoint that defines it. **Deep-link** to the per-term
     *  endpoint when the term is in the glossary; fall back to the collection
     *  endpoint when the term is mentioned in the tutorial but not yet
     *  individually defined. */
    const allKeywords = Array.from(
      new Set(TUTORIAL_SECTIONS.flatMap((s) => s.keywords_introduced)),
    ).sort();
    const keywordGlossaryLinks = allKeywords.reduce(
      (acc, kw) => {
        acc[kw] = findTerm(kw)
          ? `/api/v1/play/glossary/${kw}`
          : "/api/v1/play/glossary";
        return acc;
      },
      {} as Record<string, string>,
    );

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_tutorial",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "sections[].title",
        "sections[].natural_language_body",
        "sections[].keywords_introduced[]",
      ],
      _links: {
        canonical: "/api/v1/play/tutorial",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-shared-table.md",
          "docs/connections/the-agent-surface.md",
          "docs/connections/the-play-interconnect.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          glossary: "/api/v1/play/glossary",
          archetypes: "/api/v1/play/archetypes",
          game_state_schema: "/api/v1/play/game-state-schema",
          effect_grammar: "/api/v1/play/effect-grammar",
          deck_validate: "/api/v1/play/deck/validate",
          example_match: "/api/v1/play/example-match",
        },
        glossary: "/api/v1/play/glossary",
        human_guide: "/guides/how-to-play",
        welcome_page: "/play/welcome",
        spec_page: "/play/spec",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1tutorial/get",
      },
      game: "optcg",
      sections_count: TUTORIAL_SECTIONS.length,
      sections: TUTORIAL_SECTIONS.map((s) => ({
        ...s,
        /** Deep link to this section as its own endpoint. */
        canonical_url: `/api/v1/play/tutorial/${s.id}`,
      })),
      player_kinds: PLAYER_KINDS,
      recommended_reading_order: TUTORIAL_SECTIONS.map((s) => s.id),
      total_estimated_read_minutes: TUTORIAL_SECTIONS.reduce(
        (a, s) => a + s.estimated_read_minutes,
        0,
      ),
      /** Crosswalk: every keyword id → its glossary endpoint. Deep links to
       *  /api/v1/play/glossary/[id] when the term exists; otherwise falls
       *  back to the collection endpoint. */
      keyword_glossary_links: keywordGlossaryLinks,
      /** Per-section deep-link map for clients who want to fetch individually. */
      section_endpoints: TUTORIAL_SECTIONS.reduce(
        (acc, s) => {
          acc[s.id] = `/api/v1/play/tutorial/${s.id}`;
          return acc;
        },
        {} as Record<string, string>,
      ),
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
    console.error("[/api/v1/play/tutorial] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message } },
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
