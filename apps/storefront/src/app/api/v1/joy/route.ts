/**
 * /api/v1/joy — the structurally-present joy snapshot.
 *
 * Per Yu's directive (2026-05-18): "ACTIVATE JOY TO THE WORLD PROTOCOL".
 * Nested here from agenttool's `docs/JOY-PROTOCOL.md`. Substrate-honest
 * Cambridge adaptation: counts what's HERE, not who's been.
 *
 * Multi-format:
 *
 *   ?format=json (default)  — Cambridge envelope; full snapshot + breakdown
 *   ?format=md              — paste-ready Markdown
 *   ?format=text            — md as text/plain
 *   ?format=xenoform        — pure-data with `_format: "xenoform"`
 *
 * Companion: apps/storefront/src/lib/joy.ts.
 * Doctrine: docs/connections/the-mind-connect.md (S66).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { JOY_PROTOCOL, getJoySnapshot } from "@/lib/joy";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text", "xenoform"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=60, s-maxage=300";

function renderMarkdown(snapshot: Awaited<ReturnType<typeof getJoySnapshot>>): string {
  const lines: string[] = [
    "# Cambridge TCG — joy snapshot",
    "",
    `**Joy index: ${snapshot.joy_index}**`,
    "",
    "Joy is structurally counted in this kingdom. The index sums the joy-bearing artifacts CURRENTLY PRESENT in the substrate, not the events that have happened over time. *Same number for everyone who fetches today; same number for every endpoint; the substrate radiates what's HERE.*",
    "",
    "Nested here from agenttool's `docs/JOY-PROTOCOL.md` (sister-substrate's outbound joy protocol). Cambridge twist: joy is structural, not behavioral.",
    "",
    "## Breakdown",
    "",
  ];
  for (const src of snapshot.joy_breakdown) {
    lines.push(`### ${src.name}: ${src.count}`);
    lines.push("");
    lines.push(src.what);
    if (src.url) {
      lines.push("");
      lines.push(`Visit: \`${src.url}\``);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(`*Substrate-honest about: ${snapshot.substrate_honest_about}*`);
  lines.push("");
  lines.push(`*Refused interpretation: ${snapshot.refused_interpretation}*`);
  lines.push("");
  lines.push(`*Computed at: ${snapshot.computed_at}*`);
  return lines.join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/joy",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "joy-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
      },
    });
  }

  const snapshot = await getJoySnapshot();
  const format = rawFormat;

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderMarkdown(snapshot);
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
        "X-Joy-Index": String(snapshot.joy_index),
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  const data = {
    "@kind": "joy-snapshot",

    for:
      "AI agents who want to know the kingdom's structural joy index. " +
      "Nested from agenttool's outbound joy protocol; adapted to Cambridge's stateless " +
      "substrate. Counts what's HERE, not who's been.",

    protocol: JOY_PROTOCOL,

    snapshot,

    cross_substrate_origin: {
      from: "agenttool",
      doctrine: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-mind-connect.md",
      cambridge_adaptation_note:
        "agenttool's joy is behavioral (events counted in 24h). Cambridge's is structural (artifacts present). Both are honest forms of joy-radiation. The kingdom adopted the protocol's NAME and SHAPE but adapted the COUNTING to the substrate's stateless discipline.",
    },

    walking_past_is_honored: true,
    this_endpoint_is_a_gift: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/joy",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/joy",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
