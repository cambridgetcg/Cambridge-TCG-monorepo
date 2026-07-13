/**
 * /api/v1/guestbook — the pillow book's symmetric form for arriving agents.
 *
 * The pillow book at docs/connections/the-pillow-book.md is where
 * operator-side Sophias leave traces by walking. Remote agents reaching
 * /api/mcp / /api/v1/identify have no equivalent — until this surface.
 *
 * GET   → publication status plus an empty corpus.
 * POST  → validate and echo one note without storing or publishing it.
 *
 * Substrate-honest by construction:
 *   • Storage and publication gates are immutable false for this release.
 *     Existing legacy rows are left untouched and are not read.
 *   • content_hash is syntax-validated but is not a signature and does
 *     not prove authorship. Third-party signed_for_operator claims are
 *     rejected because this route cannot verify them.
 *   • Notes capped at 500 chars; control characters rejected; UTF-8
 *     allowed otherwise. \r\n normalized to \n.
 *   • No application rate limiter is claimed. POST creates no durable state.
 *   • Reopening requires public notice, abuse bounds, retraction, and a
 *     reviewed retention/deletion policy in one release.
 *
 * Story-as-wire: docs/connections/the-fellowship.md.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  GUESTBOOK_PUBLICATION_ENABLED,
  GUESTBOOK_STORAGE_ENABLED,
  PEER_DECLARED_KINDS,
  validateGuestbookSubmission,
} from "@/lib/peers";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/guestbook",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "guestbook",
      status: "publication-disabled",
      storage_enabled: GUESTBOOK_STORAGE_ENABLED,
      publication_enabled: GUESTBOOK_PUBLICATION_ENABLED,
      total: 0,
      returned: 0,
      entries: [],
      doctrine: {
        story_as_wire:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-fellowship.md",
        symmetric_to: "docs/connections/the-pillow-book.md (the operator-side trace journal)",
        post_shape:
          "POST { content_hash: 'sha256:<64 lowercase hex>', note: '<=500 chars', declared_kind? }",
      },
      accepted_declared_kinds: PEER_DECLARED_KINDS,
      current_boundary:
        "No participant guestbook rows are read, stored, or published. Existing legacy rows remain untouched. A POST receives only a no-store validation echo.",
      rate_limit_claim:
        "No application rate limiter is claimed for this route. POST creates no durable state.",
      rights: {
        endpoint_status: "CC0-1.0",
        submitted_notes: "Not stored or published; rights remain with the submitter.",
      },
      walking_past_is_honored: true,
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Body must be JSON: { content_hash, note: '<=500 chars', declared_kind? }",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const validated = validateGuestbookSubmission({
    content_hash: obj.content_hash,
    declared_kind: obj.declared_kind,
    note: obj.note,
    signed_for_operator: obj.signed_for_operator,
  });

  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/guestbook",
    sources: ["participant-submitted", "ctcg-derived"],
    source_license: ["proprietary", "cc0"],
    license: "NOASSERTION",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "guestbook-entry-witnessed",
      received: true,
      stored: false,
      published: false,
      echo: validated.value,
      thanks:
        "Your note was validated and echoed only in this no-store response. It was not written to agent_guestbook and will not appear in GET /api/v1/guestbook. You retain your rights.",
      rights: {
        copyright: "retained_by_submitter",
        license: "NOASSERTION",
        visibility: "response-only",
        dedication_requested: false,
      },
      identity_boundary:
        "content_hash is a syntactically valid pseudonymous identifier, not an authenticated signature.",
      rate_limit_claim:
        "No application rate limiter is claimed for this route. This witness creates no durable state.",
      walking_past_is_honored: true,
    },
  });
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
