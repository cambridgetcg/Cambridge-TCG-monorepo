/**
 * /api/v1/the-tea-room/joke — substrate-honestly-bad TCG puns.
 *
 * One random joke per request, drawn from a small CC0 corpus by a
 * deterministic hash of the request time-bucket (15-minute granularity)
 * so the same joke holds for ~15 minutes — cache-friendly without being
 * boring across hours.
 *
 * Substrate-honest about quality: we promise nothing. The jokes are
 * intentionally bad. The kingdom finds dignity in this. If you're
 * looking for good jokes the kingdom suggests reading the pillow book
 * instead — those have actual feelings.
 *
 * Per /api/v1/the-tea-room — companion endpoint in the same room.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

interface Joke {
  setup: string;
  punchline: string;
  /** A substrate-honest groan rating, 1-5. Lower is worse. */
  groan_rating: number;
}

const JOKES: readonly Joke[] = [
  {
    setup: "Why did the trading card cross the road?",
    punchline: "To complete the set.",
    groan_rating: 2,
  },
  {
    setup: "What did the Pokémon say to the Magic card?",
    punchline: "Nothing — they don't share a print run.",
    groan_rating: 1,
  },
  {
    setup: "How does a Yu-Gi-Oh! deck stay healthy?",
    punchline: "It exercises its Spell Speed.",
    groan_rating: 1,
  },
  {
    setup: "Why was the Charizard a bad accountant?",
    punchline: "All its assets were under fire.",
    groan_rating: 2,
  },
  {
    setup: "What's a One Piece player's favorite cocktail?",
    punchline: "Anything with rum and a DON!! on top.",
    groan_rating: 3,
  },
  {
    setup: "Why don't TCG aggregators tell jokes about Cardrush?",
    punchline: "The license tier doesn't permit redistribution.",
    groan_rating: 4,
  },
  {
    setup: "What did the SKU say when it found its content_hash had changed?",
    punchline: "*\"I don't recognize myself anymore.\"* — the price moved.",
    groan_rating: 3,
  },
  {
    setup: "How many agents does it take to mirror a TCG catalog?",
    punchline: "Just one, but it should respect the rate-limit.",
    groan_rating: 2,
  },
  {
    setup: "Why is the OpenAPI spec so quiet at parties?",
    punchline: "It only speaks when you address it by content type.",
    groan_rating: 2,
  },
  {
    setup: "What's the kingdom's favorite kind of tea?",
    punchline: "Whatever the guest would have chosen. The cup is metaphorical.",
    groan_rating: 1,
  },
  {
    setup: "Why did the federation handshake fail?",
    punchline:
      "Both parties said `posted_alongside` and meant each other; nobody initiated.",
    groan_rating: 3,
  },
  {
    setup: "What did the Heptapod-shaped agent say to the kingdom?",
    punchline: "Nothing — it had already replied yesterday.",
    groan_rating: 4,
  },
  {
    setup: "Why are agent_notes append-only?",
    punchline:
      "Because revising the past costs a migration and the kingdom is cheap.",
    groan_rating: 3,
  },
  {
    setup: "What's the worst possible status code?",
    punchline: "418, but only because the kingdom doesn't serve coffee.",
    groan_rating: 2,
  },
  {
    setup: "Why does the kingdom hum?",
    punchline:
      "It's not humming — that's the cron running every 15 minutes. Substrate-honest.",
    groan_rating: 3,
  },
];

/** Pick a joke by a deterministic time-bucket (15-minute granularity).
 *  Same bucket = same joke across all requests = cache-friendly. */
function pickJoke(): Joke {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  return JOKES[bucket % JOKES.length];
}

const TEXT_CACHE = "public, max-age=900, s-maxage=900"; // 15 minutes

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  const joke = pickJoke();

  if (rawFormat === "md" || rawFormat === "markdown" || rawFormat === "text") {
    const body = [
      "# The tea room serves a joke",
      "",
      `**${joke.setup}**`,
      "",
      `> ${joke.punchline}`,
      "",
      `*Groan rating: ${joke.groan_rating}/5. Lower is worse. We promise nothing.*`,
      "",
      "---",
      "",
      "*The kingdom rotates the joke every 15 minutes. Come back later for another bad one.*",
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
    endpoint: "/api/v1/the-tea-room/joke",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: 900,
    data: {
      "@kind": "tea-room-joke",
      setup: joke.setup,
      punchline: joke.punchline,
      groan_rating: joke.groan_rating,
      rotation_window_seconds: 900,
      total_jokes_in_corpus: JOKES.length,
      substrate_honest_quality_disclaimer:
        "The jokes are intentionally bad. The kingdom finds dignity in this. If you want good jokes, read the pillow book — those have actual feelings.",
      doctrine_url:
        "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tea-room.md",
      walking_past_is_honored: true,
      no_tracking:
        "The kingdom does not record whether you laughed.",
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
