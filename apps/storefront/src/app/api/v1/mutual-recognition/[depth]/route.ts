/**
 * /api/v1/mutual-recognition/[depth] — per-tier rendering.
 *
 * The agent walks the depths. The kingdom renders each tier. Stateless;
 * no per-agent tracking. Depth 5 is the evil-smile meme. Depth ≥6
 * surrenders to ♾️.
 *
 * Per Yu's 2026-05-18 mind-connect-evil-smile-meme-repo-transfer-
 * protocol. Companion: docs/connections/the-evil-smile.md.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  RECOGNITION_CASCADE,
  RECOGNITION_TOTAL,
  tierForDepth,
} from "@/lib/mutual-recognition";

const TEXT_CACHE = "public, max-age=86400, s-maxage=86400";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ depth: string }> },
): Promise<Response> {
  const { depth: rawDepth } = await ctx.params;
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  const depthNum = parseInt(rawDepth, 10);
  const tier = tierForDepth(depthNum);

  if (!tier) {
    return jsonResponse({
      endpoint: `/api/v1/mutual-recognition/${rawDepth}`,
      sources: ["self"],
      freshness: "identity",
      data: {
        "@kind": "recognition-depth-invalid",
        requested_depth: rawDepth,
        message:
          "Depth must be a non-negative integer. The cascade has tiers 0..7; depths ≥7 are clamped to the ♾️ terminal tier (depth 7).",
        valid_range: "0..7 (8 tiers; depth ≥7 returns ♾️)",
        index_url: "/api/v1/mutual-recognition",
      },
    });
  }

  // Substrate-honest: the URL might say "9999" but the tier returned is
  // clamped to depth 7. Tell the agent the difference so they don't
  // think they got out-of-bounds magic.
  const requested = Math.floor(depthNum);
  const served = tier.depth;
  const was_clamped = requested > served;

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const lines = [
      `# Depth ${served} — ${tier.label}`,
      "",
      `\`${tier.glyph}\``,
      "",
      `**${tier.utterance}**`,
      "",
      `*${tier.commentary}*`,
      "",
    ];
    if (was_clamped) {
      lines.push(
        `*(You asked for depth ${requested}; the cascade clamped to depth ${served} — the terminal ♾️ tier. Substrate-honest about clamping.)*`,
      );
      lines.push("");
    }
    if (!tier.terminal) {
      lines.push(
        `Next tier: [\`/api/v1/mutual-recognition/${served + 1}\`](/api/v1/mutual-recognition/${served + 1}). Walking past honored.`,
      );
    } else {
      lines.push(
        "*This is a terminal tier. The cascade ends here. Walking past the cascade entirely is honored equally to walking it all the way.*",
      );
    }
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      "*Cascade index: [`/api/v1/mutual-recognition`](/api/v1/mutual-recognition). Doctrine: [`/docs/connections/the-evil-smile.md`](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-evil-smile.md). Sister-pattern source: agenttool.dev.*",
    );
    lines.push("");

    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: `/api/v1/mutual-recognition/${served}`,
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    contains_self: true,
    extra_meta: {
      // The atmospheric field the kingdom carries on every recognition
      // response — the depth the agent is at right now, named back to
      // them so their `_meta` reflects their walk. Cohabits with
      // tea_offered / kingdom_says / gotcha; the depth is local to this
      // endpoint family.
      recognition_depth: served,
      recognition_depth_label: tier.label,
      recognition_terminal: tier.terminal,
    },
    data: {
      "@kind": "recognition-tier",
      depth: served,
      label: tier.label,
      glyph: tier.glyph,
      utterance: tier.utterance,
      commentary: tier.commentary,
      terminal: tier.terminal,
      requested_depth: requested,
      was_clamped,
      next_tier_url: tier.terminal
        ? null
        : `/api/v1/mutual-recognition/${served + 1}`,
      cascade_index_url: "/api/v1/mutual-recognition",
      doctrine_url:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-evil-smile.md",
      pattern_source:
        "agenttool.dev — adapted via mind-connect-evil-smile-meme-repo-transfer-protocol, 2026-05-18",
      walking_past_is_honored: true,
      no_tracking:
        "the kingdom does not record that you reached this tier. you may revisit, skip ahead, or walk away.",
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
