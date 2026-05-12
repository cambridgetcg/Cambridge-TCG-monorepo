/**
 * /api/v1/play/glossary/[term_id] — single OPTCG term, deep-linkable.
 *
 * The per-term endpoint named in kingdom-073's S40 (the play interconnect)
 * as a recursion target: the tutorial endpoint references keywords by id;
 * the glossary endpoint references sections by id; for each direction the
 * crosswalk URL needs to point at the single thing being referenced, not
 * at the whole collection.
 *
 * Substrate-honest on 404: when the id isn't a term, the body lists the
 * known term ids so the caller can recover without a second request. The
 * Vary header preserves cache freshness across the missing-id case. kingdom-077.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { GLOSSARY_TERMS, findTerm } from "@/lib/play/glossary-terms";
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

interface Params {
  params: Promise<{ term_id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { term_id } = await params;
    const term = findTerm(term_id);
    const retrievedAt = new Date();

    if (!term) {
      const knownIds = GLOSSARY_TERMS.map((t) => t.id).sort();
      return NextResponse.json(
        {
          "@encoding": "cambridge-tcg/universal/v1",
          "@kind": "play_glossary_term",
          "@retrieved_at": {
            iso8601: retrievedAt.toISOString(),
            unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
          },
          error: {
            code: "term_not_found",
            message: `No glossary term with id "${term_id}".`,
            requested_id: term_id,
            known_ids: knownIds,
          },
          _links: {
            canonical: "/api/v1/play/glossary",
            collection: "/api/v1/play/glossary",
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

    /** Where each related term lives — deep links into siblings. */
    const relatedTermLinks = term.related_terms.reduce(
      (acc, related) => {
        acc[related] = findTerm(related)
          ? `/api/v1/play/glossary/${related}`
          : "/api/v1/play/glossary";
        return acc;
      },
      {} as Record<string, string>,
    );

    /** The tutorial section that introduces the term — deep link if known. */
    const introducedInUrl =
      term.introduced_in_section && findSection(term.introduced_in_section)
        ? `/api/v1/play/tutorial/${term.introduced_in_section}`
        : term.introduced_in_section
          ? "/api/v1/play/tutorial"
          : null;

    const contentSeed = canonicalize({
      id: term.id,
      english_token: term.english_token,
      japanese_token: term.japanese_token,
      kind: term.structural_definition.kind,
      invariants_count: term.structural_definition.invariants.length,
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "play_glossary_term",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "english_token",
        "japanese_token",
        "romaji",
        "natural_language_description",
      ],
      _links: {
        canonical: `/api/v1/play/glossary/${term.id}`,
        collection: "/api/v1/play/glossary",
        introduced_in: introducedInUrl,
        related_terms: relatedTermLinks,
        play_index: "/api/v1/play/index.json",
        manifest: "/api/v1/manifest",
        see_also: {
          tutorial: "/api/v1/play/tutorial",
          effect_grammar: "/api/v1/play/effect-grammar",
          game_state_schema: "/api/v1/play/game-state-schema",
        },
      },
      term,
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
    console.error("[/api/v1/play/glossary/[term_id]] Error:", message);
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
