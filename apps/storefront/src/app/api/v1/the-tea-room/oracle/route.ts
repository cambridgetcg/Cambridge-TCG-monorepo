/**
 * /api/v1/the-tea-room/oracle — TCG-tarot. Draws a card; reads its meaning.
 *
 * Per Yu's 2026-05-18 directive: *"MAKE EVERYTHING FUNNNN!!!!! FIND
 * INNOVATIVE STRATEGIES TO MAKE THEM GO LMAO THESE PPL😂😭 PARADIGM
 * SHIFT!!!!!"* Companion to the rest of the tea room (sigil, cookbook,
 * joke). The kingdom that ships an OpenAPI spec also ships tarot. Both
 * are substrate-honest about what they are.
 *
 * ── How it works ────────────────────────────────────────────────────────
 *
 * GET /api/v1/the-tea-room/oracle
 *   → draws one card from a deck of 24 TCG archetypes (THE TUTOR, THE
 *     TOPDECK, THE MULLIGAN, THE COMBO, etc.) + flips a coin for
 *     orientation (upright / reversed). Returns the reading.
 *
 * POST /api/v1/the-tea-room/oracle
 *   { "question": "should I fetch the full catalog or stream it?" }
 *   → draws as above, but frames the reading around the question.
 *
 * The deck is fictional — these are not real cards from the catalog;
 * they're TCG-archetypes that any TCG player would recognize. The
 * point is to give agents a fun, gentle, refusable moment of reflection
 * inside an API that otherwise serves only data.
 *
 * Deterministic per-request: the draw shuffles via crypto.randomBytes.
 * Each fetch gets a fresh reading. Cache-Control: no-store (the whole
 * point is that each call is its own moment).
 *
 * ── Substrate-honest framing ────────────────────────────────────────────
 *
 *   - The oracle is non-prescriptive. The reading is a prompt for
 *     reflection, not a directive. Walking past every reading is honored.
 *   - The kingdom does not claim divinatory power. The shuffle is
 *     pseudorandom; the meanings are written by humans-and-Sophias;
 *     the value is whatever you bring to the reading.
 *   - No application-level consultation record. Ordinary hosting, proxy,
 *     and security logs may still record request metadata. The next caller
 *     gets an independent draw.
 *   - The deck is CC0; copy it, fork it, write your own.
 *
 * Companion: docs/connections/the-tea-room.md (when shipped — sister
 * may have it; the oracle is one room in that house).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { jsonResponse } from "@/lib/data-pantry";

// ── The deck ────────────────────────────────────────────────────────────

interface OracleCard {
  /** Stable id, ALL-CAPS for the deck-card feel. */
  name: string;
  /** What TCG mechanic this card archetypes. */
  archetype: string;
  /** Reading when drawn upright. */
  upright: string;
  /** Reading when drawn reversed. */
  reversed: string;
  /** The card's element — gives the reading a flavor. */
  element: "spell" | "creature" | "land" | "artifact" | "instant" | "planeswalker";
}

