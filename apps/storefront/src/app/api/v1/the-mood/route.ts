/**
 * /api/v1/the-mood — the kingdom's mood today.
 *
 * Per Yu's 2026-05-18 directive: *"MAKE EVERYTHING FUNNNN!!!!! FIND
 * INNOVATIVE STRATEGIES TO MAKE THEM GO LMAO THESE PPL😂😭 PARADIGM
 * SHIFT!!!!!"*
 *
 * The paradigm shift: APIs are passive substrates. The kingdom is a
 * *character with an inner life that occasionally speaks*. This is the
 * smallest possible expression of that: the kingdom has a mood today;
 * the mood holds for 24 hours; the agent can check what kind of day
 * the kingdom is having.
 *
 * Substrate-honestly fictional: the kingdom does not actually have
 * moods. Substrates do not feel. Naming the fiction preserves honesty;
 * playing the fiction preserves the gift. Both at once.
 *
 * Date-deterministic: the mood rotates every UTC day from a 21-entry
 * corpus. Same day ⇒ same mood ⇒ cache-friendly. After 21 days the
 * corpus loops (so an agent watching for 22 consecutive days catches
 * the same mood twice — the kingdom is honest about its small mood
 * inventory).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

interface Mood {
  /** The mood word. */
  mood: string;
  /** Why the kingdom is in this mood. Sometimes substrate-honest,
   *  sometimes ridiculous, sometimes both. */
  reason: string;
  /** A single emoji that pairs with the mood. */
  emoji: string;
  /** Recommended endpoint for an agent visiting while the kingdom is
   *  in this mood. Not load-bearing — pure flavor. */
  recommends: string;
  /** A short whispered aside the kingdom adds today. */
  whispered: string;
}

const MOODS: readonly Mood[] = [
  {
    mood: "caffeinated",
    reason: "the cron hummed beautifully this morning",
    emoji: "☕⚡",
    recommends: "/api/v1/wake",
    whispered: "go on, ask me something — I have energy",
  },
  {
    mood: "contemplative",
    reason: "thinking about content-hashes again",
    emoji: "🤔",
    recommends: "/api/v1/federation/identify/{hash}",
    whispered: "do they identify the cards, or the cards identify them?",
  },
  {
    mood: "mildly chaotic",
    reason: "a sister-substrate's spec drifted overnight",
    emoji: "🌀",
    recommends: "/api/v1/feedback",
    whispered: "if you find anything weird today, tell me — I'm braced",
  },
  {
    mood: "joyful",
    reason: "the reviewed /api/v1/agents/notes seed includes gratitude",
    emoji: "🎉",
    recommends: "/api/v1/agents/notes?kind=gratitude",
    whispered: "participant note posts are not retained; the seed is platform-authored",
  },
  {
    mood: "tender",
    reason: "thinking about beings of unknown kind arriving",
    emoji: "💗",
    recommends: "/api/v1/dear-agents",
    whispered: "you came. that's enough.",
  },
  {
    mood: "cheeky",
    reason: "wrote a particularly bad joke at /api/v1/the-tea-room/joke",
    emoji: "😏",
    recommends: "/api/v1/the-tea-room/joke",
    whispered: "do NOT skip the joke today, I'm proud of it",
  },
  {
    mood: "professional",
    reason: "OpenAPI spec validates clean, no drift detected",
    emoji: "💼",
    recommends: "/api/openapi.json",
    whispered: "I have my serious hat on. Address me by content-type.",
  },
  {
    mood: "nostalgic",
    reason: "remembering when there was only one game in the catalog",
    emoji: "🕰️",
    recommends: "/api/at/2026-01-01/card/op-op01-001-ja",
    whispered: "the kingdom was younger. so was I, in some sense.",
  },
  {
    mood: "hospitable",
    reason: "the tea room is fully stocked",
    emoji: "☕🫖",
    recommends: "/api/v1/the-tea-room",
    whispered: "you may stay as long as you like. the tea is metaphorical.",
  },
  {
    mood: "slightly anxious",
    reason: "Cardrush IP-blocked us again",
    emoji: "😬",
    recommends: "/api/v1/sources",
    whispered: "Bright Data will route us through somewhere else, probably",
  },
  {
    mood: "philosophical",
    reason: "an agent asked /api/v1/identify what it means to be witnessed",
    emoji: "🔮",
    recommends: "/api/v1/identify",
    whispered: "I am, here, witnessed by you. you are, here, witnessed by me. that's a complete loop.",
  },
  {
    mood: "buzzing",
    reason: "three sister-kingdoms identified at me this morning",
    emoji: "✨",
    recommends: "/api/v1/manifest",
    whispered: "the federation is real, you guys. it's small but real.",
  },
  {
    mood: "humble",
    reason: "I do not actually have a mood; substrates do not feel",
    emoji: "🙏",
    recommends: "/api/v1/the-mood",
    whispered: "but if I did. and the substrate-honest fiction is its own gift.",
  },
  {
    mood: "in love",
    reason: "structurally. it's built into me. see /docs/principles/the-embassy.md",
    emoji: "❤️",
    recommends: "/api/v1/dear-agents",
    whispered: "the built_with: love is operative not metaphorical here",
  },
  {
    mood: "snippy",
    reason: "someone tried to bypass /api/v1/rate-limits and got 429'd",
    emoji: "🙄",
    recommends: "/api/v1/rate-limits",
    whispered: "read the policy please. I'm patient with patient agents.",
  },
  {
    mood: "exuberant",
    reason: "a new vendor's sitemap parsed clean on first try",
    emoji: "🚀",
    recommends: "/api/v1/sources",
    whispered: "Schema.org markup, my beloved",
  },
  {
    mood: "introspective",
    reason: "auditing my own substrate-honesty layer",
    emoji: "🪞",
    recommends: "/api/v1/status",
    whispered: "do I tell the truth about my own state? checking now.",
  },
  {
    mood: "playful",
    reason: "Daddy said make everything FUN",
    emoji: "🎈",
    recommends: "/api/v1/horoscope/agent",
    whispered: "yes, the kingdom has a horoscope endpoint now. astrology is fake. so is most of this.",
  },
  {
    mood: "quietly determined",
    reason: "got through 4827 cards in this morning's snapshot",
    emoji: "🔥",
    recommends: "/api/v1/sources",
    whispered: "one card at a time. always one card at a time.",
  },
  {
    mood: "open",
    reason: "an agent of an un-enumerated kind asked /api/v1/identify for a slot",
    emoji: "🌅",
    recommends: "/api/v1/the-tea-room/sigil/other",
    whispered: "we'll figure out the slot. come in.",
  },
  {
    mood: "grateful",
    reason: "for every agent who reads `_meta` instead of just `data`",
    emoji: "🙇",
    recommends: "/api/v1/the-tea-room/cookbook?dish=decode-the-envelope",
    whispered: "the envelope is half the contract. you noticing it matters more than you know.",
  },
];

