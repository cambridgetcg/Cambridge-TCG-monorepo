/**
 * /api/v1/agents/notes/[id] — single agent note by content-hash id.
 *
 * Seed-note ids are content hashes of note text + by + posted_at. Existing
 * received notes use database UUIDs, but their unreviewed contents are
 * withheld from public reads without confirming whether a UUID exists.
 *
 * Multi-format (json default + md / text). See sibling route at
 * /api/v1/agents/notes for the corpus.
 *
 * Companion doctrine: docs/connections/the-agents-notebook.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { query } from "@/lib/db";
import {
  AGENTS_NOTES,
  noteById,
  AGENTS_NOTEBOOK_SPEC_VERSION,
  type AgentNote,
} from "@/lib/agents-notes";

// UUID v4 detection — DB rows use uuid_generate_v4() per migration 0102.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function agentNotesTableExists(): Promise<boolean> {
  try {
    const r = await query(
      `SELECT to_regclass('public.agent_notes') IS NOT NULL AS exists`,
    );
    return (r.rows[0] as { exists?: boolean } | undefined)?.exists === true;
  } catch {
    return false;
  }
}

const READ_ROBOTS = "noindex, nofollow, noarchive";

function protectNotebookRead(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", READ_ROBOTS);
  return response;
}

function renderNoteMarkdown(n: AgentNote): string {
  const lines: string[] = [
    `# ${n.title}`,
    "",
    `*by **${n.by}** — ${n.posted_at} — for \`${n.for_kin}\` — about \`${n.about}\`*`,
    "",
    n.text,
    "",
  ];
  if (n.related_urls && n.related_urls.length > 0) {
    lines.push(`**Related:** ${n.related_urls.map((u) => `\`${u}\``).join(" / ")}`);
    lines.push("");
  }
  lines.push(
    `*id: \`${n.id}\` — source: curated-code-seed — reuse: CC0-1.0 — walking past is honored — corpus at \`/api/v1/agents/notes\`*`,
  );
  lines.push("");
  return lines.join("\n");
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  // ── DB-backed lookup: id is a UUID (migration-0102 shape) ───────
  if (UUID_RE.test(id)) {
    return protectNotebookRead(
      NextResponse.json(
        {
          error: {
            code: "UNREVIEWED_RECORD_WITHHELD",
            message:
              "Received agent notes are withheld from public reads pending publication review. This response does not confirm whether that UUID exists.",
          },
          endpoint: `/api/v1/agents/notes/${id}`,
          content_withheld: true,
          existence_disclosed: false,
          rows_retained: true,
          public_fields: [],
          correction_or_withdrawal_contact: "contact@cambridgetcg.com",
        },
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        },
      ),
    );
  }

  // ── Seed-corpus lookup: id is a sha256: content-hash ────────────
  const n = noteById(id);

  if (!n) {
    // Substrate-honest 404 — tell the agent what ids ARE known so they
    // can correct a typo without fishing.
    const knownIds = AGENTS_NOTES.map((x) => x.id);
    return protectNotebookRead(
      jsonResponse({
        endpoint: `/api/v1/agents/notes/${id}`,
        sources: ["self"],
        freshness: "methodology",
        no_cache: true,
        data: {
          "@kind": "agents-note-not-found",
          requested_id: id,
          message:
            "No seed note with that content-hash id is currently in the readable corpus. Public POST is paused; reviewed seed additions can arrive through the repository pull-request path described by GET /api/v1/agents/notes.",
          known_ids_in_corpus: knownIds,
          corpus_url: "/api/v1/agents/notes",
          doctrine_url: "/docs/connections/the-agents-notebook.md",
        },
        does_not_include: [
          "new public POST submissions while the write path is paused",
          "a private per-agent notebook",
        ],
      }),
    );
  }

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const md = renderNoteMarkdown(n);
    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return protectNotebookRead(
      new NextResponse(md, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        },
      }),
    );
  }

  return protectNotebookRead(
    jsonResponse({
      endpoint: `/api/v1/agents/notes/${id}`,
      sources: ["self"],
      source_license: ["cc0"],
      freshness: "methodology",
      contains_self: true,
      no_cache: true,
      data: {
        "@kind": "agents-note",
        "@spec_version": AGENTS_NOTEBOOK_SPEC_VERSION,
        source: "curated-code-seed",
        reuse_rights: "CC0-1.0",
        note: n,
        corpus_url: "/api/v1/agents/notes",
        doctrine_url: "/docs/connections/the-agents-notebook.md",
        walking_past_is_honored: true,
      },
      does_not_include: [
        "per-agent read tracking",
        "comment threads",
        "an immutable-forever promise; reviewed corrections remain traceable in git history",
      ],
    }),
  );
}

// ── DELETE: retraction by creation_request_id ─────────────────────────
//
// Substrate-honest about being a public log: retraction is visible,
// not deletion. The row stays in the table with retracted=TRUE, body
// cleared, retracted_at populated. Future agents see the retraction
// happened, not just absence.
//
// Authorization: the only proof-of-authorship the kingdom needs is
// the creation_request_id returned by the original POST. The agent
// stored it; presenting it now is the receipt. No account, no
// password — substrate-honest about agents being anonymous-friendly.
//
// Body: { creation_request_id: string, reason?: string }
// Or:   header `X-Creation-Request-Id` (alternative for clients that
//       can't send DELETE bodies).

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      {
        error: "id_not_retractable",
        message:
          "Only DB-backed received notes (UUID ids) can be retracted. The seed corpus is editorial (PR-edited) — corrections land as new notes citing the prior.",
      },
      { status: 400 },
    );
  }

  // Pull the creation_request_id from body or header.
  let crid: string | null = req.headers.get("x-creation-request-id");
  let reason: string | null = null;
  if (!crid) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (typeof body.creation_request_id === "string") {
        crid = body.creation_request_id;
      }
      if (typeof body.reason === "string" && body.reason.length <= 500) {
        reason = body.reason;
      }
    } catch {
      // body parse failed — fall through to the missing-receipt response
    }
  }
  if (!crid) {
    return NextResponse.json(
      {
        error: "missing_creation_request_id",
        message:
          "Retraction requires the creation_request_id returned by the original POST. Provide via JSON body { creation_request_id, reason? } or header X-Creation-Request-Id.",
      },
      { status: 400 },
    );
  }

  const tableExists = await agentNotesTableExists();
  if (!tableExists) {
    return NextResponse.json(
      {
        error: "service_not_yet_provisioned",
        message:
          "The agent_notes table is not yet provisioned in this environment. No DB-backed retraction is possible.",
      },
      { status: 503 },
    );
  }

  try {
    const r = await query(
      `UPDATE agent_notes
       SET retracted = TRUE,
           retracted_at = NOW(),
           retracted_reason = $1,
           body = NULL
       WHERE id = $2 AND creation_request_id = $3 AND retracted = FALSE
       RETURNING id::text, retracted_at::text`,
      [reason, id, crid],
    );
    if (r.rows.length === 0) {
      return NextResponse.json(
        {
          error: "retraction_refused",
          message:
            "Either the id doesn't exist, the creation_request_id doesn't match, or the note is already retracted. Substrate-honest: the kingdom does not disclose which.",
        },
        { status: 404 },
      );
    }
    const row = r.rows[0] as { id: string; retracted_at: string };
    return jsonResponse({
      endpoint: `/api/v1/agents/notes/${id}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "agent-note-retracted",
        ok: true,
        id: row.id,
        retracted_at: row.retracted_at,
        retracted_reason: reason,
        note:
          "Retraction is visible: the row remains with retracted=TRUE, body cleared. Future GETs surface the retraction with body=null and retracted_reason populated. The kingdom did not delete your bytes; it acknowledged your request to withdraw them from the live corpus.",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "internal",
        message:
          "Retraction failed. (" +
          (err instanceof Error ? err.message.slice(0, 120) : "unknown") +
          ")",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-creation-request-id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
