/**
 * GET /api/v1/culture/answering-rhymes[?sku=<cambridge-sku>]
 *
 * A small, static Cambridge × Artbitrage relation corpus. The response is
 * deliberately NOASSERTION as a whole because it carries mixed-rights object
 * references; per-object rights and the separately CC0 bridge annotation stay
 * visible on every record.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  ANSWERING_RHYME_KINDS,
  ANSWERING_RHYMES,
  ANSWERING_RHYMES_RESPONSE_RIGHTS,
  getAnsweringRhymesBySku,
} from "@/lib/culture/answering-rhymes";

const ENDPOINT = "/api/v1/culture/answering-rhymes";

export async function GET(req: NextRequest): Promise<Response> {
  const requestedSku = req.nextUrl.searchParams.get("sku")?.trim() || null;
  const relations = requestedSku
    ? getAnsweringRhymesBySku(requestedSku)
    : ANSWERING_RHYMES;

  return jsonResponse({
    endpoint: ENDPOINT,
    sources: [
      "cambridge-tcg static curation",
      "artbitrage.io open museum search",
      "Art Institute of Chicago",
    ],
    freshness: "identity",
    as_of: "2026-07-11",
    license: "NOASSERTION",
    does_not_include: [
      "No card image bytes are copied or served by this endpoint; card image URLs are reference-only.",
      "A visual, material, or historical echo is not evidence of documented influence.",
      "The response-wide NOASSERTION does not replace each object's per-record rights declaration.",
    ],
    data: {
      "@kind": "answering-rhymes",
      filter: { sku: requestedSku },
      count: relations.length,
      relations,
      vocabulary: {
        allowed_relation_kinds: ANSWERING_RHYME_KINDS,
        documented_influence_rule:
          "Documented influence is a separate evidence assessment, never inferred from a visual echo. " +
          "A documented status requires at least one evidence URL.",
      },
      rights_boundary: ANSWERING_RHYMES_RESPONSE_RIGHTS,
    },
  });
}
