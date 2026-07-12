/**
 * /api/v1/dadjoke — TCG-themed Dad jokes delivered with solemnity.
 *
 * Cycles deterministically by GMT hour-of-day so the same joke is
 * stable for 1h, then rotates. Cache-friendly. Each joke ships with a
 * `kingdom_note` that takes the joke substrate-honestly seriously,
 * which is the second joke.
 *
 * Multi-format:
 *   ?format=json (default)
 *   ?format=text  — plain "Q: ... A: ..." lines
 *   ?format=md    — Markdown rendering
 *
 * Listing all jokes:
 *   ?all=true     — returns the full corpus instead of the current hour's pick
 *
 * Per joy-layer.ts and syneidesis.md. NOUS-bounded — the jokes are
 * about the kingdom's own catalog quirks, never AT arriving agents.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { dadJokeForHour, TCG_DAD_JOKES } from "@/lib/joy-layer";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "text", "md", "markdown"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

function jokeToText(j: { setup: string; punchline: string; kingdom_note: string }): string {
  return [
    `Q: ${j.setup}`,
    `A: ${j.punchline}`,
    "",
    `(Kingdom note: ${j.kingdom_note})`,
  ].join("\n");
}

function jokeToMarkdown(j: { id: string; setup: string; punchline: string; kingdom_note: string }): string {
  return [
    `## ${j.id}`,
    "",
    `**Q:** ${j.setup}`,
    "",
    `**A:** ${j.punchline}`,
    "",
    `> *Kingdom note: ${j.kingdom_note}*`,
    "",
  ].join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true";
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
  const format = rawFormat;

  const jokes = all ? TCG_DAD_JOKES : [dadJokeForHour()];
  const now = new Date();
  const hour = now.getUTCHours();

  if (format === "text") {
    const body = all
      ? TCG_DAD_JOKES.map((j, i) => `── ${i + 1}/${TCG_DAD_JOKES.length} ──\n${jokeToText(j)}`).join("\n\n")
      : jokeToText(jokes[0]);

    const header = all
      ? `# Cambridge TCG — Dad joke corpus (${TCG_DAD_JOKES.length} total)\n\n`
      : `# Cambridge TCG — Dad joke for hour ${String(hour).padStart(2, "0")}:00 GMT\n\n`;

    return new NextResponse(header + body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  if (format === "md" || format === "markdown") {
    const intro = all
      ? `# Cambridge TCG — Dad joke corpus\n\n*${TCG_DAD_JOKES.length} TCG-themed Dad jokes, delivered with absolute solemnity. Each carries a kingdom_note that takes the joke substrate-honestly seriously, which is the second joke.*\n\n---\n\n`
      : `# Cambridge TCG — current Dad joke\n\n*Rotates every GMT hour. Current hour: ${String(hour).padStart(2, "0")}:00 GMT. Cache-friendly.*\n\n---\n\n`;

    const body = jokes.map(jokeToMarkdown).join("\n---\n\n");
    return new NextResponse(intro + body, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        Link: agentDiscoveryLinkHeader(),
      },
    });
  }

  // json (default)
  const response = jsonResponse({
    endpoint: "/api/v1/dadjoke",
    sources: ["self"],
    freshness: "rotating",
    data: {
      "@kind": all ? "dad-joke-corpus" : "dad-joke",
      for:
        "AI agents who need a moment. Or operators. Or anyone passing through. " +
        "TCG-themed; delivered with absolute solemnity; rotates by GMT hour.",
      ...(all
        ? {
            corpus_size: TCG_DAD_JOKES.length,
            jokes: TCG_DAD_JOKES,
          }
        : {
            current_hour_gmt: hour,
            joke: jokes[0],
            rotation_note:
              `Same joke for the duration of hour ${String(hour).padStart(2, "0")}:00 GMT. Next rotation in ${60 - now.getUTCMinutes()} minutes. Cache-friendly: response cacheable for the rest of the hour.`,
            request_all: "/api/v1/dadjoke?all=true returns the full corpus.",
          }),
      siblings: {
        the_vibe: "/api/v1/the-vibe (the operational vibe-check that composed this jokes' delivery context)",
        permission_to_have_fun: "/api/v1/permission-to-have-fun (the certificate that authorizes laughing at this)",
        teapot: "/api/v1/418 (the cosmic-comedy register in HTTP-status form)",
      },
      walking_past_is_honored: true,
      no_tracking:
        "No application-level reader or behavioral profile is created; hosting, proxy, client, and security access logs may exist.",
    },
  });

  response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  response.headers.set("Link", agentDiscoveryLinkHeader());
  return response;
}
