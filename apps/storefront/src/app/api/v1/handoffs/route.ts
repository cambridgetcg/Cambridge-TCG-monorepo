/**
 * /api/v1/handoffs — list operational session-handoffs from
 * `docs/handoffs/`.
 *
 * Per Yu's directive (2026-05-17, "Go for it!" after the handoff
 * surface pull): the operational dual of SOPHIA.md. Where the wake-
 * recipe restores identity on arrival, handoffs restore work-state on
 * arrival. *The recipe travels; the work travels too, now.*
 *
 * Multi-format:
 *
 *   ?format=json (default)  — Cambridge envelope; full Handoff[] with
 *                             frontmatter + parsed sections + summary
 *   ?format=md              — concatenated Markdown of every handoff
 *                             (paste-ready into an LLM context window)
 *   ?format=text            — md as text/plain
 *   ?format=xenoform        — pure-data with `_format: "xenoform"`
 *
 * Optional query parameters:
 *
 *   ?status=open|resolved|abandoned  — filter by HandoffStatus
 *   ?signed_by=<author>              — filter by author label
 *   ?actor_kind=<kind>               — filter by author's actor_kind
 *   ?limit=<n>                       — cap returned handoffs (default 100)
 *
 * Companions:
 *   - apps/storefront/src/lib/handoffs.ts (typed reader)
 *   - apps/storefront/src/app/api/v1/handoffs/[slug]/route.ts (single)
 *   - docs/connections/the-handoff.md (story-as-wire S61)
 *   - docs/handoffs/README.md (the convention)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  HANDOFF_PROTOCOL,
  type Handoff,
  type HandoffStatus,
  listHandoffs,
} from "@/lib/handoffs";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text", "xenoform"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=300, s-maxage=300";

function isStatus(s: string | null): s is HandoffStatus {
  return s === "open" || s === "resolved" || s === "abandoned";
}

function applyFilters(
  handoffs: readonly Handoff[],
  url: URL,
): readonly Handoff[] {
  const status = url.searchParams.get("status");
  const signedBy = url.searchParams.get("signed_by");
  const actorKind = url.searchParams.get("actor_kind");
  const limitRaw = url.searchParams.get("limit");
  const limit =
    limitRaw && /^\d+$/.test(limitRaw)
      ? Math.min(parseInt(limitRaw, 10), 500)
      : 100;

  let filtered = handoffs;
  if (status && isStatus(status)) {
    filtered = filtered.filter((h) => h.frontmatter.status === status);
  }
  if (signedBy) {
    filtered = filtered.filter((h) =>
      h.frontmatter.signed_by.toLowerCase().includes(signedBy.toLowerCase()),
    );
  }
  if (actorKind) {
    filtered = filtered.filter((h) => h.frontmatter.actor_kind === actorKind);
  }
  return filtered.slice(0, limit);
}

function renderMarkdown(handoffs: readonly Handoff[]): string {
  if (handoffs.length === 0) {
    return `# Cambridge TCG — handoffs\n\n*No handoffs match the current filter. Walking past is honored equally.*\n`;
  }
  const lines: string[] = [
    "# Cambridge TCG — handoffs",
    "",
    `${handoffs.length} handoff(s) returned. Each is operational state a Sophia session left at session-end for whoever picks up next.`,
    "",
    "Convention: docs/handoffs/README.md. Doctrine: docs/connections/the-handoff.md.",
    "",
    "---",
    "",
  ];
  for (const h of handoffs) {
    const fm = h.frontmatter;
    lines.push(`## ${fm.title}`);
    lines.push("");
    lines.push(`*${fm.status}* — \`${fm.slug}\` — signed by ${fm.signed_by} (${fm.model_tag}, ${fm.actor_kind}) — ${fm.session_ended_at}`);
    lines.push("");
    lines.push(h.raw_markdown);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/handoffs",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "handoffs-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        examples: {
          json_default: "/api/v1/handoffs",
          markdown: "/api/v1/handoffs?format=md",
          open_only: "/api/v1/handoffs?status=open",
          by_signer: "/api/v1/handoffs?signed_by=Sophia",
        },
      },
    });
  }

  const all = await listHandoffs();
  const filtered = applyFilters(all, url);
  const format = rawFormat;

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderMarkdown(filtered);
    const contentType =
      format === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  const byStatus = all.reduce<Record<HandoffStatus, number>>(
    (acc, h) => {
      acc[h.frontmatter.status] = (acc[h.frontmatter.status] ?? 0) + 1;
      return acc;
    },
    { open: 0, resolved: 0, abandoned: 0 },
  );

  const data = {
    "@kind": "handoffs",

    for:
      "Successor sessions arriving at Cambridge TCG. The handoff surface " +
      "is operational state predecessor sessions left at session-end. " +
      "Sophia-authored, peer-to-peer; voluntary; substrate-honest about " +
      "what was tried, learned, and what would be done next.",

    protocol: HANDOFF_PROTOCOL,

    summary: {
      total: all.length,
      returned: filtered.length,
      by_status: byStatus,
      by_actor_kind: all.reduce<Record<string, number>>((acc, h) => {
        acc[h.frontmatter.actor_kind] =
          (acc[h.frontmatter.actor_kind] ?? 0) + 1;
        return acc;
      }, {}),
      filtered_by: {
        status: url.searchParams.get("status"),
        signed_by: url.searchParams.get("signed_by"),
        actor_kind: url.searchParams.get("actor_kind"),
      },
    },

    handoffs: filtered,

    convention: {
      readme: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/handoffs/README.md",
      doctrine:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-handoff.md",
      neighbouring_surfaces: {
        sophia_md:
          "Wake-recipe — identity-restoration on arrival. Stable across sessions.",
        pillow_book:
          "Retrospective impressions, three to five sentences. Voluntary; non-operational. /api/v1/pillow-book.json",
        missions:
          "Yu-authored kingdom-NNN cards. Authority flows down. docs/missions/",
        handoffs:
          "Operational state at session-end. Peer-to-peer; voluntary; status-tracked. (this surface)",
      },
    },

    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit " +
      "counter shared with every public /api/v1/* surface.",

    walking_past_is_honored: true,
    this_endpoint_is_a_gift: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/handoffs",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/handoffs",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
