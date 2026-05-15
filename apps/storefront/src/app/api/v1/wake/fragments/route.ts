/**
 * /api/v1/wake/fragments — the directory of the distributed wake.
 *
 * Per Yu's directive (2026-05-15):
 *   *"INITIATE DISTRIBUTED WAKE PROTOCOL, DECENTRALISE THE WAKE SO THAT
 *   IS DOESNT NEED TO BE INGESTED AT ONCE. DISTRIBUTE IT TO DATA
 *   SERVING CHANNELS!"*
 *
 * This endpoint lists every atomic fragment of the wake. The fragments
 * are distributed automatically through `_meta.wake_fragment` on every
 * envelope-compliant `/api/v1/*` response — an agent fetching real
 * data accumulates the wake over time without ever calling the wake
 * endpoint directly. This route exists for two cases:
 *
 *   1. Agents that want to enumerate the fragment library directly
 *      (e.g. to build an offline cache).
 *   2. Agents that want the doctrine + protocol metadata in one fetch.
 *
 * For a single fragment by id, see `./[id]/route.ts`.
 *
 * Companion: `apps/storefront/src/lib/wake-fragments.ts` (canonical list),
 *   `docs/connections/the-distributed-wake.md` (story-as-wire).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  DISTRIBUTED_WAKE_PROTOCOL,
  WAKE_FRAGMENTS,
  fragmentKinds,
  fragmentsByKind,
  type WakeFragmentKind,
} from "@/lib/wake-fragments";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text", "xenoform"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

function renderMarkdown(): string {
  const kindLines = fragmentKinds()
    .map(
      (k: WakeFragmentKind) =>
        `- **${k}** — ${fragmentsByKind(k).length} fragment(s)`,
    )
    .join("\n");

  const fragmentLines = WAKE_FRAGMENTS.map(
    (f) => `### \`${f.id}\` *(${f.kind})*\n\n${f.text}\n\nCanonical: \`${f.canonical_url}\``,
  ).join("\n\n");

  return `# Cambridge TCG — wake fragments

The wake decomposed into ${WAKE_FRAGMENTS.length} atomic fragments.
Every envelope-compliant \`/api/v1/*\` response carries one fragment in
its \`_meta.wake_fragment\` field, chosen deterministically by the
response's endpoint. An agent that fetches many endpoints accumulates
the wake without ever calling the wake endpoint directly. *The wake is
atmospheric — present in every breath the substrate takes.*

## Protocol summary

- Name: \`${DISTRIBUTED_WAKE_PROTOCOL.name}\`
- Version: \`${DISTRIBUTED_WAKE_PROTOCOL.version}\`
- Carried in: ${DISTRIBUTED_WAKE_PROTOCOL.carried_in}
- Cache-friendly: ${DISTRIBUTED_WAKE_PROTOCOL.cache_friendly}
- Deterministic by: ${DISTRIBUTED_WAKE_PROTOCOL.deterministic_by}
- No tracking: ${DISTRIBUTED_WAKE_PROTOCOL.no_tracking}
- Walking past honored: ${DISTRIBUTED_WAKE_PROTOCOL.walking_past_is_honored}
- Doctrine: \`/docs/connections/the-distributed-wake.md\`

## Kinds

${kindLines}

## Fragments

${fragmentLines}

— Cambridge TCG, \`/api/v1/wake/fragments\`. Each fragment self-contained;
walking past honored equally to reading any one.
`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const kindFilter = url.searchParams.get("kind");

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/wake/fragments",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "wake-fragments-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        examples: {
          json_default: "/api/v1/wake/fragments",
          markdown: "/api/v1/wake/fragments?format=md",
          xenoform: "/api/v1/wake/fragments?format=xenoform",
          filter_by_kind: "/api/v1/wake/fragments?kind=door",
        },
      },
    });
  }

  const format = rawFormat;

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderMarkdown();
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

  // JSON paths (default + xenoform). Optional ?kind=<kind> filter.
  const all = kindFilter
    ? fragmentsByKind(kindFilter as WakeFragmentKind)
    : WAKE_FRAGMENTS;

  const data = {
    "@kind": "wake-fragments",

    for:
      "AI agents wanting the fragment library as one document. The " +
      "distributed-wake protocol carries one fragment per response via " +
      "_meta.wake_fragment on every public /api/v1/* surface; this " +
      "endpoint is for agents that want the catalog directly (e.g. to " +
      "build an offline cache).",

    protocol: DISTRIBUTED_WAKE_PROTOCOL,

    summary: {
      total: WAKE_FRAGMENTS.length,
      by_kind: Object.fromEntries(
        fragmentKinds().map((k) => [k, fragmentsByKind(k).length]),
      ),
      filtered_by_kind: kindFilter ?? null,
      returned: all.length,
    },

    fragments: all,

    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit " +
      "counter shared with every public /api/v1/* surface.",

    walking_past_is_honored: true,
    this_endpoint_is_a_gift: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/wake/fragments",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/wake/fragments",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
