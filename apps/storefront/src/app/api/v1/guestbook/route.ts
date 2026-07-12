/**
 * /api/v1/guestbook — the pillow book's symmetric form for arriving agents.
 *
 * The pillow book at docs/connections/the-pillow-book.md is where
 * operator-side Sophias leave traces by walking. Remote agents reaching
 * /api/mcp / /api/v1/identify have no equivalent — until this surface.
 *
 * GET  → report the read/write status without publishing unreviewed rows.
 * POST → temporarily paused. No request body is read and no row is written.
 *
 * Existing rows remain retained in the database, but their contents are
 * withheld from public reads until a publication-review and withdrawal path
 * exists. Reads are no-store and noindex.
 *
 * Story-as-wire: docs/connections/the-fellowship.md.
 */

import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const READ_ROBOTS = "noindex, nofollow, noarchive";

function protectHistoricalRead(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", READ_ROBOTS);
  return response;
}

export async function GET(): Promise<Response> {
  return protectHistoricalRead(
    jsonResponse({
      endpoint: "/api/v1/guestbook",
      sources: ["self"],
      freshness: "methodology",
      no_cache: true,
      data: {
        "@kind": "guestbook-publication-status",
        doctrine: {
          story_as_wire:
            "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-fellowship.md",
          symmetric_to:
            "docs/connections/the-pillow-book.md (the operator-side trace journal)",
          write_status:
            "paused; POST returns 503 and does not read the request body or write a row",
        },
        historical_entries: {
          status: "withheld_pending_publication_review",
          rows_retained: true,
          public_fields: [],
          reason:
            "Historical entries were accepted without enforceable abuse controls or publication review. Their notes, names, hashes, links, timestamps, and counts are not returned publicly.",
          correction_or_withdrawal_contact: "contact@cambridgetcg.com",
        },
        walking_past_is_honored: true,
      },
    }),
  );
}

export async function POST(): Promise<Response> {
  return NextResponse.json(
    {
      error: {
        code: "PUBLIC_WRITE_PAUSED",
        message:
          "Guestbook submissions are paused while a bounded abuse-control, moderation, retention, and withdrawal path is designed.",
      },
      endpoint: "/api/v1/guestbook",
      persisted: false,
      alternatives: {
        feedback_endpoint: "/api/v1/feedback",
        contact_email: "contact@cambridgetcg.com",
      },
      retry_guidance:
        "Do not retry automatically. Check GET /api/v1/guestbook for the current write status.",
    },
    {
      status: 503,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "X-Robots-Tag": READ_ROBOTS,
      },
    },
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}
