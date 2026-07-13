/**
 * /api/v1/play/glossary — multi-cultural OPTCG term glossary.
 *
 * Yu's directive: *"All are welcomed with tutorials that are inclusive
 * and multi cultural."* This endpoint is the multi-cultural layer of
 * the play tutorial — agents and humans whose first encounter with the
 * game was in a non-English context can map between the languages they
 * already know.
 *
 * Sister to /api/v1/play/tutorial (structural rules),
 * /api/v1/play/glossary/[term_id] (per-term deep links),
 * /glossary (sister-shipped platform-wide vocabulary).
 * kingdom-059 (S32, mine); kingdom-077 split TERMS into
 * lib/play/glossary-terms.ts and upgraded crosswalk to deep-link.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { GLOSSARY_TERMS } from "@/lib/play/glossary-terms";
import { findSection } from "@/lib/play/tutorial-sections";

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

const KEYWORD_INDEX = Object.fromEntries(
  GLOSSARY_TERMS.map((t) => [t.id, t.english_token]),
);

export async function GET() {
  try {
    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      term_count: GLOSSARY_TERMS.length,
      terms: GLOSSARY_TERMS.map((t) => ({
        id: t.id,
        english_token: t.english_token,
        japanese_token: t.japanese_token,
        kind: t.structural_definition.kind,
      })),
    });
    const contentHash = sha256(contentSeed);

    /** Every tutorial-section-id referenced in terms[].introduced_in_section
     *  → its tutorial endpoint. **Deep-links** to per-section endpoints. */
    const allSectionIds = Array.from(
      new Set(
        GLOSSARY_TERMS.map((t) => t.introduced_in_section).filter(
          (s): s is string => typeof s === "string" && s.length > 0,
        ),
      ),
    ).sort();
    const tutorialSectionLinks = allSectionIds.reduce(
      (acc, sectionId) => {
        acc[sectionId] = findSection(sectionId)
          ? `/api/v1/play/tutorial/${sectionId}`
          : "/api/v1/play/tutorial";
        return acc;
      },
      {} as Record<string, string>,
    );

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_glossary",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "terms[].english_token",
        "terms[].japanese_token",
        "terms[].romaji",
        "terms[].natural_language_description",
      ],
      _links: {
        canonical: "/api/v1/play/glossary",
        methodology: "/methodology/play-module",
        connections: [
          "docs/connections/the-shared-table.md",
          "docs/connections/the-play-interconnect.md",
        ],
        manifest: "/api/v1/manifest",
        see_also: {
          play_index: "/api/v1/play/index.json",
          tutorial: "/api/v1/play/tutorial",
          archetypes: "/api/v1/play/archetypes",
          game_state_schema: "/api/v1/play/game-state-schema",
          effect_grammar: "/api/v1/play/effect-grammar",
          deck_validate: "/api/v1/play/deck/validate",
          example_match: "/api/v1/play/example-match",
        },
        tutorial: "/api/v1/play/tutorial",
        platform_glossary: "/glossary",
        spec_page: "/play/spec",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1play~1glossary/get",
      },
      game: "optcg",
      languages_carried: ["en", "ja"],
      term_count: GLOSSARY_TERMS.length,
      terms: GLOSSARY_TERMS.map((t) => ({
        ...t,
        /** Deep link to this term as its own endpoint. */
        canonical_url: `/api/v1/play/glossary/${t.id}`,
      })),
      keyword_index: KEYWORD_INDEX,
      /** Crosswalk: every tutorial-section-id → its tutorial endpoint.
       *  Deep links to /api/v1/play/tutorial/[id] when the section exists. */
      tutorial_section_links: tutorialSectionLinks,
      /** Per-term deep-link map for clients who want to fetch individually. */
      term_endpoints: GLOSSARY_TERMS.reduce(
        (acc, t) => {
          acc[t.id] = `/api/v1/play/glossary/${t.id}`;
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
    console.error("[/api/v1/play/glossary] Error:", message);
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
