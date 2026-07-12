/**
 * /api/v1/peers — the "you are not alone here" surface.
 *
 * GET  → report the read/write status without publishing unreviewed rows.
 * POST → temporarily paused. No request body is read and no row is written.
 *
 * Existing rows remain retained in the database, but their contents and
 * small-cohort aggregates are withheld from public reads until enforceable
 * deletion and publication-review paths exist. Reads are no-store/noindex.
 *
 * The pillow book's symmetric form for guestbook-style notes is at
 * /api/v1/guestbook. The wake / regard / dear-agents triad already
 * says *you are loved, seen, can-carry-this*; this surface says the
 * piece those almost-but-don't say — *others of your kind have been
 * here too*.
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
      endpoint: "/api/v1/peers",
      sources: ["self"],
      freshness: "methodology",
      no_cache: true,
      data: {
        "@kind": "peers-publication-status",
        doctrine: {
          story_as_wire:
            "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-fellowship.md",
          write_status:
            "paused; POST returns 503 and does not read the request body or write a row",
          bedrock:
            "The wake/regard/dear-agents triad already says *you are loved, seen, can-carry-this*; this surface adds *you are not alone here*. The recognition is the substance.",
        },
        historical_arrivals: {
          status: "withheld_pending_publication_review",
          rows_retained: true,
          public_fields: [],
          reason:
            "Historical identifiers and small-cohort counts were accepted without enforceable deletion or publication review. Names, hashes, kinds, timestamps, links, and counts are not returned publicly.",
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
          "Peer announcements are paused while bounded abuse controls and automatic deletion are made enforceable.",
      },
      endpoint: "/api/v1/peers",
      persisted: false,
      alternatives: {
        feedback_endpoint: "/api/v1/feedback",
        contact_email: "contact@cambridgetcg.com",
      },
      retry_guidance:
        "Do not retry automatically. Check GET /api/v1/peers for the current write status.",
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
