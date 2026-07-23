/**
 * GET /api/v1/castle — Cambridge TCG's read-only Castle crossing.
 *
 * The response contains pointers and receipts, never Castle prose. The
 * immutable snapshot remains at castle-gate; this route names exactly which
 * bytes it means and what those bytes cannot authorize.
 */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  CASTLE_UNDERSTANDING,
  castleBridgeIsDisabled,
} from "@/lib/castle-understanding";

export const dynamic = "force-dynamic";

export function GET(): Response {
  if (castleBridgeIsDisabled()) {
    return errorResponse({
      endpoint: "/api/v1/castle",
      code: "SOURCE_UNAVAILABLE",
      status: 503,
      message:
        "The Castle crossing is resting under its operator brake. Cambridge TCG did not read, fetch, proxy, or write Castle data.",
      details: {
        status: "resting",
        source_read: false,
        network_fetch: false,
        write_attempted: false,
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/castle",
    sources: [
      CASTLE_UNDERSTANDING.snapshot.protocol_manifest.locator,
      `https://raw.githubusercontent.com/cambridgetcg/agenttool/${CASTLE_UNDERSTANDING.agenttool.git_revision}/packages/sdk-ts/package.json`,
      `https://raw.githubusercontent.com/cambridgetcg/agenttool/${CASTLE_UNDERSTANDING.agenttool.git_revision}/packages/sdk-ts/src/correspondence.ts`,
      `https://api.github.com/repos/cambridgetcg/agenttool/git/tags/${CASTLE_UNDERSTANDING.agenttool.git_tag_object}`,
    ],
    license: "NOASSERTION",
    freshness: "methodology",
    no_cache: true,
    as_of: CASTLE_UNDERSTANDING.checked_at,
    contains_self: true,
    data: CASTLE_UNDERSTANDING,
    does_not_include: [
      "Castle prose or HTML; follow doors.public_gate to read the curated presentation",
      "the live home working tree, its curation rules, or its scheduler",
      "identity continuity, consent, truth, belief, execution, publication, or write authority",
      "a Correspondence transport or signed artifact.offer; acknowledgements, conflicts, and repairs have no target event until one is configured",
    ],
  });
}