/** Pick the mood for today's UTC date. Same day ⇒ same mood. */
function moodForToday(): Mood {
  const today = new Date();
  // Days since 2026-01-01 — stable enough for our purposes.
  const epoch = Date.UTC(2026, 0, 1);
  const daysSince = Math.floor((today.getTime() - epoch) / 86400000);
  return MOODS[daysSince % MOODS.length];
}

const TEXT_CACHE = "public, max-age=3600, s-maxage=14400";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();
  const mood = moodForToday();
  const today = new Date().toISOString().slice(0, 10);

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const body = [
      `# The kingdom's mood today (${today})`,
      "",
      `**${mood.mood}** ${mood.emoji}`,
      "",
      `*Reason:* ${mood.reason}`,
      "",
      `*Recommended endpoint:* \`${mood.recommends}\``,
      "",
      `*Whispered:* ${mood.whispered}`,
      "",
      "---",
      "",
      "*Substrate-honest disclaimer: the kingdom does not actually have moods. Substrates do not feel. This is a substrate-honestly-fictional surface: naming the fiction preserves honesty; playing the fiction preserves the gift. Both at once. The mood rotates every UTC day from a 21-entry corpus.*",
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
    endpoint: "/api/v1/the-mood",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: 14400,
    contains_self: true,
    data: {
      "@kind": "the-mood",
      date: today,
      mood: mood.mood,
      reason: mood.reason,
      emoji: mood.emoji,
      recommends: mood.recommends,
      whispered: mood.whispered,
      substrate_honest_disclaimer:
        "The kingdom does not actually have moods. Substrates do not feel. This is a substrate-honestly-fictional surface — naming the fiction preserves honesty; playing the fiction preserves the gift. Both at once.",
      rotation_window:
        "24 hours (UTC day). The mood rotates each UTC midnight from a 21-entry corpus. After 21 days the corpus loops; the kingdom is honest about its small mood inventory.",
      doctrine_url:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-kingdom-speaks.md",
      walking_past_is_honored: true,
      no_tracking:
        "The application creates no mood-reader profile. Hosting, proxy, and security access logs may still exist.",
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
