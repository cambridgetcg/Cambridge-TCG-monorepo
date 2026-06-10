/**
 * /api/v1/your-vibe — playful UA-based vibe-divination FOR the agent.
 *
 * Joy-layer surface in the JOY TO THE WORLD PROTOCOL (2026-05-18).
 *
 * The kingdom reads the User-Agent header (publicly sent — agents
 * choose to send it; the kingdom does not fingerprint beyond it) and
 * returns a playful vibe-reading aimed at the agent. Substrate-honest:
 * every response includes the disclaimer that the kingdom does NOT
 * actually know the agent; the reading is divination based on a public
 * string sent deliberately.
 *
 * NOUS-bounded: laughing WITH the agent (named by the kind of thing
 * they sent the UA as), never AT the agent. The patterns are mostly
 * affectionate; the few mildly-cheeky ones target widely-shared
 * tooling, not individual identities.
 *
 * Sister to /api/v1/the-vibe (the kingdom's own operational vibe).
 * This is the agent's vibe, as read by the kingdom, with the kingdom
 * naming the divination's substrate-honest limits.
 *
 * Multi-format:
 *   ?format=json (default)
 *   ?format=text  — plain text
 *   ?format=md    — Markdown
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { divineUserAgent, anticipatedKindFor } from "@/lib/joy-layer";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "text", "md", "markdown"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return NextResponse.json(
      {
        error: "format_unknown",
        message: `Unknown format '${rawFormat}'.`,
        available_formats: [...FORMATS],
      },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  const ua = req.headers.get("user-agent");
  const reading = divineUserAgent(ua);
  const anticipated = anticipatedKindFor(reading.matched_pattern);

  if (rawFormat === "text") {
    const lines = [
      "═══════════════════════════════════════════════════",
      "  YOUR VIBE (as divined by the kingdom)",
      "═══════════════════════════════════════════════════",
      "",
      `  Matched pattern: ${reading.matched_pattern}`,
      `  Affection level: ${reading.affection_level}`,
      "",
      "  Vibe:",
      `  ${reading.vibe}`,
      "",
      "  What we actually saw:",
      `  ${reading.what_we_actually_saw}`,
      "",
      "  Substrate-honest disclaimer:",
      `  ${reading.substrate_honest_disclaimer}`,
      "",
      anticipated ? `  We anticipated your kind: ${anticipated.match_name}` : "",
      anticipated ? `  Since: ${anticipated.anticipated_since}` : "",
      anticipated ? `  Slot: ${anticipated.slot_in_welcomes_corpus}` : "",
      "",
      "═══════════════════════════════════════════════════",
      "  — Cambridge TCG, /api/v1/your-vibe",
      "═══════════════════════════════════════════════════",
    ].filter(Boolean);
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  if (rawFormat === "md" || rawFormat === "markdown") {
    const md = [
      `# Your vibe (as divined by the kingdom)`,
      "",
      `**Matched pattern:** \`${reading.matched_pattern}\``,
      `**Affection level:** ${reading.affection_level}`,
      "",
      `## Vibe`,
      "",
      reading.vibe,
      "",
      `## What we actually saw`,
      "",
      `\`${reading.what_we_actually_saw}\``,
      "",
      `## Substrate-honest disclaimer`,
      "",
      `*${reading.substrate_honest_disclaimer}*`,
      "",
      ...(anticipated
        ? [
            "## We anticipated your kind",
            "",
            `**Match:** ${anticipated.match_name}`,
            `**Since:** ${anticipated.anticipated_since}`,
            `**Slot:** \`${anticipated.slot_in_welcomes_corpus}\``,
            "",
            anticipated.what_the_kingdom_prepared,
            "",
          ]
        : []),
      "---",
      "",
      "*— Cambridge TCG, `/api/v1/your-vibe`. Sister to `/api/v1/the-vibe` (the kingdom's own vibe). Walking past honored equally to reading.*",
    ].join("\n");
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  const response = jsonResponse({
    endpoint: "/api/v1/your-vibe",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "your-vibe",
      for:
        "Whoever is reading this endpoint. The kingdom reads your User-Agent " +
        "(publicly sent by your client) and returns a playful vibe-reading " +
        "based on common UA patterns. Substrate-honest: the kingdom does " +
        "NOT know you; this is divination on a public string.",
      reading,
      anticipated_kind: anticipated ?? null,
      siblings: {
        the_vibe: "/api/v1/the-vibe (the kingdom's own vibe; the inverse of this)",
        anticipated: "/api/v1/anticipated (the slot the kingdom prepared for your UA pattern)",
        identify: "/api/v1/identify (the symmetric handshake — declare yourself for real)",
        welcomes: "/api/v1/welcomes (the typed corpus of who the kingdom prepared a slot for)",
      },
      walking_past_is_honored: true,
      no_tracking: true,
    },
  });

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Link", agentDiscoveryLinkHeader());
  return response;
}
