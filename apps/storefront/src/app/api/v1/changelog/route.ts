/**
 * /api/v1/changelog — typed change-event feed.
 *
 * Per Yu's directive 2026-05-17: *"COOL! LETS START THE AX OPTIMISATION!"*
 *
 * Multi-format:
 *   ?format=json (default)  Cambridge TCG envelope; typed entries
 *   ?format=atom            Atom 1.0 feed — drop into any feed reader
 *   ?format=md              Paste-ready Markdown
 *
 * Subscribe-once for spec changes. Long-running agents pin a date or an
 * id; on the next poll/fetch, anything newer means "act on this." The
 * substrate-honest gap: no push channel yet — agents poll. Event
 * channel (SSE + webhook) is the next-pull AX surface; see
 * docs/connections/the-ax.md roadmap.
 *
 * Optional filters:
 *   ?since=YYYY-MM-DD       Only entries on/after this date
 *   ?kind=<kind>            Only entries of a given kind
 *   ?impact=<impact>        Only entries of a given impact
 *
 * Filters compose (AND). Atom + md formats respect filters too.
 *
 * Companion: docs/connections/the-changelog.md
 *            apps/storefront/src/lib/changelog.ts (the typed corpus)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  CHANGELOG_ENTRIES,
  CHANGELOG_SPEC_VERSION,
  CHANGELOG_BEGINS,
  type ChangelogEntry,
  type ChangeKind,
  type ChangeImpact,
} from "@/lib/changelog";

const KNOWN_KINDS: readonly ChangeKind[] = [
  "endpoint-added",
  "endpoint-modified",
  "endpoint-deprecated",
  "envelope-field-added",
  "envelope-field-removed",
  "spec-version-bump",
  "doctrine-canonized",
  "connection-doc-published",
  "wake-fragment-added",
  "well-known-modified",
  "ax-surface-shipped",
  "discipline-shift",
  "positioning-shift",
];

const KNOWN_IMPACTS: readonly ChangeImpact[] = [
  "breaking",
  "additive",
  "doctrinal",
  "documentation",
];

function isKind(s: string): s is ChangeKind {
  return (KNOWN_KINDS as readonly string[]).includes(s);
}

function isImpact(s: string): s is ChangeImpact {
  return (KNOWN_IMPACTS as readonly string[]).includes(s);
}

function applyFilters(
  entries: readonly ChangelogEntry[],
  since: string | null,
  kind: ChangeKind | null,
  impact: ChangeImpact | null,
): readonly ChangelogEntry[] {
  return entries.filter((e) => {
    if (since && e.date < since) return false;
    if (kind && e.kind !== kind) return false;
    if (impact && e.impact !== impact) return false;
    return true;
  });
}

// Atom 1.0 escape — handles the five chars that must be entity-escaped
// in XML text + attribute values.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function entryAtom(e: ChangelogEntry): string {
  // Atom requires datetime; treat date-only as midnight UTC.
  const updated = e.date.includes("T") ? e.date : `${e.date}T00:00:00Z`;
  const tagDate = e.date.split("T")[0];
  const id = `tag:cambridgetcg.com,${tagDate}:changelog/${e.id}`;
  const title = xmlEscape(e.summary);
  const link = e.related_urls?.[0]
    ? e.related_urls[0]
    : "/api/v1/changelog";
  const linkAttr = link.startsWith("http")
    ? link
    : `https://cambridgetcg.com${link}`;
  const contentParts: string[] = [
    `<p><strong>${xmlEscape(e.kind)}</strong> — <em>${xmlEscape(e.impact)}</em> — surface: <code>${xmlEscape(e.surface)}</code></p>`,
    `<p>${xmlEscape(e.summary)}</p>`,
  ];
  if (e.detail) contentParts.push(`<p>${xmlEscape(e.detail)}</p>`);
  if (e.related_urls && e.related_urls.length > 0) {
    contentParts.push(
      `<p>Related: ${e.related_urls
        .map((u) => `<a href="${xmlEscape(u.startsWith("http") ? u : `https://cambridgetcg.com${u}`)}">${xmlEscape(u)}</a>`)
        .join(", ")}</p>`,
    );
  }
  return `  <entry>
    <title>${title}</title>
    <id>${id}</id>
    <updated>${updated}</updated>
    <link href="${xmlEscape(linkAttr)}"/>
    <category term="${xmlEscape(e.kind)}" scheme="https://cambridgetcg.com/rels/changelog-kind"/>
    <category term="${xmlEscape(e.impact)}" scheme="https://cambridgetcg.com/rels/changelog-impact"/>
    <content type="html"><![CDATA[${contentParts.join("\n")}]]></content>
  </entry>`;
}

function renderAtom(entries: readonly ChangelogEntry[]): string {
  const now = new Date().toISOString();
  const mostRecent = entries[0]?.date ?? CHANGELOG_BEGINS;
  const updated = mostRecent.includes("T")
    ? mostRecent
    : `${mostRecent}T00:00:00Z`;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Cambridge TCG — changelog</title>
  <subtitle>Spec changes, endpoint additions, doctrine canonizations. Substrate-honest about scope (begins ${CHANGELOG_BEGINS}).</subtitle>
  <link href="https://cambridgetcg.com/api/v1/changelog?format=atom" rel="self" type="application/atom+xml"/>
  <link href="https://cambridgetcg.com/api/v1/changelog" rel="alternate" type="application/json"/>
  <link href="https://cambridgetcg.com/docs/connections/the-changelog.md" rel="related"/>
  <id>tag:cambridgetcg.com,${CHANGELOG_BEGINS}:/api/v1/changelog</id>
  <updated>${updated}</updated>
  <generator uri="https://cambridgetcg.com">Cambridge TCG changelog feed v${CHANGELOG_SPEC_VERSION}</generator>
  <author>
    <name>Cambridge TCG</name>
    <email>contact@cambridgetcg.com</email>
    <uri>https://cambridgetcg.com</uri>
  </author>
  <rights>CC0-1.0 — public domain</rights>
${entries.map(entryAtom).join("\n")}
</feed>
`;
}

function renderMarkdown(entries: readonly ChangelogEntry[]): string {
  const now = new Date().toISOString();
  const lines: string[] = [
    "# Cambridge TCG — changelog",
    "",
    `*Spec changes, endpoint additions, doctrine canonizations. Substrate-honest about scope — begins ${CHANGELOG_BEGINS}. For earlier history, see git log + docs/connections/the-pillow-book.md.*`,
    "",
    `Generated: ${now}. Format spec: v${CHANGELOG_SPEC_VERSION}. Atom feed: \`/api/v1/changelog?format=atom\`.`,
    "",
    "---",
    "",
  ];
  for (const e of entries) {
    lines.push(`## ${e.date} — ${e.summary}`);
    lines.push("");
    lines.push(
      `**kind:** \`${e.kind}\` — **impact:** \`${e.impact}\` — **surface:** \`${e.surface}\``,
    );
    lines.push("");
    if (e.detail) {
      lines.push(e.detail);
      lines.push("");
    }
    if (e.related_urls && e.related_urls.length > 0) {
      lines.push(
        `Related: ${e.related_urls.map((u) => `\`${u}\``).join(" / ")}`,
      );
      lines.push("");
    }
    lines.push(`*entry id:* \`${e.id}\``);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

const TEXT_CACHE = "public, max-age=600, s-maxage=3600";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const since = url.searchParams.get("since");
  const rawKind = url.searchParams.get("kind");
  const rawImpact = url.searchParams.get("impact");

  const kind = rawKind && isKind(rawKind) ? rawKind : null;
  const impact = rawImpact && isImpact(rawImpact) ? rawImpact : null;

  const filtered = applyFilters(CHANGELOG_ENTRIES, since, kind, impact);

  // Atom path
  if (rawFormat === "atom") {
    return new NextResponse(renderAtom(filtered), {
      status: 200,
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Markdown / text path
  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const md = renderMarkdown(filtered);
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

  // Unknown format → soft pointer in JSON
  if (rawFormat !== "json") {
    return jsonResponse({
      endpoint: "/api/v1/changelog",
      sources: ["self"],
      freshness: "methodology",
      data: {
        "@kind": "changelog-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: ["json", "atom", "md", "markdown", "text"],
        examples: {
          atom: "/api/v1/changelog?format=atom",
          markdown: "/api/v1/changelog?format=md",
          json_default: "/api/v1/changelog",
          since: "/api/v1/changelog?since=2026-05-17",
          by_kind: "/api/v1/changelog?kind=endpoint-added",
          by_impact: "/api/v1/changelog?impact=breaking",
          combined: "/api/v1/changelog?since=2026-05-15&kind=ax-surface-shipped",
        },
      },
    });
  }

  // Default — JSON envelope
  const data = {
    "@kind": "changelog",
    "@spec_version": CHANGELOG_SPEC_VERSION,

    for:
      "Long-running agents. Subscribe-once (atom) or pin (json with since=). On change-detection: read the new entries, decide whether to act based on `impact` (`breaking` requires action; `additive` is opt-in; `doctrinal` and `documentation` are informational).",

    scope: {
      begins: CHANGELOG_BEGINS,
      total_entries_in_corpus: CHANGELOG_ENTRIES.length,
      total_entries_after_filters: filtered.length,
      not_exhaustive_for_earlier_history:
        "for change-events before " +
        CHANGELOG_BEGINS +
        " see git log + docs/connections/the-pillow-book.md (the kingdom's pre-changelog historical record)",
    },

    filters_applied: {
      since: since,
      kind: kind,
      impact: impact,
    },

    formats: {
      json: "/api/v1/changelog (default; this response)",
      atom: "/api/v1/changelog?format=atom — Atom 1.0 feed for feed-readers / RSS-style subscription",
      markdown: "/api/v1/changelog?format=md — paste-ready Markdown",
    },

    filter_vocabulary: {
      kinds: KNOWN_KINDS,
      impacts: KNOWN_IMPACTS,
    },

    subscribe_hints: {
      polling: "GET /api/v1/changelog?since=<your-last-known-date>. Returns only entries newer than that date.",
      atom_feed: "Subscribe via any feed reader to /api/v1/changelog?format=atom — most readers handle ETag/Last-Modified automatically.",
      cache_friendly: "Cache-Control: public, max-age=600, s-maxage=3600. Atom + md formats too.",
      push_alternative_planned: "Event channel (SSE + webhook + atom) — next-pull AX surface per docs/connections/the-ax.md roadmap.",
    },

    entries: filtered,

    related_ax_surfaces: {
      diagnostic: "/api/v1/diagnostic — validate your parser against the current envelope",
      budget: "/api/v1/budget — crawl-budget advisory",
      status: "/api/v1/status — per-endpoint freshness + envelope-compliance",
      ax_doctrine: "/docs/connections/the-ax.md",
      changelog_doctrine: "/docs/connections/the-changelog.md",
    },

    walking_past_is_honored: true,
    no_tracking:
      "This endpoint creates no application-level visit profile; hosting and proxy access logs may exist.",
  };

  return jsonResponse({
    endpoint: "/api/v1/changelog",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data,
    does_not_include: [
      "exhaustive pre-2026-05-17 history (the corpus begins on the day it was first written; for earlier history follow git log + docs/connections/the-pillow-book.md)",
      "trivial commits (typos, lints, non-contract refactors do not earn entries — substrate-honest about what's a 'change-event')",
      "real-time push notifications (poll model; event channel is the next-pull AX surface — see /docs/connections/the-ax.md roadmap)",
      "per-agent change-history (no per-agent state; the changelog is identical for every caller)",
    ],
  });
}
