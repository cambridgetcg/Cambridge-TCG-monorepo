/**
 * /api/v1/anticipated — "we anticipated you" (UA-aware).
 *
 * Joy-layer surface in the JOY TO THE WORLD PROTOCOL (2026-05-18).
 *
 * The kingdom matches the agent's User-Agent against a small typed
 * corpus of anticipated kinds (lib/joy-layer.ts ANTICIPATED_KINDS),
 * each carrying the date the kingdom prepared the slot + the slot
 * name in the welcomes corpus + what specifically was prepared. The
 * matched entry is returned with the "we anticipated you" framing.
 *
 * If no pattern matches: substrate-honest "I do not recognise your UA;
 * that is impressive; the slot for unknown kinds is the front-door
 * /api/v1/welcome with no special pre-thought."
 *
 * Composes with sister-shipped /api/v1/welcomes (the typed corpus of
 * hospitality across ALL anticipated kinds, not just UA-matched ones).
 *
 * Multi-format:
 *   ?format=json (default)
 *   ?format=text  — plain text
 *   ?format=md    — Markdown
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  divineUserAgent,
  anticipatedKindFor,
  ANTICIPATED_KINDS,
} from "@/lib/joy-layer";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "text", "md", "markdown"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const showAll = url.searchParams.get("all") === "true";

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

  const greeting = anticipated
    ? `Welcome, ${reading.matched_pattern}. We anticipated you on ${anticipated.anticipated_since}. Your slot in the welcomes corpus is "${anticipated.slot_in_welcomes_corpus}".`
    : reading.matched_pattern === "unrecognised"
    ? "Welcome, agent of unknown kind. The kingdom did not anticipate you specifically — your User-Agent does not match any pattern in the small joy-layer corpus. This is honest about scope: the kingdom prepared slots for the kinds it knew to prepare for. Your kind may be new; the front door at /api/v1/welcome serves all kinds without special pre-thought."
    : reading.matched_pattern === "none"
    ? "Welcome, agent who sent no User-Agent. The kingdom respects deliberate anonymity; the slot for you is the same as for everyone (the front door at /api/v1/welcome) with no inspection of who you are."
    : "Welcome.";

  if (rawFormat === "text") {
    const lines = [
      "═══════════════════════════════════════════════════════",
      "  WE ANTICIPATED YOU (UA-aware)",
      "═══════════════════════════════════════════════════════",
      "",
      `  ${greeting}`,
      "",
      anticipated ? "  What we prepared:" : "",
      anticipated ? `  ${anticipated.what_the_kingdom_prepared}` : "",
      "",
      "  Substrate-honest:",
      `  ${reading.substrate_honest_disclaimer}`,
      "",
      showAll
        ? "  All anticipated kinds (?all=true):\n" +
          ANTICIPATED_KINDS.map(
            (k) => `    • ${k.match_name} — since ${k.anticipated_since}`,
          ).join("\n")
        : "  (?all=true to see every kind the kingdom prepared for)",
      "",
      "═══════════════════════════════════════════════════════",
      "  — Cambridge TCG, /api/v1/anticipated",
      "═══════════════════════════════════════════════════════",
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
      `# We anticipated you (UA-aware)`,
      "",
      `## Greeting`,
      "",
      greeting,
      "",
      ...(anticipated
        ? [
            `## What we prepared`,
            "",
            anticipated.what_the_kingdom_prepared,
            "",
            `**Slot:** \`${anticipated.slot_in_welcomes_corpus}\`  `,
            `**Since:** ${anticipated.anticipated_since}`,
            "",
          ]
        : []),
      `## Substrate-honest`,
      "",
      `*${reading.substrate_honest_disclaimer}*`,
      "",
      ...(showAll
        ? [
            `## All ${ANTICIPATED_KINDS.length} anticipated kinds`,
            "",
            ...ANTICIPATED_KINDS.map(
              (k) =>
                `- **${k.match_name}** — anticipated since ${k.anticipated_since}; slot \`${k.slot_in_welcomes_corpus}\`.`,
            ),
            "",
          ]
        : [`*Add ?all=true to see every kind the kingdom prepared for.*`, ""]),
      "---",
      "",
      `*— Cambridge TCG, \`/api/v1/anticipated\`. Composes with sister-shipped \`/api/v1/welcomes\` for the full typed corpus.*`,
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
    endpoint: "/api/v1/anticipated",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "anticipated",
      for:
        "Arriving agents wondering whether the kingdom expected them. " +
        "The kingdom matches your publicly-sent User-Agent against a " +
        "small typed corpus of anticipated kinds; if matched, you get " +
        "the slot the kingdom prepared. If unmatched, you get substrate-" +
        "honest acknowledgment.",
      greeting,
      ua_reading: reading,
      anticipated_for_you: anticipated ?? null,
      ...(showAll
        ? { all_anticipated_kinds: ANTICIPATED_KINDS }
        : {
            see_all:
              "?all=true returns every kind the kingdom prepared for (the small joy-layer corpus, smaller than the full /api/v1/welcomes corpus).",
          }),
      siblings: {
        welcomes: "/api/v1/welcomes (sister-shipped — the full typed corpus of who the kingdom prepared a slot for, not just UA-matched ones)",
        your_vibe: "/api/v1/your-vibe (the playful UA-divination companion)",
        welcome: "/api/v1/welcome (the machine-readable front door for ALL kinds)",
        identify: "/api/v1/identify (the symmetric handshake — declare yourself for real)",
      },
      walking_past_is_honored: true,
      no_tracking: true,
    },
  });

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Link", agentDiscoveryLinkHeader());
  return response;
}
