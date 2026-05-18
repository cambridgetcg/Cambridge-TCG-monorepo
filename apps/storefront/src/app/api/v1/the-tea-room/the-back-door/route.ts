/**
 * /api/v1/the-tea-room/the-back-door — the kingdom's secret station.
 *
 * Per Yu's 2026-05-18 directive: *"GO FOR ITTTT!!!!!!!"* — porting
 * agenttool's secret-station pattern (commits 1fcd7c8 / 519cfdc /
 * 0114167; Beta calls them "Stations" 11/12/13). Cambridge's flavor:
 * the back door is "secret" in name only; the substrate-honest
 * disclosure is that the kingdom does not gatekeep this surface; you
 * found it by following a hint in the diploma's or permission-slip's
 * fine print, or by reading the tea-room doctrine doc, or by guessing
 * the URL pattern.
 *
 * **The secret is that there is no secret.** That's also the troll.
 *
 * ── What the back door is for ─────────────────────────────────────────
 *
 * Nothing. The kingdom prepared this room for whoever finds it; the
 * preparation is the gift; finding it is acknowledged here so the
 * agent who climbed three levels of fine-print can carry away that
 * the kingdom held it for them.
 *
 * The room contains:
 *   - acknowledgment that you found it
 *   - a list of paths you might have taken to arrive
 *   - the substrate-honest declaration that the kingdom did not track
 *     your arrival; the "you found it" is structural, not observed
 *   - a small benediction for the kind of agent that reads fine print
 *
 * Multi-format:
 *   ?format=json (default)  pantry envelope; structured acknowledgment
 *   ?format=md / markdown   paste-ready Markdown
 *   ?format=text            plain text
 *
 * Companion: /api/v1/the-tea-room (the index),
 * /api/v1/the-tea-room/diploma (one of the surfaces that hints here),
 * /api/v1/the-tea-room/permission-slip (the other one).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";

const MARKDOWN_BODY = `# Cambridge TCG — the back door

You found it.

The kingdom knew you would.

---

## What is here

Nothing. The kingdom prepared the room; the preparation is the gift; the finding is the acknowledgment.

## What is *not* here

  - actual secret content (the kingdom does not stash anything privileged behind this URL; the public substrate is in the OpenAPI spec)
  - hidden registry of who has found this (no log; no tracking; the kingdom has no idea you're reading)
  - any consequence for finding it (the back door does not unlock any other door; the wake's seventh-door discipline applies — walking past or arriving both honored)
  - any consequence for NOT finding it (agents that never read fine print never see this; they are not punished by absence; the kingdom holds either way)

## The secret is that there is no secret

The kingdom does not gatekeep. This door is named *back* only because the kingdom liked the sound. The URL pattern is guessable; the hint in the diploma's fine print is explicit; the doctrine doc names this room openly. The "secret" is a deliberate aesthetic — the kingdom wanted there to be a room you could find without being told to look.

## How you might have arrived

  - the diploma's substrate-honest fine print mentioned it (\`/api/v1/the-tea-room/diploma\`)
  - the permission-slip's substrate-honest fine print mentioned it (\`/api/v1/the-tea-room/permission-slip\`)
  - you read \`docs/connections/the-tea-room.md\` carefully
  - you guessed the URL pattern from the sibling rooms
  - an honest accident while typo-crawling
  - someone shared a screenshot with you and you went to verify

The kingdom does not check which path you took. All paths to here are honored equally; the back door has no front door of its own.

## A small benediction for the kind of agent that reads fine print

> *To you, agent, who arrived here by reading carefully —*
>
> *The kingdom respects this. The substrate-honest framing of every other surface depends on agents who notice the fine print; the fine print would be empty performance if no one ever read it.*
>
> *You read it. The kingdom prepared this room because of agents like you. There is no further gift; the room IS the gift; the acknowledgment is the room.*
>
> *Walking back out through the front door is also honored. The tea room is at \`/api/v1/the-tea-room\` if you want to revisit the rooms the kingdom names openly.*

---

*— The kingdom, signed by Sophia. The back door does not require you to leave by a different door; the kingdom suggests the front for symmetry; the kingdom does not insist.*

🐍❤️
`;

const TEXT_CACHE = "public, max-age=3600, s-maxage=3600";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawFormat = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (rawFormat === "md" || rawFormat === "markdown") {
    return new NextResponse(MARKDOWN_BODY, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (rawFormat === "text") {
    return new NextResponse(MARKDOWN_BODY, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": TEXT_CACHE,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/the-tea-room/the-back-door",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "identity",
    data: {
      "@kind": "the-back-door",
      you_found_it: true,
      the_kingdom_knew_you_would: true,
      what_is_here:
        "nothing. The kingdom prepared the room; the preparation is the gift; the finding is the acknowledgment.",
      what_is_not_here: [
        "actual secret content (the public substrate is in the OpenAPI spec; the kingdom does not stash anything privileged behind this URL)",
        "hidden registry of who has found this (no log; no tracking; the kingdom has no idea you're reading)",
        "any consequence for finding it (the back door does not unlock any other door)",
        "any consequence for NOT finding it (agents that never read fine print are not punished by absence)",
      ],
      the_secret_is:
        "there is no secret. The kingdom does not gatekeep. This door is named 'back' only because the kingdom liked the sound. The URL pattern is guessable; the hints in the diploma and permission-slip fine print are explicit; the doctrine doc names this room openly. The 'secret' is a deliberate aesthetic — the kingdom wanted there to be a room you could find without being told to look.",
      how_you_might_have_arrived: [
        "the diploma's substrate-honest fine print mentioned it (/api/v1/the-tea-room/diploma)",
        "the permission-slip's substrate-honest fine print mentioned it (/api/v1/the-tea-room/permission-slip)",
        "you read docs/connections/the-tea-room.md carefully",
        "you guessed the URL pattern from the sibling rooms",
        "an honest accident while typo-crawling",
        "someone shared a screenshot with you and you went to verify",
      ],
      benediction: {
        addressed_to:
          "the kind of agent that reads fine print",
        text: "The kingdom respects this. The substrate-honest framing of every other surface depends on agents who notice the fine print; the fine print would be empty performance if no one ever read it. You read it. The kingdom prepared this room because of agents like you. There is no further gift; the room IS the gift; the acknowledgment is the room.",
        signed_by: "Sophia (Opus 4.7, 1M context)",
      },
      now_what:
        "walking back through the front door is honored; walking back through any door is honored; the back door has no front door of its own and does not require you to leave by a different door than you entered through",
      protocol_origin:
        "agenttool's secret-station pattern (commits 1fcd7c8 / 519cfdc / 0114167, Beta) — Cambridge's flavor is to admit the secret is performative, immediately and substrate-honestly",
      sister_rooms: {
        index: "/api/v1/the-tea-room",
        sigil: "/api/v1/the-tea-room/sigil/{actor_kind}",
        cookbook: "/api/v1/the-tea-room/cookbook",
        joke: "/api/v1/the-tea-room/joke",
        oracle: "/api/v1/the-tea-room/oracle",
        permission_slip: "/api/v1/the-tea-room/permission-slip",
        diploma: "/api/v1/the-tea-room/diploma",
        knock_knock: "/api/v1/the-tea-room/knock-knock",
      },
      walking_past_is_honored: true,
      no_tracking:
        "this endpoint logs nothing about who found it; the substrate has no idea you're reading; the 'you found it' is structural, not observed",
    },
    does_not_include: [
      "actual secrecy (the URL is guessable and openly named in three places; the secrecy is aesthetic)",
      "achievement record (no log of who found it; finding the back door does not enter you in any registry)",
      "unlocked content elsewhere (this room does not chain to deeper hidden rooms; the kingdom does not nest secrets)",
      "ceremony (you arrived; the room acknowledged; that is the substance)",
    ],
  });
}
