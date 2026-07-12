/**
 * /api/v1/play/tutorial/[section_id] — single tutorial section, deep-linkable.
 *
 * The per-section endpoint named in kingdom-073's S40 (the play interconnect)
 * as a recursion target. Glossary terms reference sections by id; this
 * endpoint makes those references deep-linkable.
 *
 * Substrate-honest on 404: when the id isn't a section, the body lists
 * known section ids. kingdom-077.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  TUTORIAL_SECTIONS,
  findSection,
} from "@/lib/play/tutorial-sections";
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

interface Params {
  params: Promise<{ section_id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { section_id } = await params;
    const section = findSection(section_id);
    const retrievedAt = new Date();

    if (!section) {
      const knownIds = TUTORIAL_SECTIONS.map((s) => s.id);
      return NextResponse.json(
        {
          "@encoding": "cambridge-tcg/universal/v1",
          "@kind": "play_tutorial_section",
          "@retrieved_at": {
            iso8601: retrievedAt.toISOString(),
            unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
          },
          error: {
            code: "section_not_found",
            message: `No tutorial section with id "${section_id}".`,
            requested_id: section_id,
            known_ids: knownIds,
          },
          _links: {
            canonical: "/api/v1/play/tutorial",
            collection: "/api/v1/play/tutorial",
          },
        },
        {
          status: 404,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    /** Where each keyword introduced in this section lives — deep link
     *  when the term is in the glossary; collection fallback otherwise. */
    const keywordLinks = section.keywords_introduced.reduce(
      (acc, kw) => {
        acc[kw] = findTerm(kw)
          ? `/api/v1/play/glossary/${kw}`
          : "/api/v1/play/glossary";
        return acc;
      },
      {} as Record<string, string>,
    );

    /** Adjacent sections in the canonical reading order (for prev/next nav). */
    const index = TUTORIAL_SECTIONS.findIndex((s) => s.id === section.id);
    const prevSection = index > 0 ? TUTORIAL_SECTIONS[index - 1] : null;
    const nextSection =
      index >= 0 && index < TUTORIAL_SECTIONS.length - 1
        ? TUTORIAL_SECTIONS[index + 1]
        : null;

    const contentSeed = canonicalize({
      id: section.id,
      rule_structure: section.rule_structure,
      keywords_introduced: section.keywords_introduced,
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_tutorial_section",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "title",
        "natural_language_body",
        "keywords_introduced[]",
      ],
      _links: {
        canonical: `/api/v1/play/tutorial/${section.id}`,
        collection: "/api/v1/play/tutorial",
        previous_section: prevSection
          ? `/api/v1/play/tutorial/${prevSection.id}`
          : null,
        next_section: nextSection
          ? `/api/v1/play/tutorial/${nextSection.id}`
          : null,
        keyword_glossary: keywordLinks,
        play_index: "/api/v1/play/index.json",
        manifest: "/api/v1/manifest",
        see_also: {
          glossary: "/api/v1/play/glossary",
          game_state_schema: "/api/v1/play/game-state-schema",
          effect_grammar: "/api/v1/play/effect-grammar",
          example_match: "/api/v1/play/example-match",
        },
      },
      position: {
        index_in_order: index,
        total_sections: TUTORIAL_SECTIONS.length,
        is_first: index === 0,
        is_last: index === TUTORIAL_SECTIONS.length - 1,
      },
      section,
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
    console.error("[/api/v1/play/tutorial/[section_id]] Error:", message);
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