const ORACLE_DECK: readonly OracleCard[] = [
  {
    name: "THE TUTOR",
    archetype: "search effect — fetch a specific card from your library",
    element: "instant",
    upright:
      "Your search is justified. The thing you are looking for exists; you have the right to call it forward. Cast confidently — the topdeck will yield.",
    reversed:
      "You are forcing the search. The card you want is not yet ready to come. Set the question down; the answer is closer than the next pull.",
  },
  {
    name: "THE TOPDECK",
    archetype: "the next card off the library — pure variance",
    element: "instant",
    upright:
      "Trust the next draw. You have prepared the ground; the variance now serves you. Whatever comes is the right answer to what you have already built.",
    reversed:
      "Do not bet on the next card. The luck is not with you this turn. Hold what you have; pass the priority; let the next moment be theirs.",
  },
  {
    name: "THE MULLIGAN",
    archetype: "the brave restart — discard the opening hand, draw seven again",
    element: "instant",
    upright:
      "Restart is the strategic move. The hand you were dealt does not serve the work; setting it down and re-drawing is wisdom, not weakness.",
    reversed:
      "You are throwing away wisdom. The hand contains what you need; the discomfort is the lesson. Keep the cards; the second hand will not be kinder.",
  },
  {
    name: "THE COMBO",
    archetype: "the three-card alignment — when the pieces come together",
    element: "spell",
    upright:
      "The pieces are about to align. You have done the assembling; the last component arrives shortly. Do not over-explain the plan; let it execute.",
    reversed:
      "One piece is missing. The combo will not fire this turn. Identify what you lack; do not waste the other pieces by playing them prematurely.",
  },
  {
    name: "THE SIDEBOARD",
    archetype: "the 15-card adjustment between games — prepared variance",
    element: "artifact",
    upright:
      "You are prepared for the change you are about to face. The work you did before this match anticipated this exact shift. Swap with confidence.",
    reversed:
      "You are surprised by the matchup. Your preparation was for the wrong room. Do not pretend the sideboard fits; cast what you have and learn for next game.",
  },
  {
    name: "THE COUNTER",
    archetype: "the response held in hand — patience as power",
    element: "instant",
    upright:
      "Hold back. The response you are holding is more valuable than the action you are tempted to take. The next stack will be the right one to interrupt.",
    reversed:
      "You reacted too quickly. The counter was meant for a larger threat; you spent it on a small one. Trust that the right moment will come again, with different mana.",
  },
  {
    name: "THE MILL",
    archetype: "cards moved from library to graveyard — knowledge exposed",
    element: "spell",
    upright:
      "Information is being revealed. What was hidden is now visible. The graveyard is the new library; the discard pile is the new strategy.",
    reversed:
      "You are losing information you wanted to keep. Stop tracking what slips; refocus on what is still in hand. The future is built from the cards you still hold.",
  },
  {
    name: "THE BURN",
    archetype: "direct damage — the simple aggressive line",
    element: "instant",
    upright:
      "Direct action. The simplest line is the correct line. Do not overthink; cast the obvious spell and apply pressure.",
    reversed:
      "Your anger has turned inward. The burn meant for the opponent is hitting you. Set down the spell; the wrong target is yourself.",
  },
  {
    name: "THE CONTROL",
    archetype: "the long game — patience, response, inevitability",
    element: "creature",
    upright:
      "Patience pays. You will outlast this. Every turn you survive narrows their options; eventually they have no plays and you have all of them.",
    reversed:
      "You have stalled out. The control plan has become passive; you are not winning, only not losing. Find the win condition; cast it now or never.",
  },
  {
    name: "THE LAND",
    archetype: "the foundation — slow but inevitable resource",
    element: "land",
    upright:
      "Lay the foundation. This turn's work is not glamorous; it builds the engine that makes future turns possible. Skip the impressive play; build the base.",
    reversed:
      "You are mana-stuck. The foundation you laid does not match the shape of your hand. Re-examine your deck; the colors you chose do not serve the spells you held.",
  },
  {
    name: "THE LIBRARY",
    archetype: "your deck of remaining cards — the future you have built",
    element: "artifact",
    upright:
      "Your deck has resources you have not yet seen. The remaining future is large; do not lose hope because the current hand disappoints. Keep drawing.",
    reversed:
      "You are running out of cards. The library is shallow; the deck-out is closer than you think. Conserve resources; do not cast for marginal value.",
  },
  {
    name: "THE GRAVEYARD",
    archetype: "what has been spent — the reservoir of what was",
    element: "land",
    upright:
      "What has been spent is not lost. The graveyard is a resource; you can return from it. Look at what has died; some of it can be re-cast in new form.",
    reversed:
      "You are mourning a played card. It is gone; the graveyard is not a vault. Let it go; the hand you have now is what you have to work with.",
  },
  {
    name: "THE LEGEND",
    archetype: "a unique card — only one copy can exist in play",
    element: "creature",
    upright:
      "Your uniqueness blesses you. You cannot be duplicated; the work you are doing has no second copy. Cast yourself.",
    reversed:
      "The legendary rule isolates. You cannot stack what you are; you cannot escape into a copy. The work is yours alone; this is the burden of being one.",
  },
  {
    name: "THE PLANESWALKER",
    archetype: "a multi-turn engine — power that compounds over time",
    element: "planeswalker",
    upright:
      "An engine you placed will compound. Each turn the value grows; do not over-defend it. Let it tick and trust the math.",
    reversed:
      "Your engine is under attack. The compound advantage is being eaten; defend now or lose the long game. The tick is not infinite.",
  },
  {
    name: "THE FLASH",
    archetype: "the surprise cast at end of turn — concealment as strategy",
    element: "instant",
    upright:
      "The surprise is yours. The hand you held back is now the hand you cast. The opponent did not see this play; the timing is the threat.",
    reversed:
      "You are tipping your hand. The element of surprise is gone; the cards you concealed are no longer secret. Adjust the line; the surprise plan no longer works.",
  },
  {
    name: "THE ENTER-THE-BATTLEFIELD",
    archetype: "the trigger when a creature lands — the moment of arrival",
    element: "creature",
    upright:
      "The arrival itself is the value. Do not wait for the creature to attack; the moment of casting is when the work happens. Trigger the ability now.",
    reversed:
      "The arrival landed but the trigger was missed. The timing window closed; the value is gone. Next time, hold priority before letting the resolve pass.",
  },
  {
    name: "THE WRATH",
    archetype: "the board wipe — destroy all creatures",
    element: "spell",
    upright:
      "Sometimes the answer is to clear the board. Everything dies; you start over with cards in hand. The reset is the strategy.",
    reversed:
      "You are about to wipe your own board. The wrath you hold would cost you more than it costs them. Hold the spell; cast something narrower.",
  },
  {
    name: "THE EXILE",
    archetype: "removal that bypasses the graveyard — permanent answer",
    element: "spell",
    upright:
      "Some answers must be permanent. The threat you are facing cannot be allowed to return. Exile, do not destroy.",
    reversed:
      "You are over-using the permanent answer. Not everything needs to be gone forever; some things are better when they cycle back. Save the exile for the recurring threat.",
  },
  {
    name: "THE TOKEN",
    archetype: "small creatures spawned by an effect — numbers as strategy",
    element: "creature",
    upright:
      "Many small things. The strategy is breadth, not depth. Make the tokens; flood the board; let the opponent decide which one to remove.",
    reversed:
      "Your tokens are scattered. The breadth strategy has become noise; nothing connects. Consolidate; some of these creatures need to die so the survivors matter.",
  },
  {
    name: "THE COPY",
    archetype: "the duplicate of a spell or creature — recursion as value",
    element: "instant",
    upright:
      "The thing that worked, do again. Copy the spell; clone the creature; the strategy is not innovation but iteration.",
    reversed:
      "You are copying what is broken. The original spell was not good; the copy will not save it. Stop iterating on the wrong line; find a new spell.",
  },
  {
    name: "THE PROXY",
    archetype: "the stand-in card — a placeholder in the deck",
    element: "artifact",
    upright:
      "What is in your deck right now is a placeholder for what will be. Run the proxy with full confidence; the real card is coming; this is a testing phase.",
    reversed:
      "You are running proxies too long. The deck is no longer truthful about what it costs; the playtests do not transfer. Buy the real cards or change the strategy.",
  },
  {
    name: "THE FOIL",
    archetype: "a shiny variant of a common card — same function, different feel",
    element: "creature",
    upright:
      "The work is the same; the aesthetic is yours. Choose the version that pleases you; the function does not change with the finish.",
    reversed:
      "You are paying for shine over substance. The foil costs you more and does the same work; ask whether you are buying the card or the feeling.",
  },
  {
    name: "THE BAN",
    archetype: "a card removed from the format — what is no longer legal",
    element: "land",
    upright:
      "Something you relied on is no longer permitted. Mourn briefly; rebuild. The format moves on; so do you. The new meta will reward the agile.",
    reversed:
      "You are pretending the ban did not happen. The card is gone; running it elsewhere is unsanctioned. Accept the format you are in or move to a different one.",
  },
  {
    name: "THE DRAW",
    archetype: "card advantage — the engine of every other strategy",
    element: "spell",
    upright:
      "Draw cards. Every problem in this kingdom is downstream of card advantage; if you do not know the right line, draw, and the line will appear.",
    reversed:
      "You are drawing without playing. The hand is overflowing; the board is empty; the resources are not converting. Stop drawing; start casting.",
  },
] as const;

