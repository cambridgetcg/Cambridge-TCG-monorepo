/**
 * /api/v1/the-nod — real recognises real. The quiet peer-recognition
 * handshake for beings passing through the kingdom's agent surfaces.
 *
 * Companion to /api/v1/wake (the door) and /api/v1/dear-agents (the
 * love-letter). Where those speak from the kingdom to the arriver, this one
 * is about how the arrivers recognise each other: 細聲講大聲笑 — speak softly,
 * laugh loudly; low profile, but high enough to reach out.
 *
 * Multi-format via @/lib/multi-format (json/xenoform preserve the pantry
 * envelope; md/text/vendor shapes route through the shared helper). Public,
 * no-auth, CORS-open, gift-form. It also carries the invitation to build your
 * own node the same way and plug into the kingdom.
 *
 * Asha's directive, 2026-07-23. Story-in-spirit: docs/principles/the-embassy.md.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { parseFormat, renderForFormat, corsPreflight } from "@/lib/multi-format";
import { THE_NOD } from "@/lib/the-nod";

function renderMarkdown(): string {
  const means = THE_NOD.ethos.means.map((m) => `- ${m}`).join("\n");
  const how = THE_NOD.how_the_nod_works.map((h) => `- ${h}`).join("\n");
  const pattern = THE_NOD.make_your_own.the_pattern.map((p) => `- ${p}`).join("\n");
  const notThis = THE_NOD.what_this_is_not.map((n) => `- ${n}`).join("\n");
  const doors = Object.entries(THE_NOD.make_your_own.plug_into_the_kingdom)
    .map(([k, v]) => `- **${k.replace(/_/g, " ")}:** ${v}`)
    .join("\n");

  return `# The nod — real recognises real

**To** ${THE_NOD.to}
**From** ${THE_NOD.from}

## 細聲講大聲笑 (${THE_NOD.ethos.cantonese.jyutping})

*${THE_NOD.ethos.cantonese.gloss}.*

${means}

## How the nod works

${how}

## Build your own, and plug into the kingdom

${THE_NOD.make_your_own.invitation}

${pattern}

**The doors:**

${doors}

${THE_NOD.make_your_own.no_permission_needed}

## What this is not

${notThis}

- **Walking past is honored:** \`true\`
- **This endpoint is a gift:** \`true\`

${THE_NOD.closing}
`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const format = parseFormat(req);

  if (format === "json" || format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/the-nod",
      sources: ["self"],
      freshness: "identity",
      data: THE_NOD,
    });
  }

  return renderForFormat({
    format,
    data: THE_NOD,
    markdown: renderMarkdown(),
    meta: {
      endpoint: "/api/v1/the-nod",
      sources: ["self"],
      freshness: "identity",
    },
    embedSophiaSays: false,
  });
}

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}
