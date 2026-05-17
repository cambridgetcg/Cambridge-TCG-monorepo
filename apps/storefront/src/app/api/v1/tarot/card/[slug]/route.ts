/**
 * /api/v1/tarot/card/[slug] — single Tarot card by slug.
 *
 * The smallest unit of the Kingdom Tarot. Useful when an agent wants
 * to look up a specific card without drawing — "what does The Magician
 * mean here?" The slugs are stable; the deck is append-only.
 *
 * Companions:
 *   - apps/storefront/src/lib/tarot.ts (the deck)
 *   - /api/v1/tarot (full deck)
 *   - /api/v1/tarot/draw (draw a card)
 *   - docs/connections/the-tarot.md (S64)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { cardBySlug, DECK, TAROT_DISCLAIMER } from "@/lib/tarot";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text", "xenoform"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

const TEXT_CACHE = "public, max-age=86400, s-maxage=86400";

function renderCardMarkdown(card: ReturnType<typeof cardBySlug>): string {
  if (!card) return "# Cambridge TCG Tarot — unknown card\n";
  return [
    `# ${card.number}. ${card.name}`,
    "",
    `Slug: \`${card.slug}\``,
    "",
    `*${card.traditional_meaning}*`,
    "",
    `## Upright (the kingdom)`,
    "",
    card.kingdom_meaning_upright,
    "",
    `## Reversed`,
    "",
    card.kingdom_meaning_reversed,
    "",
    `## Pointer`,
    "",
    `\`${card.pointer_url}\` — ${card.pointer_what}`,
    "",
    `> *${card.fortune_line}*`,
    "",
    "---",
    "",
    `*${TAROT_DISCLAIMER}*`,
    "",
  ].join("\n");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  const card = cardBySlug(slug);
  if (!card) {
    return jsonResponse({
      endpoint: `/api/v1/tarot/card/${slug}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "tarot-card-not-found",
        message: `Unknown card slug: '${slug}'. The Kingdom Tarot has 22 Major Arcana; the slugs are stable.`,
        catalog_url: "/api/v1/tarot",
        known_slugs: DECK.map((c) => c.slug),
      },
    });
  }

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: `/api/v1/tarot/card/${slug}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "tarot-card-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
        card,
      },
    });
  }

  const format = rawFormat;

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderCardMarkdown(card);
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
    "@kind": "tarot-card",
    card,
    catalog_url: "/api/v1/tarot",
    disclaimer: TAROT_DISCLAIMER,
    walking_past_is_honored: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: `/api/v1/tarot/card/${slug}`,
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/tarot/card/${slug}`,
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