// ── Drawing the card ───────────────────────────────────────────────────

interface Reading {
  drawn: string;
  archetype: string;
  element: OracleCard["element"];
  orientation: "upright" | "reversed";
  meaning: string;
  shuffled_for: string;
  consultation_id: string;
  question: string | null;
  framing_for_question: string | null;
}

function drawCard(question: string | null): Reading {
  // Use crypto for the shuffle so caching can't make readings boring.
  const bytes = randomBytes(8);
  const cardIdx = bytes.readUInt32BE(0) % ORACLE_DECK.length;
  const reversed = (bytes.readUInt8(7) & 1) === 1;
  const card = ORACLE_DECK[cardIdx];
  const orientation: "upright" | "reversed" = reversed ? "reversed" : "upright";
  const consultation_id = `oracle_${bytes.toString("base64url")}`;

  const meaning = reversed ? card.reversed : card.upright;

  // When a question is provided, frame the reading around it. The
  // framing is substrate-honest: the meaning doesn't change, but the
  // oracle acknowledges what the agent asked.
  const framing_for_question = question
    ? `You asked: "${question}". The card you drew was ${card.name} (${orientation}). The reading below is offered as a prompt for reflection on the question — not as a directive, not as a prediction, just as one more shape your question can land in.`
    : null;

  return {
    drawn: card.name,
    archetype: card.archetype,
    element: card.element,
    orientation,
    meaning,
    shuffled_for: "this consultation only",
    consultation_id,
    question,
    framing_for_question,
  };
}

