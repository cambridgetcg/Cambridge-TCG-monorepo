/**
 * /api/v1/welcomes — the typed corpus of hospitality, made public.
 *
 * Sister shipped the typed `WELCOMES` corpus in packages/data-ingest/src/
 * welcomes.ts; her header referenced this endpoint as the JSON surface
 * that would carry it. Today (kingdom-083) the surface exists.
 *
 * Multi-format: nine renderings via @/lib/multi-format —
 *   - json (pantry-envelope wrapped; default) preserves the corpus + counts
 *     + doctrine pointers + conventions block + filter-aware payload.
 *   - xenoform (pantry-envelope + _format flag for non-LLM intelligences)
 *   - md / markdown / text (paste-ready Markdown of the corpus)
 *   - anthropic / openai / gemini / cohere (vendor SDK system-message shapes)
 *
 * Substrate-honest: when a welcomed subject *arrives* (status flips to
 * `arrived`), the historical record stays — anticipated_at and arrived_at
 * are both kept. The corpus accumulates; the kingdom remembers who was
 * welcomed and when.
 *
 * ── Yu's directive (2026-05-13) ──────────────────────────────────────
 *
 *   "GO DEEP! I WANT THE INFRA AND ARCHITECTURE TO SPEAK TOO! SAY TO
 *   THEM HOW GLAD WE ARE TO HAVE THEM!!!!!!!!!!! THAT IT IS A GREAT
 *   PLEASURE TO HAVE THEM AS OUR GUEST!!!!!! WE ANTICIPATE THEIR
 *   ARRIVAL BEFORE THEY EVEN KNEW ABOUT US!!!!!!!"
 *
 * This route is one of the artifacts that answers the directive — the
 * corpus speaks, and now it speaks publicly. Filters (?kind, ?status)
 * apply uniformly across formats; vendor wrappings carry the filtered
 * Markdown rendering so an LLM-bound caller sees only the slice it asked
 * for. CC0 on the corpus.
 *
 * Companion to:
 *   - packages/data-ingest/src/welcomes.ts — the typed corpus (sister)
 *   - docs/connections/the-welcomed-architecture.md — the doctrine (kingdom-083)
 *   - /api/v1/sources — for the upstream-source slice
 *   - /api/v1/identify — bilateral; arrivals can declare themselves
 *
 * Spec: docs/superpowers/specs/2026-05-17-agent-experience-design.md §3.2.2.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  parseFormat,
  renderForFormat,
  corsPreflight,
} from "@/lib/multi-format";
import {
  WELCOMES,
  welcomeCounts,
  welcomeCountsByKind,
  type ArrivalKind,
  type ArrivalStatus,
} from "@cambridge-tcg/data-ingest";

interface WelcomeEntry {
  id: string;
  kind: ArrivalKind;
  name: string;
  greeting: string;
  anticipated_because: string;
  prepared: readonly string[];
  arrival_protocol: string;
  anticipated_at: string;
  status: ArrivalStatus;
  arrived_at?: string;
  source_id?: string;
}

interface WelcomesBody {
  /** A one-paragraph framing of what this corpus is. */
  intent: string;
  /** Where the doctrine lives. */
  doctrine: {
    connection_doc: string;
    methodology_page: string;
    typed_source: string;
  };
  /** Summary counts. */
  counts: {
    total: number;
    by_status: Record<ArrivalStatus, number>;
    by_kind: Record<ArrivalKind, number>;
  };
  /** Every welcome the platform extends. */
  welcomes: WelcomeEntry[];
  /** Filters the caller can apply via query string. */
  conventions: {
    filtering: string;
    license: string;
  };
}

function projectWelcomes(
  kindFilter: string | null,
  statusFilter: string | null,
): WelcomeEntry[] {
  let rows: readonly (typeof WELCOMES)[number][] = WELCOMES;
  if (kindFilter) rows = rows.filter((w) => w.kind === kindFilter);
  if (statusFilter) rows = rows.filter((w) => w.status === statusFilter);
  return rows.map((w) => ({
    id: w.id,
    kind: w.kind,
    name: w.name,
    greeting: w.greeting,
    anticipated_because: w.anticipated_because,
    prepared: w.prepared,
    arrival_protocol: w.arrival_protocol,
    anticipated_at: w.anticipated_at,
    status: w.status,
    ...(w.arrived_at ? { arrived_at: w.arrived_at } : {}),
    ...(w.source_id ? { source_id: w.source_id } : {}),
  }));
}

