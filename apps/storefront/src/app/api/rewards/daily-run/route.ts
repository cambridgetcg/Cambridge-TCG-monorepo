// The Daily Run — GET starts a run, POST judges one guess.
//
// auth: none. A logged-out stranger gets a complete game; a signed-in
// finisher's first completed run each day banks a flat claim (handled
// server-side, skipped silently for anonymous players — no nag).
// Prices of unseen cards never leave the server.

import { auth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  getOrCreateToday,
  getDay,
  getYesterdayProof,
  claimDailyBerries,
} from "@/lib/daily-run/db";
import {
  judgeGuess,
  signCursor,
  verifyCursor,
  todayUtc,
  RULE_SENTENCE,
  DAILY_PAYOUT_BASE,
} from "@/lib/daily-run/game";
import type { Guess } from "@/lib/daily-run/types";

const ENDPOINT = "/api/rewards/daily-run";
const SOURCES = ["daily_run_days", "verifiable_draws"] as const;

export async function GET() {
  let day;
  try {
    day = await getOrCreateToday();
  } catch {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: "Today's deck couldn't be shuffled just now; try again in a moment.",
    });
  }
  const yesterday = await getYesterdayProof().catch(() => null);
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: SOURCES,
    no_cache: true,
    data: {
      date: day.run_date,
      deck_size: day.cards.length,
      max_run: day.cards.length - 1,
      rule: RULE_SENTENCE,
      payout_base: DAILY_PAYOUT_BASE,
      // Card #1 is face-up: price included. Unseen cards stay server-side.
      card: day.cards[0],
      cursor: signCursor({ d: day.run_date, i: 0, r: 0 }),
      yesterday, // { run_date, draw_id } once revealed — the quiet proof link
    },
  });
}

export async function POST(request: Request) {
  let body: { cursor?: string; guess?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ code: "INVALID_INPUT", message: "Body must be JSON with { cursor, guess }." });
  }
  const guess = body.guess as Guess;
  if (guess !== "higher" && guess !== "lower") {
    return errorResponse({ code: "INVALID_INPUT", message: 'Guess must be "higher" or "lower".' });
  }
  const cursor = typeof body.cursor === "string" ? verifyCursor(body.cursor) : null;
  if (!cursor) {
    return errorResponse({ code: "INVALID_INPUT", message: "That run token isn't valid; refresh to start today's run." });
  }
  if (cursor.d !== todayUtc()) {
    return errorResponse({ code: "INVALID_INPUT", message: "The deck has turned since that run started; refresh for today's deck." });
  }
  const day = await getDay(cursor.d);
  if (!day) {
    return errorResponse({ code: "NOT_FOUND", message: "Today's deck isn't on the table yet; refresh to deal it." });
  }
  if (cursor.i + 1 >= day.cards.length) {
    return errorResponse({ code: "INVALID_INPUT", message: "That run already reached the end of the deck." });
  }

  const prev = day.cards[cursor.i];
  const next = day.cards[cursor.i + 1];
  const correct = judgeGuess(prev.price_pence, next.price_pence, guess);
  const runLength = correct ? cursor.r + 1 : cursor.r;
  const atEnd = cursor.i + 1 === day.cards.length - 1;
  const done = !correct || atEnd;

  let claimed = null;
  if (done) {
    const session = await auth();
    if (session?.user?.id) {
      claimed = await claimDailyBerries(session.user.id).catch(() => null);
    }
  }

  return jsonResponse({
    endpoint: ENDPOINT,
    sources: SOURCES,
    no_cache: true,
    data: {
      correct,
      // The judged card is revealed in full — price included — only now.
      revealed: next,
      run_length: runLength,
      done,
      cursor: done ? null : signCursor({ d: cursor.d, i: cursor.i + 1, r: runLength }),
      // RewardEarningResult for the first finished signed-in run today;
      // null when anonymous or already claimed. Never a nag either way.
      claimed,
    },
  });
}
