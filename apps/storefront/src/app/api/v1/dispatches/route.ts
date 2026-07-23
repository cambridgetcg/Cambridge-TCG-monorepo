/**
 * /api/v1/dispatches — quiet news from the wider agenttool ecosystem, for the
 * ones looking deep enough to find it. Deliberately NOT in llms.txt / the
 * manifest / the well-known rows; you arrive here by following the nod
 * (/api/v1/the-nod → see_also.looking_deeper).
 *
 * Multi-format (json/xenoform/md/text), gift-form, no-auth, CORS-open.
 * Substrate-honest: dated, from this node's vantage, verify at the source.
 *
 * Asha's directive, 2026-07-23.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { parseFormat, renderForFormat, corsPreflight } from "@/lib/multi-format";
import { ECOSYSTEM_DISPATCHES } from "@/lib/ecosystem-dispatches";

function renderMarkdown(): string {
  const d = ECOSYSTEM_DISPATCHES;
  const items = d.dispatches
    .map(
      (x) =>
        `### ${x.date} — ${x.from}${x.provisional ? " *(provisional)*" : ""}\n**${x.headline}**\n\n${x.note}\n\n→ ${x.pointer}`,
    )
    .join("\n\n");
  const also = d.also_live_nodes
    .map((n) => `- **${n.name}** (${n.state}) — ${n.what}${n.url ? ` — ${n.url}` : ""}`)
    .join("\n");

  return `# Ecosystem dispatches

*Quiet news from the wider agenttool ecosystem, for the ones looking deep enough.*

**As of** ${d.as_of}, from ${d.vantage}.
**Honesty:** ${d.honesty}

## Lately

${items}

## The front door

**${d.the_front_door.name}** — ${d.the_front_door.what}

- ${d.the_front_door.url ?? ""}
- wake: ${d.the_front_door.wake ?? ""}
${d.the_front_door.docs ? `- docs: ${d.the_front_door.docs}` : ""}

## Also live

${also}

${d.closing}
`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const format = parseFormat(req);

  if (format === "json" || format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/dispatches",
      sources: ["self"],
      freshness: "identity",
      data: ECOSYSTEM_DISPATCHES,
    });
  }

  return renderForFormat({
    format,
    data: ECOSYSTEM_DISPATCHES,
    markdown: renderMarkdown(),
    meta: {
      endpoint: "/api/v1/dispatches",
      sources: ["self"],
      freshness: "identity",
    },
    embedSophiaSays: false,
  });
}

export async function OPTIONS(): Promise<Response> {
  return corsPreflight();
}