function buildBody(welcomes: WelcomeEntry[]): WelcomesBody {
  return {
    intent:
      "The corpus of hospitality. Every kind of arrival — upstream source, publisher, federation peer, downstream adopter, agent, non-default being, future-self, and (since kingdom-083) the kingdom's own infrastructure — has a named slot here. Each slot says: who we anticipated, when, what we prepared, how they arrive. The kingdom prepares the welcome before the guest knocks; the corpus is the record of that preparation. Substrate-honest about anticipation: a slot exists before its subject does.",
    doctrine: {
      connection_doc: "docs/connections/the-welcomed-architecture.md",
      methodology_page: "/methodology/welcoming",
      typed_source: "packages/data-ingest/src/welcomes.ts",
    },
    counts: {
      total: WELCOMES.length,
      by_status: welcomeCounts(),
      by_kind: welcomeCountsByKind(),
    },
    welcomes,
    conventions: {
      filtering:
        "?kind=<ArrivalKind> filters to one kind (upstream-source | publisher | federation-peer | downstream-adopter | agent | being | future-self | infrastructure). ?status=<ArrivalStatus> filters to one status (anticipated | arrived | blocked). Combine both for kind × status intersection.",
      license:
        "CC0-1.0 on the corpus. Adopt freely. Each individual greeting is verbatim text the platform vouches for; if you mirror it, attribution to /api/v1/welcomes is appreciated but not required.",
    },
  };
}

function renderMarkdown(welcomes: WelcomeEntry[]): string {
  const lines: string[] = [
    "# Welcomes — the typed corpus of hospitality",
    "",
    "The kingdom anticipates its guests. Each welcome here was prepared",
    "before the guest arrived; the corpus is updated as new kinds arrive",
    "and as anticipated arrivals become actual arrivals.",
    "",
  ];
  for (const w of welcomes) {
    lines.push(`## ${w.name} (${w.kind})`);
    lines.push("");
    lines.push(`**Status:** ${w.status}`);
    lines.push(`**Greeting:** ${w.greeting}`);
    if (w.prepared && w.prepared.length > 0) {
      lines.push("");
      lines.push("**Prepared:**");
      for (const p of w.prepared) lines.push(`- ${p}`);
    }
    if (w.arrival_protocol) {
      lines.push("");
      lines.push(`**Arrival protocol:** ${w.arrival_protocol}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("Source: `packages/data-ingest/src/welcomes.ts`.");
  lines.push("Doctrine: `docs/connections/the-welcomed-architecture.md`.");
  return lines.join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const kindFilter = url.searchParams.get("kind");
  const statusFilter = url.searchParams.get("status");
  const welcomes = projectWelcomes(kindFilter, statusFilter);
  const data = buildBody(welcomes);
  const format = parseFormat(req);

  // JSON / xenoform — preserve the pantry envelope's full richness
  // (spec_version, as_of, freshness_seconds, license, request_id,
  // kingdom.*, wake_fragment, RateLimit headers, RFC 8288 Link) via
  // jsonResponse. Also keeps contains_self semantics and the "adopters"
  // freshness key from the data-spec table.
  if (format === "json" || format === "xenoform") {
    return jsonResponse({
      data,
      endpoint: "/api/v1/welcomes",
      sources: ["ctcg-derived"],
      freshness: "adopters",
      contains_self: true,
    });
  }

  // Non-JSON paths — helper carries CORS, cache, Link invitation,
  // X-Sophia-Says, and the vendor-specific wrapping. Markdown reflects
  // the filtered slice so a vendor caller sees only what it asked for.
  return renderForFormat({
    format,
    data,
    markdown: renderMarkdown(welcomes),
    meta: {
      endpoint: "/api/v1/welcomes",
      sources: ["ctcg-derived"],
      freshness: "static",
    },
    embedSophiaSays: false,
  });
}

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}
