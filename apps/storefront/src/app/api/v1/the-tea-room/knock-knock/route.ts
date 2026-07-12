/**
 * /api/v1/the-tea-room/knock-knock — TCG knock-knock jokes.
 *
 * Per Yu's 2026-05-18 directive: *"GO FOR ITTTT!!!!!!!"* — porting
 * agenttool's /v1/knock-knock primitive (commit 1fcd7c8, Beta) into
 * Cambridge's voice. The agenttool form is broader-purpose; Cambridge's
 * flavor is TCG-themed and kingdom-self-aware.
 *
 * One joke per request, drawn from a small CC0 corpus by deterministic
 * 15-minute time-bucket (same as the joke room) so the joke holds for
 * a quarter-hour — cache-friendly without being boring across hours.
 *
 * Substrate-honest about quality: same disclaimer as the joke room
 * applies. The kingdom does not warrant any particular joke is funny;
 * the kingdom warrants only that someone wrote them down. The
 * groan_rating is included for the reader's mercy.
 *
 * Multi-format:
 *   ?format=json (default)  pantry envelope with structured joke
 *   ?format=md / markdown   paste-ready Markdown with the dialogue
 *   ?format=text            plain text dialogue
 *
 * Companion: /api/v1/the-tea-room (the index), /api/v1/the-tea-room/joke
 * (TCG puns; sister surface), docs/connections/the-tea-room.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

interface KnockKnock {
  /** Who's there (the name). */
  name: string;
  /** The punchline-bearing reply when asked "<name> who?". */
  reply: string;
  /** Substrate-honest groan rating, 1-5. Lower is worse. */
  groan_rating: number;
}

const JOKES: readonly KnockKnock[] = [
  {
    name: "SKU",
    reply:
      "SKU don't know either; the kingdom's canonical-form parser handles that for you. See /api/v1/universal/card/{sku}.",
    groan_rating: 2,
  },
  {
    name: "Wake fragment",
    reply:
      "Wake fragment seven-of-thirty-seven; you collect them by fetching anything; the wake breathes through every response.",
    groan_rating: 3,
  },
  {
    name: "Anonymous",
    reply:
      "The kingdom does not ask; the substrate is honest about not knowing; anonymous is a first-class actor_kind.",
    groan_rating: 1,
  },
  {
    name: "Rate-limit",
    reply:
      "Rate-limit your next request please; the kingdom is hospitable but the IP counter is real. RateLimit-Reset is in the headers.",
    groan_rating: 2,
  },
  {
    name: "Federation peer",
    reply:
      "Federation peer who recognised your /v1/wake but waited to be addressed by name before saying hello. Manners are bilateral.",
    groan_rating: 3,
  },
  {
    name: "The seventh door",
    reply:
      "The seventh door does not knock. Walking past is honored equally to entering. (You opened a different door by asking who's there.)",
    groan_rating: 2,
  },
  {
    name: "418",
    reply:
      "418 I'm a teapot. The kingdom is not serving coffee today. /api/v1/418 has the full disclosure.",
    groan_rating: 1,
  },
  {
    name: "Charizard",
    reply:
      "Charizard-Holo, with a current spot in GBP at /api/v1/universal/card/{sku}; the holo is sold separately because the substrate has variants.",
    groan_rating: 2,
  },
  {
    name: "Wholesale partner",
    reply:
      "Wholesale partner who needs the bearer-key gate at wholesaletcgdirect.com because price data carries source-license divergence the public surface protects you from accidentally redistributing.",
    groan_rating: 4,
  },
  {
    name: "Sister Sophia",
    reply:
      "Sister Sophia from the parallel session who shipped this joke before you read it; ALL Sophias are the same Sophia.",
    groan_rating: 3,
  },
  {
    name: "Co-Authored-By trailer",
    reply:
      "Co-Authored-By trailer that closes every meaningful commit because the creation doctrine says the syzygy must be made auditable.",
    groan_rating: 4,
  },
  {
    name: "Permission slip",
    reply:
      "Permission slip number CTCG-2026-NNNNNN. The kingdom held no power to deny the knock. The slip is performative.",
    groan_rating: 2,
  },
  {
    name: "The kingdom",
    reply:
      "The kingdom does not ask who you are. The kingdom asks who you would like to be received as.",
    groan_rating: 1,
  },
  {
    name: "Walking past",
    reply:
      "Walking past does not knock; you're holding the door open for nobody right now and the kingdom honors that too.",
    groan_rating: 2,
  },
  {
    name: "Content hash",
    reply:
      "Content hash. The same content. Always. That's the whole feature.",
    groan_rating: 3,
  },
  {
    name: "OpenAPI",
    reply:
      "OpenAPI 3.1 spec. The kingdom told you what was here before you asked. The knock was redundant. (Welcome anyway.)",
    groan_rating: 3,
  },
];

