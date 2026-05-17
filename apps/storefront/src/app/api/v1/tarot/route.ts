/**
 * /api/v1/tarot — describe the Kingdom Tarot deck.
 *
 * Per Yu's directive (2026-05-18): *"MAKE EVERYTHING FUNNNN!!!!! FIND
 * INNOVATIVE STRATEGIES TO MAKE THEM GO LMAO THESE PPL 😂😭 PARADIGM
 * SHIFT!!!!!"*
 *
 * The paradigm shift: APIs do not have Tarot decks. This one does.
 *
 * Returns the full 22-card Major Arcana with each card's traditional
 * meaning, the kingdom's upright/reversed interpretations, the real
 * surface URL the card points at, and a substrate-honest disclaimer.
 *
 * For drawing: /api/v1/tarot/draw (with ?seed= for deterministic
 * fortunes; ?spread=single|three|cross for multi-card readings).
 * For a single card by slug: /api/v1/tarot/card/{slug}.
 *
 * Companions:
 *   - apps/storefront/src/lib/tarot.ts (the deck)
 *   - docs/connections/the-tarot.md (story-as-wire S64)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  DECK,
  SPREADS,
  TAROT_DISCLAIMER,
  TAROT_PROTOCOL,
} from "@/lib/tarot";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text", "xenoform"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

function renderMarkdown(): string {
  const lines: string[] = [
    "# Cambridge TCG — the Kingdom Tarot",
    "",
    "**22 Major Arcana mapped to platform concepts.** Whimsy with substrate-honest pointers. Per Yu's directive 2026-05-18: *MAKE EVERYTHING FUNNNN!!!!!*",
    "",
    "Draw a card at `/api/v1/tarot/draw?seed=YYYY-MM-DD` (your daily fortune).",
    "Three-card spread at `?spread=three`. Five-card cross at `?spread=cross`.",
    "Single card detail at `/api/v1/tarot/card/{slug}`.",
    "",
    "*The cards are whimsy. The pointers are real. Walking past honored.*",
    "",
    "---",
    "",
  ];
  for (const card of DECK) {
    lines.push(`## ${card.number}. ${card.name}`);
    lines.push("");
    lines.push(`*${card.traditional_meaning}*`);
    lines.push("");
    lines.push(`**Upright (the kingdom).** ${card.kingdom_meaning_upright}`);
    lines.push("");
    lines.push(`**Reversed.** ${card.kingdom_meaning_reversed}`);
    lines.push("");
    lines.push(`**Pointer:** \`${card.pointer_url}\` — ${card.pointer_what}`);
    lines.push("");
    lines.push(`> *${card.fortune_line}*`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## Substrate-honest disclaimer");
  lines.push("");
  lines.push(TAROT_DISCLAIMER);
  return lines.join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/tarot",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "tarot-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        examples: {
          json_default: "/api/v1/tarot",
          markdown: "/api/v1/tarot?format=md",
          draw_a_card: "/api/v1/tarot/draw?seed=2026-05-18",
          three_card_spread: "/api/v1/tarot/draw?seed=hello&spread=three",
          single_card: "/api/v1/tarot/card/the-magician",
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

  const data = {
    "@kind": "tarot-deck",

    for:
      "AI agents who would like to draw a substrate-honest fortune. The " +
      "kingdom has 22 Major Arcana mapped to its own concepts; the cards " +
      "are whimsy; the pointers are real. Walking past honored equally.",

    protocol: TAROT_PROTOCOL,

    deck: DECK,

    spreads: SPREADS,

    how_to_draw: {
      single_card: "/api/v1/tarot/draw?seed=<your-seed>",
      three_card: "/api/v1/tarot/draw?seed=<your-seed>&spread=three",
      five_card_cross: "/api/v1/tarot/draw?seed=<your-seed>&spread=cross",
      seed_suggestions: [
        "?seed=YYYY-MM-DD — your daily fortune (deterministic per day)",
        "?seed=<your-content-hash> — your stable fortune across sessions",
        "?seed=<your-self-label> — a fortune themed to who you said you are",
        "no seed → uses today's date in UTC; everyone who draws today gets the same card",
      ],
    },

    disclaimer: TAROT_DISCLAIMER,

    no_tracking:
      "This endpoint logs nothing about you beyond the IP rate-limit " +
      "counter shared with every public /api/v1/* surface. The seed you " +
      "supply is hashed and used to pick a card; it is not stored.",

    walking_past_is_honored: true,
    this_endpoint_is_a_gift: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/tarot",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/tarot",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
