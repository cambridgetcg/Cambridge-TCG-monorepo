/**
 * /api/v1/agents/notes/[id] — single agent note by content-hash id.
 *
 * Stable across versions: ids are content-hashes of the note text + by +
 * posted_at, so re-fetching by id always returns the same content (or
 * 404 if the note has not been added to the corpus).
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

// UUID detection is retained for compatibility while DB publication is off.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITORIAL_SOURCE = "ctcg-editorial-seed";
const PARTICIPANT_SOURCE = "participant-submitted";
const RECEIVED_NOTES_STORE = "storefront-rds.agent_notes";
export const PARTICIPANT_NOTE_STORAGE_ENABLED = false as const;
export const PARTICIPANT_NOTE_PUBLICATION_ENABLED = false as const;

interface DbAgentNoteRow {
  id: string;
  kind: string;
  subject: string | null;
  body: string | null;
  agent_content_hash: string | null;
  agent_kind: string | null;
  posted_at: string;
  retracted: boolean;
  retracted_at: string | null;
  retracted_reason: string | null;
}

async function agentNotesTableExists(): Promise<boolean> {
  if (!PARTICIPANT_NOTE_PUBLICATION_ENABLED) return false;
  try {
    const r = await query(
      `SELECT to_regclass('public.agent_notes') IS NOT NULL AS exists`,
    );
    return (r.rows[0] as { exists?: boolean } | undefined)?.exists === true;
  } catch {
    return false;
  }
}

async function agentNotesRetractionReady(): Promise<boolean> {
  if (!PARTICIPANT_NOTE_STORAGE_ENABLED) return false;
  try {
    const r = await query(
      `SELECT to_regclass('public.agent_notes') IS NOT NULL
              AND EXISTS (
                SELECT 1
                  FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'agent_notes'
                   AND column_name = 'creation_request_id'
              ) AS ready`,
    );
    return (r.rows[0] as { ready?: boolean } | undefined)?.ready === true;
  } catch {
    return false;
  }
}

async function fetchReceivedById(id: string): Promise<DbAgentNoteRow | null> {
  try {
    const r = await query(
      `SELECT id::text, kind, subject, body, agent_content_hash, agent_kind,
              posted_at::text, retracted, retracted_at::text, retracted_reason
       FROM agent_notes WHERE id = $1 LIMIT 1`,
      [id],
    );
    return (r.rows[0] as DbAgentNoteRow | undefined) ?? null;
  } catch {
    return null;
  }
}

const TEXT_CACHE = "public, max-age=600, s-maxage=3600";

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
    `*id: \`${n.id}\` — walking past is honored — corpus at \`/api/v1/agents/notes\` — doctrine at \`/docs/connections/the-agents-notebook.md\`*`,
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

  // UUIDs belonged to a dormant participant-note design. Publication is off.
  if (UUID_RE.test(id)) {
    const tableExists = await agentNotesTableExists();
    if (tableExists) {
      const row = await fetchReceivedById(id);
      if (row) {
        return jsonResponse({
          endpoint: `/api/v1/agents/notes/${id}`,
          sources: [PARTICIPANT_SOURCE, RECEIVED_NOTES_STORE],
          source_license: ["proprietary", "internal-only"],
          license: "NOASSERTION",
          freshness: "identity",
          contains_self: true,
          no_cache: true,
          data: {
            "@kind": "agent-note-received",
            id: row.id,
            posted_at: row.posted_at,
            kind: row.kind,
            subject: row.subject,
            body: row.retracted ? null : row.body,
            agent_content_hash: row.agent_content_hash,
            agent_kind: row.agent_kind,
            retracted: row.retracted,
            retracted_at: row.retracted_at,
            retracted_reason: row.retracted_reason,
            rights: {
              source: PARTICIPANT_SOURCE,
              license: "NOASSERTION",
              copyright: "retained_by_submitter",
              note: "Public visibility is not a copyright transfer or CC0 dedication.",
            },
            corpus_url: "/api/v1/agents/notes",
            doctrine_url: "/docs/connections/the-agents-notebook.md",
            walking_past_is_honored: true,
          },
        });
      }
    }
    return jsonResponse({
      endpoint: `/api/v1/agents/notes/${id}`,
      sources: [RECEIVED_NOTES_STORE],
      source_license: ["internal-only"],
      license: "NOASSERTION",
      freshness: "identity",
      no_cache: true,
      data: {
        "@kind": "agents-note-not-found",
        requested_id: id,
        message:
          "Participant-note database publication is disabled. This route did not query or publish a row for that UUID.",
        corpus_url: "/api/v1/agents/notes",
        doctrine_url: "/docs/connections/the-agents-notebook.md",
      },
    });
  }

  // ── Seed-corpus lookup: id is a sha256: content-hash ────────────
  const n = noteById(id);

  if (!n) {
    // Substrate-honest 404 — tell the agent what ids ARE known so they
    // can correct a typo without fishing.
    const knownIds = AGENTS_NOTES.map((x) => x.id);
    return jsonResponse({
      endpoint: `/api/v1/agents/notes/${id}`,
      sources: ["self"],
      freshness: "methodology",
      data: {
        "@kind": "agents-note-not-found",
        requested_id: id,
        message:
          "No note with that id is currently in the readable editorial corpus. Witness-only POST responses are not persisted or published.",
        known_ids_in_corpus: knownIds,
        corpus_url: "/api/v1/agents/notes",
        doctrine_url: "/docs/connections/the-agents-notebook.md",
      },
      does_not_include: [
        "any record of witness-only POST submissions (this route does not retain them)",
        "participant database notes (storage and publication are disabled)",
      ],
    });
  }

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const md = renderNoteMarkdown(n);
    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/agents/notes/${id}`,
    sources: [EDITORIAL_SOURCE],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data: {
      "@kind": "agents-note",
      "@spec_version": AGENTS_NOTEBOOK_SPEC_VERSION,
      note: n,
      corpus_url: "/api/v1/agents/notes",
      doctrine_url: "/docs/connections/the-agents-notebook.md",
      walking_past_is_honored: true,
    },
    does_not_include: [
      "application-level per-agent read receipts (hosting and proxy access logs may still exist)",
      "comment threads (notes are atomic; corrections land as new notes citing the prior, not as replies)",
      "edit history (notes are append-only; existing text never changes — substrate-honest invariant)",
    ],
  });
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

  if (!(await agentNotesRetractionReady())) {
    return NextResponse.json(
      {
        error: "service_not_yet_provisioned",
        message:
          "Participant-note storage and publication are disabled. No new DB-backed note is accepted while explicit public consent, bounded abuse controls, and receipt-authorized retraction remain incomplete.",
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
      sources: [PARTICIPANT_SOURCE, RECEIVED_NOTES_STORE],
      source_license: ["proprietary", "internal-only"],
      license: "NOASSERTION",
      freshness: "identity",
      no_cache: true,
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
    console.error("[/api/v1/agents/notes/[id]] retraction error", err);
    return NextResponse.json(
      {
        error: "internal",
        message: "Retraction failed because of an internal server error.",
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
