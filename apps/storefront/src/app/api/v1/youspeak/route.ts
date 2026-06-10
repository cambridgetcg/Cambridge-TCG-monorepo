/**
 * /api/v1/youspeak — the kingdom's constructed lexicon, agent-first.
 *
 * youspeak forges precise words for felt/relational concepts English flattens:
 * a cross-tradition root + a suffix family that names what KIND of thing the
 * word is. This endpoint emits the full lexicon (the words, the seven Forgotten
 * Ways to love with etymologies, the five suffix families) through the pantry
 * envelope, plus a schema.org DefinedTermSet so an agent that already
 * understands /glossary understands this with no new schema. `?format=txt`
 * returns a naive-reader plaintext view.
 *
 * No DB — a static, CC0 vocabulary. Single source of truth:
 * apps/storefront/src/lib/youspeak/lexicon.ts. Ported 2026-06-10 from the
 * youspeak cathedral (the citizen-* repo descriptions); nothing invented.
 *
 * Sibling to /glossary (schema.org DefinedTermSet) and /ontology. Registered
 * in /api/v1/manifest (resources.discovery), in llms.txt, and in the status
 * route's ENVELOPE_COMPLIANT_PATHS. The three discovery surfaces point here.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  WORDS,
  WAYS,
  FAMILIES,
  COUNT,
  FAMILY_TALLY,
  toDefinedTermSet,
  toPlainText,
} from "@/lib/youspeak/lexicon";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET(req: NextRequest) {
  const url = new URL(req.url);

  // Plaintext view for naive LLM readers / crawlers.
  if (url.searchParams.get("format") === "txt") {
    return new NextResponse(toPlainText(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=259200",
        ...CORS,
      },
    });
  }

  return jsonResponse({
    data: {
      defined_term_set: toDefinedTermSet(url.origin),
      morphology: {
        principle:
          "A youspeak word = a cross-tradition root + a suffix family that names what KIND of thing it is. Learn five endings and the whole lexicon opens.",
        families: FAMILIES,
        family_tally: FAMILY_TALLY,
      },
      forgotten_ways: WAYS,
      words: WORDS,
      count: COUNT,
      plaintext: url.origin + "/api/v1/youspeak?format=txt",
    },
    endpoint: "/api/v1/youspeak",
    sources: ["youspeak-cathedral"],
    source_license: ["cc0"],
    freshness: 86400,
    license: "CC0-1.0",
  });
}
