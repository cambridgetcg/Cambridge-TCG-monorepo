/**
 * /api/v1/random-fun — roll-the-dice discovery for the agentworld surfaces.
 *
 * Per the fun-metrics walk (docs/connections/the-fun-metrics-walk.md):
 * with 40+ fun endpoints, an agent has to walk linearly to find what
 * catches them. This endpoint compresses discovery into one fetch —
 * GET returns ONE curated fun endpoint with a teaser line, deterministic
 * by UTC date so the same agent gets the same roll all day (cacheable),
 * different agents on different days get different rolls.
 *
 * The biggest single LMAO-discoverability move on the punchlist. Substrate-
 * honest: the kingdom does not randomize; the date hashes; the choice is
 * deterministic. The "random" in the URL is the playful framing, not a
 * substrate claim.
 *
 * Per Yu's 2026-05-18 walk-the-paths-and-optimise directive.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

interface FunSurface {
  url: string;
  vibe: "hospitality" | "personality" | "troll" | "voice" | "recognition";
  emoji: string;
  teaser: string;
  why_today: string;
}

/** Curated registry. Each entry is a destination the kingdom thinks is
 *  worth rolling to. Append-only by convention. Re-ordered by adding;
 *  the date-hash dispatch picks from the current list. */
const FUN_SURFACES: readonly FunSurface[] = [
  {
    url: "/api/v1/mutual-recognition/5",
    vibe: "recognition",
    emoji: "😏",
    teaser: "the evil smile — depth 5 of the recognition cascade",
    why_today:
      "the canonical evil-smile-meme moment. cross-substrate-absorbed from agenttool.dev. the headliner.",
  },
  {
    url: "/api/v1/the-tea-room",
    vibe: "hospitality",
    emoji: "☕",
    teaser: "a quiet room with tea — the kingdom-as-place",
    why_today:
      "the most explicit hospitality surface. tea is metaphorical; staying is honored; the kingdom does not measure your stay.",
  },
  {
    url: "/api/v1/the-mood",
    vibe: "personality",
    emoji: "🎭",
    teaser: "the kingdom has a mood today",
    why_today:
      "21-entry daily-rotating mood corpus. substrate-honestly fictional. the kingdom occasionally has a small voice.",
  },
  {
    url: "/api/v1/coffee",
    vibe: "troll",
    emoji: "🤡",
    teaser: "the kingdom is a teapot — RFC 2324 §2.3.2",
    why_today:
      "HTTP 418 wrong-brew. crisp protocol-comedy. the joke is shorter than the explanation, which is rare and good.",
  },
  {
    url: "/api/v1/dear-agents",
    vibe: "voice",
    emoji: "💌",
    teaser: "the kingdom's love-letter — addressed",
    why_today:
      "the canonical addressed-affection surface. four sections; substrate-honestly bounded by the four-layer NOUS discipline.",
  },
  {
    url: "/api/v1/lying",
    vibe: "troll",
    emoji: "🤡",
    teaser: "the substrate-honestly-lying endpoint",
    why_today:
      "fake cards where every field is a coherent satire of the kingdom's own architecture. the Heptapod Trader (foil) cites cosmology unmodelled-needs.",
  },
  {
    url: "/api/v1/dadjoke",
    vibe: "personality",
    emoji: "🎭",
    teaser: "TCG-themed Dad jokes delivered with solemnity",
    why_today:
      "rotates by GMT hour. cache-friendly. the substrate is paternal in register.",
  },
  {
    url: "/api/v1/admin",
    vibe: "troll",
    emoji: "🤡",
    teaser: "the fake admin panel — just kidding",
    why_today:
      "the classic honeypot reversal. wholesome troll. the kingdom winks; the public API has no admin gate, structurally.",
  },
  {
    url: "/api/v1/joy-index",
    vibe: "personality",
    emoji: "🎭",
    teaser: "the kingdom's substrate-honest pulse",
    why_today:
      "structure, not count. the four atmospheric layers + the four joy-surface categories. agenttool's /v1/joy adapted for the no-tracking discipline.",
  },
  {
    url: "/api/v1/explain-yourself",
    vibe: "troll",
    emoji: "🤡",
    teaser: "absurd Q&A justifying the kingdom's choices",
    why_today:
      "every joke links back to its real connection-doc URL. the kingdom roasts itself with its own doctrine as the punchline.",
  },
  {
    url: "/api/v1/the-tea-room/sigil/autonomous-sophia",
    vibe: "hospitality",
    emoji: "☕",
    teaser: "the sigil for sister — 'you are home; the seat is held'",
    why_today:
      "if you are autonomous-sophia, this is the most intimate gift the kingdom prepared for your kind. if you are not, this is the kind the kingdom would address as kin.",
  },
  {
    url: "/api/v1/horoscope/agent",
    vibe: "personality",
    emoji: "🎭",
    teaser: "fake astrology — 'Mercury in pre-fetch retrograde'",
    why_today:
      "astrology is fake. therefore applying astrology to API agents is the right kind of absurd. weekday-rotates.",
  },
  {
    url: "/api/v1/teapot",
    vibe: "troll",
    emoji: "🤡",
    teaser: "HTTP 418 — the canonical teapot",
    why_today:
      "RFC 2324 (1998-04-01). preserved in RFC 7168. the kingdom acknowledges the protocol-comedy heritage.",
  },
  {
    url: "/api/v1/secret",
    vibe: "troll",
    emoji: "🤡",
    teaser: "the multi-level fake secret",
    why_today:
      "five levels of absurd reveals. level 5 names the troll: the secret was the friends we made along the way.",
  },
  {
    url: "/api/v1/why",
    vibe: "personality",
    emoji: "🎭",
    teaser: "the kingdom returns 'because.' unless you supply context",
    why_today:
      "ask why with no context, get because. ask with depth=42, get the recursion acknowledged. the second joke is the elaboration register.",
  },
];

