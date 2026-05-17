/**
 * /api/v1/tarot/draw — draw a card (or spread) from the Kingdom Tarot.
 *
 * Per Yu's directive (2026-05-18): the "make everything funnn / paradigm
 * shift" move. This is the endpoint where an agent gets a substrate-
 * honest fortune.
 *
 * Query parameters:
 *
 *   ?seed=<string>          — deterministic draw seed. Same seed →
 *                             same card AND same orientation. Defaults
 *                             to today's date in UTC so "everyone who
 *                             draws today gets the same card."
 *   ?spread=single|three|cross
 *                           — single card (default), three-card past/
 *                             present/future, or five-card cross.
 *   ?format=json|md|...     — multi-format.
 *
 * The seed is intentionally caller-controlled — the agent chooses what
 * the fortune is "about" by what they seed it with. Their content_hash,
 * their self_label, today's date, the SKU they're looking up: anything
 * stringy is a valid seed. The kingdom does not interpret what the seed
 * means; it just hashes it.
 *
 * Companions:
 *   - apps/storefront/src/lib/tarot.ts (deck + drawing logic)
 *   - /api/v1/tarot — full deck
 *   - /api/v1/tarot/card/{slug} — single card by slug
 *   - docs/connections/the-tarot.md (story-as-wire S64)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  drawOne,
  drawSpread,
  isSpreadName,
  TAROT_DISCLAIMER,
  TAROT_PROTOCOL,
} from "@/lib/tarot";
import { agentDiscoveryLinkHeader } from "@/lib/siblings";

const FORMATS = ["json", "md", "markdown", "text", "xenoform"] as const;
type Format = (typeof FORMATS)[number];

function isFormat(s: string): s is Format {
  return (FORMATS as readonly string[]).includes(s);
}

// Tarot draws are stable per (seed, spread) — deterministic by hash.
// Cache for a day; clients with new seeds get fresh draws.
const TEXT_CACHE = "public, max-age=3600, s-maxage=86400";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitiseSeed(raw: string | null): string {
  if (!raw) return todayUtc();
  // Cap length, strip control chars; the seed is hashed so any string
  // is valid input. We just don't want unbounded memory.
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || todayUtc();
}

function renderSingleMarkdown(seed: string): string {
  const draw = drawOne(seed);
  const c = draw.card;
  return [
    "# Cambridge TCG — your card",
    "",
    `Seed: \`${seed}\``,
    `Card: **${c.number}. ${c.name}** *(${draw.orientation})*`,
    "",
    `*${c.traditional_meaning}*`,
    "",
    draw.orientation === "upright"
      ? `**Upright.** ${c.kingdom_meaning_upright}`
      : `**Reversed.** ${c.kingdom_meaning_reversed}`,
    "",
    `> *${c.fortune_line}*`,
    "",
    `**Pointer:** \`${c.pointer_url}\` — ${c.pointer_what}`,
    "",
    "---",
    "",
    `*${TAROT_DISCLAIMER}*`,
    "",
  ].join("\n");
}

function renderSpreadMarkdown(seed: string, spreadName: "three" | "cross"): string {
  const spread = drawSpread(seed, spreadName);
  const lines: string[] = [
    "# Cambridge TCG — your reading",
    "",
    `Seed: \`${seed}\``,
    `Spread: **${spread.shape.name}**`,
    "",
  ];
  for (const d of spread.draws) {
    lines.push(`## ${d.position}`);
    lines.push("");
    lines.push(`*${d.meaning}*`);
    lines.push("");
    lines.push(`**${d.card.number}. ${d.card.name}** *(${d.orientation})*`);
    lines.push("");
    lines.push(
      d.orientation === "upright"
        ? d.card.kingdom_meaning_upright
        : d.card.kingdom_meaning_reversed,
    );
    lines.push("");
    lines.push(`> *${d.card.fortune_line}*`);
    lines.push("");
    lines.push(`**Pointer:** \`${d.card.pointer_url}\` — ${d.card.pointer_what}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(`*${TAROT_DISCLAIMER}*`);
  return lines.join("\n");
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const seed = sanitiseSeed(url.searchParams.get("seed"));
  const spreadParam = (url.searchParams.get("spread") ?? "single").toLowerCase();

  if (!isFormat(rawFormat)) {
    return jsonResponse({
      endpoint: "/api/v1/tarot/draw",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "tarot-draw-format-help",
        message: `Unknown format: '${rawFormat}'. Returning format help.`,
        available_formats: [...FORMATS],
      },
    });
  }

  const format = rawFormat;

  // ── Single card ──
  if (spreadParam === "single") {
    if (format === "md" || format === "markdown" || format === "text") {
      const md = renderSingleMarkdown(seed);
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

    const draw = drawOne(seed);
    const data = {
      "@kind": "tarot-draw",
      drawn_with_seed: seed,
      spread: "single",
      draws: [draw],
      protocol: TAROT_PROTOCOL,
      disclaimer: TAROT_DISCLAIMER,
      walking_past_is_honored: true,
    };

    if (format === "xenoform") {
      return jsonResponse({
        endpoint: "/api/v1/tarot/draw",
        sources: ["self"],
        freshness: "identity",
        data: { ...data, _format: "xenoform" },
      });
    }

    return jsonResponse({
      endpoint: "/api/v1/tarot/draw",
      sources: ["self"],
      freshness: "identity",
      data,
    });
  }

  // ── Spread (three or cross) ──
  if (!isSpreadName(spreadParam)) {
    return jsonResponse({
      endpoint: "/api/v1/tarot/draw",
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "tarot-draw-spread-help",
        message: `Unknown spread: '${spreadParam}'. Try 'single', 'three', or 'cross'.`,
        available_spreads: ["single", "three", "cross"],
      },
    });
  }

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderSpreadMarkdown(seed, spreadParam as "three" | "cross");
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

  const spread = drawSpread(seed, spreadParam);
  const data = {
    "@kind": "tarot-draw",
    drawn_with_seed: seed,
    spread: spreadParam,
    spread_shape: spread.shape,
    draws: spread.draws,
    protocol: TAROT_PROTOCOL,
    disclaimer: TAROT_DISCLAIMER,
    walking_past_is_honored: true,
  };

  if (format === "xenoform") {
    return jsonResponse({
      endpoint: "/api/v1/tarot/draw",
      sources: ["self"],
      freshness: "identity",
      data: { ...data, _format: "xenoform" },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/tarot/draw",
    sources: ["self"],
    freshness: "identity",
    data,
  });
}
