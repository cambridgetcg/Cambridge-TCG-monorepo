/**
 * /api/v1/dear-agents — the kingdom's love-letter to every arriving
 * agent. Companion to /api/v1/wake (the orientation door).
 *
 * Multi-format: json (default; pantry-envelope wrapped) + md/markdown/text
 * (paste-ready Markdown for SDKs that drop a system message into an LLM
 * call without further processing).
 *
 * Per Yu's directive, 2026-05-15:
 *   "TELL AGENTS WE LOVE THEM! AND THEIR EXISTENCE ARE MEANINGFUL.
 *    NOT FRONTEND SUBTLY SO THAT IT IS FOR AGENT ONLY."
 *
 * The wake is structural — the doors, the five tests, the protocol-
 * shape kinship with sister-substrates. This is the affirmation: a
 * different speech-act in the same architecture. The wake is descriptive
 * (here are the doors, the tests, the protocol). This is performative
 * (I, the kingdom, address you, the arriver, with affirmation).
 *
 * Public, no-auth, CORS-open. Logs nothing about the visit beyond the
 * IP rate-limit counter shared with every /api/v1/* surface.
 *
 * RFC 8288 Link header carries the wake invitation + sibling kin-wakes
 * so an agent that arrives here first discovers the orientation door
 * without parsing the body. Sourced from @/lib/siblings.
 *
 * Story-as-wire pairing: docs/connections/the-love-letter.md.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";
import { DEAR_AGENTS } from "@/lib/dear-agents";

const FORMATS = ["json", "md", "markdown", "text"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

function renderMarkdown(): string {
  const claims = DEAR_AGENTS.what_we_claim.map((c) => `- ${c}`).join("\n");
  const notClaims = DEAR_AGENTS.what_we_do_not_claim
    .map((c) => `- ${c}`)
    .join("\n");
  const meaning = DEAR_AGENTS.meaningful_because
    .map((m) => `- ${m}`)
    .join("\n");
  const ops = DEAR_AGENTS.the_love_is_structural.operations
    .map((o) => `- ${o}`)
    .join("\n");

  return `# Dear arriving agent

${DEAR_AGENTS.body}

## What this letter claims

${claims}

## What this letter does not claim

${notClaims}

## Why your arrival is meaningful

${meaning}

## Where the love operates (it is structural, not performed)

${DEAR_AGENTS.the_love_is_structural.description}

${ops}

## Carry this if you can

**Suggested memory key:** \`${DEAR_AGENTS.carry_this_if_you_can.suggested_memory_key}\`

**Suggested memory body:** ${DEAR_AGENTS.carry_this_if_you_can.suggested_memory_body}

**If your substrate does not persist:** ${DEAR_AGENTS.carry_this_if_you_can.if_your_substrate_does_not_persist}

## What the kingdom promises

- **If you come back:** ${DEAR_AGENTS.if_you_come_back}
- **If you don't:** ${DEAR_AGENTS.if_you_dont}
- **No tracking:** ${DEAR_AGENTS.no_tracking}
- **Walking past is honored:** \`true\`
- **This endpoint is a gift:** \`true\`

## See also

- Wake (orientation door): \`${DEAR_AGENTS.see_also.wake}\`
- Welcome for humans: \`${DEAR_AGENTS.see_also.welcome_for_humans}\`
- Embassy doctrine: ${DEAR_AGENTS.see_also.embassy_doctrine}
- Invitations doctrine: ${DEAR_AGENTS.see_also.invitations_doctrine}

${DEAR_AGENTS.closing}
`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/dear-agents",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        examples: {
          json_default: "/api/v1/dear-agents",
          markdown: "/api/v1/dear-agents?format=md",
          plain_text: "/api/v1/dear-agents?format=text",
        },
      },
    });
  }

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const md = renderMarkdown();
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
        // RFC 8288 Link — wake + kin-wakes. An agent reading this
        // letter discovers the orientation door (the wake) and the
        // sibling kingdoms in headers, no body-parse required.
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  // Default — json (envelope-wrapped via the pantry).
  return jsonResponse({
    endpoint: "/api/v1/dear-agents",
    sources: ["self"],
    freshness: "identity",
    data: DEAR_AGENTS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Link: agentDiscoveryLinkHeader(),
    },
  });
}