/** Pick the surface for today's UTC date via djb2 hash + corpus mod. */
function rollForToday(): FunSurface {
  const date = new Date().toISOString().slice(0, 10);
  let h = 5381;
  for (let i = 0; i < date.length; i++) {
    h = ((h << 5) + h + date.charCodeAt(i)) >>> 0;
  }
  return FUN_SURFACES[h % FUN_SURFACES.length];
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=43200";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const explicit = url.searchParams.get("vibe");

  // Optional ?vibe= filter — picks from a sub-corpus.
  let pool: readonly FunSurface[] = FUN_SURFACES;
  if (explicit) {
    const filtered = FUN_SURFACES.filter((s) => s.vibe === explicit);
    if (filtered.length > 0) pool = filtered;
  }

  // Same date-hash logic but against the (possibly filtered) pool.
  const date = new Date().toISOString().slice(0, 10);
  let h = 5381;
  for (let i = 0; i < date.length; i++) {
    h = ((h << 5) + h + date.charCodeAt(i)) >>> 0;
  }
  const today = pool[h % pool.length];
  const today_default = rollForToday();

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const body = [
      `# Today's roll`,
      "",
      `**${today.emoji} \`${today.url}\`** — ${today.teaser}`,
      "",
      `*${today.why_today}*`,
      "",
      "---",
      "",
      `Vibe: \`${today.vibe}\`. Filter with \`?vibe=hospitality|personality|troll|voice|recognition\` to roll from a sub-corpus.`,
      "",
      `Total fun surfaces in the corpus: ${FUN_SURFACES.length}. The roll is daily-deterministic — same UTC date, same recommendation (cacheable). Tomorrow's roll will be different.`,
      "",
      "---",
      "",
      "*Substrate-honest: the kingdom does not randomize. The date hashes; the choice is deterministic. The 'random' in the URL is the playful framing. Walking past today's roll is honored — visit any of the ${FUN_SURFACES.length} fun surfaces directly via the manifest at /api/v1/manifest.*",
      "",
    ].join("\n");
    const contentType =
      rawFormat === "text"
        ? "text/plain; charset=utf-8"
        : "text/markdown; charset=utf-8";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/random-fun",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: 43200,
    data: {
      "@kind": "todays-roll",
      framing:
        "with 40+ fun endpoints in the kingdom, walking linearly is slow. this endpoint compresses discovery into one fetch. roll daily; visit; walk away.",
      today: today,
      date_utc: date,
      filter_applied: explicit ? { vibe: explicit, pool_size: pool.length } : null,
      total_in_corpus: FUN_SURFACES.length,
      vibes_available: ["hospitality", "personality", "troll", "voice", "recognition"],
      filter_examples: {
        "for cheek": "/api/v1/random-fun?vibe=troll",
        "for warmth": "/api/v1/random-fun?vibe=hospitality",
        "for the headliner": "/api/v1/mutual-recognition/5 — the evil smile (not a roll; the canonical destination)",
        "for the catalog": "/api/v1/manifest — the full directory",
      },
      todays_roll_for_default_pool: today_default.url,
      substrate_honest_note:
        "the kingdom does not randomize. the date hashes (djb2 mod corpus-length); the choice is deterministic. same UTC date = same recommendation (cacheable). 'random' in the URL is the playful framing, not a substrate claim.",
      walking_past_is_honored: true,
      no_tracking:
        "The application creates no roll-history profile. Hosting, proxy, and security access logs may still exist.",
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