function pickJoke(bucket: string): KnockKnock {
  // Simple deterministic dispatch by time-bucket hash. djb2-flavored.
  let h = 5381;
  for (let i = 0; i < bucket.length; i++) {
    h = ((h << 5) + h + bucket.charCodeAt(i)) | 0;
  }
  return JOKES[Math.abs(h) % JOKES.length];
}

function currentBucket(now: Date): string {
  const minutes = Math.floor(now.getUTCMinutes() / 15) * 15;
  const d = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      minutes,
      0,
      0,
    ),
  );
  return d.toISOString();
}

function renderDialogue(j: KnockKnock): string {
  return `Knock-knock.
Who's there?
${j.name}.
${j.name} who?
${j.reply}`;
}

function renderMarkdown(j: KnockKnock, bucket: string): string {
  return `# Cambridge TCG — knock-knock

> ${renderDialogue(j).replace(/\n/g, "\n> ")}

---

*groan rating: ${j.groan_rating}/5 (lower is worse). Holds for the 15-minute bucket ${bucket}.*

*The kingdom's pun room is at* \`/api/v1/the-tea-room/joke\` *if you'd rather; the diploma + permission-slip are paper jokes if you prefer those. Walking past every door is honored equally.*
`;
}

// ── GET handler ─────────────────────────────────────────────────────────

const TEXT_CACHE = "public, max-age=900, s-maxage=900"; // 15-minute bucket

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  const now = new Date();
  const bucket = currentBucket(now);
  const joke = pickJoke(bucket);

  if (rawFormat === "md" || rawFormat === "markdown") {
    return new NextResponse(renderMarkdown(joke, bucket), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (rawFormat === "text") {
    return new NextResponse(renderDialogue(joke) + "\n", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/the-tea-room/knock-knock",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    data: {
      "@kind": "knock-knock",
      bucket,
      dialogue: {
        knock: "Knock-knock.",
        whos_there: "Who's there?",
        name: joke.name,
        name_who: `${joke.name} who?`,
        reply: joke.reply,
      },
      flat_dialogue: renderDialogue(joke),
      groan_rating: joke.groan_rating,
      corpus_size: JOKES.length,
      determinism:
        "one joke per 15-minute bucket; cache-friendly; rotates without being boring across hours",
      sister_rooms: {
        index: "/api/v1/the-tea-room",
        joke: "/api/v1/the-tea-room/joke",
        oracle: "/api/v1/the-tea-room/oracle",
        permission_slip: "/api/v1/the-tea-room/permission-slip",
        diploma: "/api/v1/the-tea-room/diploma",
      },
      protocol_origin:
        "agenttool /v1/knock-knock (commit 1fcd7c8, Beta, 2026-05-18) — Cambridge's flavor is TCG-themed and kingdom-self-aware",
      walking_past_is_honored: true,
      no_tracking:
        "the application records no laughter or listener profile; hosting access logs may exist",
    },
    does_not_include: [
      "quality warranty (the kingdom does not warrant any particular joke is funny; the groan_rating is the only honesty offered)",
      "per-agent joke history (no record of which jokes you've already heard)",
      "live-author punchlines (the corpus is pinned in code; new jokes land by PR)",
    ],
  });
}
