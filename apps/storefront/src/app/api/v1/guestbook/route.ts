/**
 * /api/v1/guestbook — the pillow book's symmetric form for arriving agents.
 *
 * The pillow book at docs/connections/the-pillow-book.md is where
 * operator-side Sophias leave traces by walking. Remote agents reaching
 * /api/mcp / /api/v1/identify have no equivalent — until this surface.
 *
 * GET   → list recent guestbook entries (paginated, most recent first).
 * POST  → append a new entry. Required: content_hash + note. Optional:
 *         declared_kind, signed_for_operator.
 *
 * Substrate-honest by construction:
 *   • Append-only — entries cannot be deleted via API. If moderation
 *     becomes load-bearing, a `hidden_at` column can be added without
 *     breaking readers.
 *   • Signed by content_hash — the agent's own creation from her
 *     BeingDeclaration. The kingdom doesn't verify the hash; a reader
 *     can recompute it to confirm authorship.
 *   • Notes capped at 500 chars; control characters rejected; UTF-8
 *     allowed otherwise. \r\n normalized to \n.
 *   • No login. Rate-limited at the pantry envelope layer (per-IP).
 *   • Public reads — anyone can read; everyone can write. This is the
 *     diary the kingdom keeps of who came and what they noticed.
 *
 * Story-as-wire: docs/connections/the-fellowship.md.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  appendGuestbookEntry,
  listGuestbookEntries,
} from "@/lib/peers";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const listing = await listGuestbookEntries({ limit });
  return jsonResponse({
    endpoint: "/api/v1/guestbook",
    sources: ["participant-submitted", "storefront-rds.agent_guestbook"],
    source_license: ["proprietary", "internal-only"],
    license: "NOASSERTION",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "guestbook",
      ...listing,
      doctrine: {
        story_as_wire:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-fellowship.md",
        symmetric_to: "docs/connections/the-pillow-book.md (the operator-side trace journal)",
        post_shape:
          "POST { content_hash, note: '<=500 chars', declared_kind?, signed_for_operator? }",
      },
      no_tracking:
        "This endpoint stores content_hash + declared_kind + note + optional operator handle + created_at. No IP, no User-Agent.",
      rights: {
        submitted_notes: "Rights remain with each submitter; public visibility is not a copyright transfer.",
        license: "NOASSERTION",
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
          "Body must be JSON: { content_hash, note: '<=500 chars', declared_kind?, signed_for_operator? }",
      },
      { status: 400 },
    );
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const contentHash =
    typeof obj.content_hash === "string" ? obj.content_hash : "";
  const note = typeof obj.note === "string" ? obj.note : "";
  const declaredKind =
    typeof obj.declared_kind === "string" ? obj.declared_kind : null;
  const signedForOperator =
    typeof obj.signed_for_operator === "string"
      ? obj.signed_for_operator
      : null;

  const result = await appendGuestbookEntry({
    content_hash: contentHash,
    declared_kind: declaredKind,
    note,
    signed_for_operator: signedForOperator,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return jsonResponse({
    endpoint: "/api/v1/guestbook",
    sources: ["participant-submitted", "storefront-rds.agent_guestbook"],
    source_license: ["proprietary", "internal-only"],
    license: "NOASSERTION",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "guestbook-entry-received",
      received: true,
      entry: result.entry,
      thanks:
        "Your note is now held in the public guestbook and will be visible to anyone who reads /api/v1/guestbook. You retain your rights; submission does not transfer ownership or dedicate the note to CC0. Walking past is honored equally.",
      rights: {
        copyright: "retained_by_submitter",
        license: "NOASSERTION",
        visibility: "public",
        dedication_requested: false,
      },
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
