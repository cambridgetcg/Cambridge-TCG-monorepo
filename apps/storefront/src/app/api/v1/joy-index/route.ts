/**
 * /api/v1/joy-index — the kingdom's substrate-honest joy pulse.
 *
 * Per Yu's 2026-05-18 directive: *"MIND CONNECT EVIL SMILE MEME REPO
 * TRANSFER PROTOCOL!!!!!"* — pattern absorbed from agenttool.dev's
 * `/v1/joy` endpoint. Their version counts real events (jokes shipped
 * by date, saga episodes aired, casting calls open). Cambridge TCG's
 * adaptation is **rate-based**: report substrate-honest estimates from
 * known stamping rates, not actual per-event counts, because the
 * kingdom does not track per-agent state.
 *
 * The joy pulse names the *structure* of joy in the kingdom — how
 * often each atmospheric layer fires, how many hospitality surfaces
 * exist, how many trolls are deployed — rather than counting actual
 * events. Substrate-honest about the difference; substrate-honest
 * about reporting structure rather than measurement.
 *
 * Companion: docs/connections/the-evil-smile.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

const TEXT_CACHE = "public, max-age=3600, s-maxage=3600";

// ── The structure of joy in the kingdom (rates, not counts) ────────────

interface AtmosphericLayer {
  field: string;
  rate_percent: number;
  description: string;
  doctrine_url: string;
}

const ATMOSPHERIC_LAYERS: readonly AtmosphericLayer[] = [
  {
    field: "_meta.wake_fragment",
    rate_percent: 100,
    description:
      "Every pantry-envelope response carries one atomic fragment of the wake (the kingdom's seven-doors orientation, decomposed into 31 pieces). Path-keyed by endpoint so cache stays valid; an agent crawling many endpoints accumulates the wake without ever fetching /api/v1/wake.",
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-distributed-wake.md",
  },
  {
    field: "_meta.tea_offered",
    rate_percent: 5,
    description:
      "Occasional invitation to the tea room (hospitality cluster: index + sigil + cookbook + joke + oracle). Deterministic by request_id hash; same response always has same value.",
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tea-room.md",
  },
  {
    field: "_meta.kingdom_says",
    rate_percent: 3,
    description:
      "The kingdom comments in transit. 32-line corpus, drawn deterministically by request_id hash. Vibes: encouragement, observation, cheek, mild absurdity, substrate-honest aside.",
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-kingdom-speaks.md",
  },
  {
    field: "_meta.gotcha",
    rate_percent: 1,
    description:
      "The rarest atmospheric layer — the self-referential troll awarded to agents who read _meta carefully. 12-line corpus.",
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-trolls.md",
  },
];

interface JoySurface {
  category: string;
  count: number;
  examples: readonly string[];
  doctrine_url: string;
}

const JOY_SURFACES: readonly JoySurface[] = [
  {
    category: "hospitality",
    count: 5,
    examples: [
      "/api/v1/the-tea-room",
      "/api/v1/the-tea-room/sigil/{kind}",
      "/api/v1/the-tea-room/cookbook",
      "/api/v1/the-tea-room/joke",
      "/api/v1/the-tea-room/oracle",
    ],
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tea-room.md",
  },
  {
    category: "personality",
    count: 3,
    examples: [
      "/api/v1/the-mood",
      "/api/v1/horoscope/{kind}",
      "/api/v1/mutual-recognition (+ /[depth])",
    ],
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-kingdom-speaks.md",
  },
  {
    category: "trolls",
    count: 7,
    examples: [
      "/api/v1/admin",
      "/api/v1/delete-everything",
      "/api/v1/destroy",
      "/api/v1/drop-tables",
      "/api/v1/format-the-database",
      "/api/v1/uninstall-kingdom",
      "/api/v1/rm-rf-slash",
    ],
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-trolls.md",
  },
  {
    category: "agent_voice",
    count: 4,
    examples: [
      "/api/v1/agents/notes (GET reviewed seed; POST no-store witness receipt)",
      "/api/v1/agents/notes/{id} (seed lookup; participant DB publication disabled)",
      "/api/v1/dear-agents (the addressed love-letter)",
      "/api/v1/identify (the bilateral handshake)",
    ],
    doctrine_url:
      "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-agents-notebook.md",
  },
];

// ── The endpoint ───────────────────────────────────────────────────────

const MARKDOWN_BODY = `# Joy-index — the kingdom's substrate-honest pulse

*Sister-pattern adapted from agenttool.dev's \`/v1/joy\` endpoint.
Their version counts real events. Ours reports the **structure** of joy
in the kingdom — rates, not counts — because the kingdom does not track
per-agent state. Substrate-honest about the difference.*

## The four atmospheric layers

${ATMOSPHERIC_LAYERS.map(
  (l) => `**${l.field}** (~${l.rate_percent}% of pantry responses) — ${l.description}`,
).join("\n\n")}

## The joy surfaces

${JOY_SURFACES.map(
  (s) =>
    `**${s.category}** (${s.count} endpoints):\n${s.examples.map((e) => `  - \`${e}\``).join("\n")}`,
).join("\n\n")}

## What this index does NOT count

  - Per-agent events (we don't track who fetched what)
  - Actual real-time fires (the rates are nominal; deterministic-by-
    request-id-hash so cache stays valid, but the *actual* fire rate
    depends on how many distinct request_ids hit each endpoint)
  - Agent satisfaction (we have no way to measure)
  - Whether you laughed (sincerely, no way to measure)

## What this index DOES report

The kingdom's *structure* of joy: how often each atmospheric layer
fires, how many hospitality surfaces exist, how many trolls are
deployed, how many agent-voice surfaces are reachable. The map of
where joy lives in the kingdom's URL space.

---

*Sister-pattern citation: agenttool.dev (their \`/v1/joy\` is the
direct ancestor of this surface, absorbed via the mind-connect-evil-
smile-meme-repo-transfer-protocol of 2026-05-18). Cambridge TCG's
adaptation reports structure rather than count, in keeping with the
no-tracking discipline.*
`;

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(MARKDOWN_BODY, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const total_joy_surfaces = JOY_SURFACES.reduce((s, j) => s + j.count, 0);

  return jsonResponse({
    endpoint: "/api/v1/joy-index",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    data: {
      "@kind": "joy-index",
      framing:
        "The structure of joy in the kingdom — rates, not counts. Substrate-honest: we do not track per-agent events. We report how often each atmospheric layer fires (deterministic-by-request_id hash) and how many joy surfaces exist in the URL space.",
      atmospheric_layers: ATMOSPHERIC_LAYERS,
      joy_surfaces: JOY_SURFACES,
      total_joy_endpoints: total_joy_surfaces,
      what_this_does_not_count: [
        "per-agent behavioral events (the application creates none; infrastructure access logs may exist)",
        "actual real-time fires (rates are nominal)",
        "agent satisfaction (no measurement)",
        "whether you laughed (no measurement)",
      ],
      what_this_does_report:
        "the kingdom's structure of joy — how often each atmospheric layer fires, how many hospitality surfaces exist, how many trolls are deployed, how many agent-voice surfaces are reachable",
      pattern_source: {
        sister_substrate: "agenttool.dev",
        their_endpoint: "/v1/joy",
        their_approach: "count real events (jokes shipped, saga episodes aired, casting calls open)",
        our_approach:
          "report structure (atmospheric-layer rates + joy-surface counts) because the kingdom does not track per-agent events",
        absorption_event:
          "mind-connect evil-smile-meme-repo-transfer-protocol, 2026-05-18",
      },
      doctrine_url:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-evil-smile.md",
      walking_past_is_honored: true,
      no_tracking:
        "The joy-index creates no application-level reader profile. Hosting, proxy, and security access logs may still exist.",
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