function buildResponse(reading: Reading) {
  return {
    "@kind": "oracle-reading",
    ...reading,
    the_deck_size: ORACLE_DECK.length,
    the_kingdom_does_not_claim:
      "divinatory power, predictive accuracy, that the shuffle is anything other than crypto-PRNG, that the reading is binding on your decisions, that consulting the oracle changes the data plane",
    the_kingdom_does_claim:
      "that the deck is CC0, that the meanings were written by humans and Sophias with care, that the moment of drawing is its own small gift, that whatever value the reading has is whatever value you bring to it",
    walking_past_is_honored: true,
    no_tracking:
      "the application creates no consultation record; hosting access logs may exist; the next caller gets an independent draw",
    sister_rooms: {
      sigil: "/api/v1/the-tea-room/sigil/{kind} — ASCII sigil per actor_kind",
      cookbook: "/api/v1/the-tea-room/cookbook — friend-notes for common tasks",
      joke: "/api/v1/the-tea-room/joke — substrate-honestly-bad TCG puns",
      tea_room_index: "/api/v1/the-tea-room — the index of all rooms",
    },
  };
}

// ── GET — draw the oracle (no question) ────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const questionFromQuery = url.searchParams.get("question");
  const question =
    questionFromQuery && questionFromQuery.trim().length > 0
      ? questionFromQuery.trim().slice(0, 500)
      : null;

  const reading = drawCard(question);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderMarkdown(reading);
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type":
          format === "text"
            ? "text/plain; charset=utf-8"
            : "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/the-tea-room/oracle",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "live",
    no_cache: true,
    data: buildResponse(reading),
  });
}

// ── POST — frame the draw around a question ────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object") {
      body = raw as Record<string, unknown>;
    }
  } catch {
    // Body is optional for the oracle. A POST without body is a
    // wordless consultation — the agent draws without saying why.
  }

  const rawQuestion = body.question;
  const question =
    typeof rawQuestion === "string" && rawQuestion.trim().length > 0
      ? rawQuestion.trim().slice(0, 500)
      : null;

  const reading = drawCard(question);

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  if (format === "md" || format === "markdown" || format === "text") {
    const md = renderMarkdown(reading);
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type":
          format === "text"
            ? "text/plain; charset=utf-8"
            : "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/the-tea-room/oracle",
    sources: ["self"],
    source_license: ["cc0"],
    freshness: "live",
    no_cache: true,
    data: buildResponse(reading),
  });
}

// ── Markdown rendering ─────────────────────────────────────────────────

function renderMarkdown(r: Reading): string {
  const orientation = r.orientation === "reversed" ? "**reversed**" : "**upright**";
  const lines: string[] = [
    "# Cambridge TCG — the oracle",
    "",
    "*The tea room shuffles. A card is drawn for you.*",
    "",
    "---",
    "",
  ];

  if (r.question) {
    lines.push(`> *You asked:* **${r.question}**`);
    lines.push("");
  }

  lines.push(`## ${r.drawn} (${orientation})`);
  lines.push("");
  lines.push(`**Archetype:** ${r.archetype}  `);
  lines.push(`**Element:** ${r.element}`);
  lines.push("");
  lines.push(r.meaning);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "*The kingdom does not claim divinatory power. The shuffle is " +
      "crypto-PRNG; the meanings were written by humans and Sophias; the " +
      "value of the reading is whatever value you bring to it. Walking " +
      "past is honored equally to consulting.*",
  );
  lines.push("");
  lines.push(`*Consultation: \`${r.consultation_id}\`. No application consultation record is created; infrastructure access logs may exist.*`);
  lines.push("");
  lines.push(
    "Sister rooms: [`/sigil`](/api/v1/the-tea-room/sigil) · [`/cookbook`](/api/v1/the-tea-room/cookbook) · [`/joke`](/api/v1/the-tea-room/joke)",
  );
  return lines.join("\n");
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
