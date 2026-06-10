// Daily Run game core — pure functions, no database, no network.
//
// This module exists so a stranger's first thirty seconds on the site are a
// finishable game played on real cards: guess whether the next card costs
// more or less. Everything here is deterministic and auditable; the audit
// script (apps/admin/scripts/daily-run.ts, run inside `pnpm verify`)
// exercises these functions directly — the storefront has no test runner,
// and a co-located test file nothing executes would be a lying artifact.

import crypto from "crypto";
import type { Guess, RunCursor } from "./types";

/** Flat Berries banked by a signed-in finisher, once per UTC day, BEFORE
 *  tier and streak multipliers. Flat on purpose: run length is for pride,
 *  Berries are for showing up — scaling pay to performance turns a toy
 *  into a grind, and flatness is also what makes cursor replay worthless.
 *  The page renders its payout sentence from this constant so the page
 *  cannot claim what the code does not pay. */
export const DAILY_PAYOUT_BASE = 25;

/** Deck geometry. 20 cards caps a perfect run at 19 guesses — the page
 *  says so in plain words. */
export const DECK_SIZE = 20;
export const POOL_SIZE = 30;
export const NUM_SLOTS = 60;

/** The one rule sentence the page renders verbatim. */
export const RULE_SENTENCE = `Finish one run a day while signed in and bank ${DAILY_PAYOUT_BASE} Berries, times your tier and streak. The game is whole without signing in.`;

/** Ties count in the player's favour — the judge is a literal price
 *  comparison with no house edge hiding in equality. */
export function judgeGuess(prevPence: number, nextPence: number, guess: Guess): boolean {
  if (nextPence === prevPence) return true;
  return guess === "higher" ? nextPence > prevPence : nextPence < prevPence;
}

/** Derive the day's deck from the committed draw's raw slot picks: the
 *  first DECK_SIZE distinct SKUs, in pick order. If sixty slots somehow
 *  yield fewer distinct cards, the remaining pool tops up in sorted order
 *  (deterministic, and the audit replays this exact rule). Each raw slot
 *  stays independently verifiable at /verify/draw/[id]. */
export function deriveDeck(slotPicks: string[], poolSorted: string[], deckSize: number = DECK_SIZE): string[] {
  const deck: string[] = [];
  const seen = new Set<string>();
  for (const sku of slotPicks) {
    if (seen.has(sku)) continue;
    seen.add(sku);
    deck.push(sku);
    if (deck.length === deckSize) return deck;
  }
  for (const sku of poolSorted) {
    if (seen.has(sku)) continue;
    seen.add(sku);
    deck.push(sku);
    if (deck.length === deckSize) break;
  }
  return deck;
}

// ── Stateless run cursor ──
// The server keeps no per-run state; the player's position travels as an
// HMAC-signed token. Honest caveat, stated in the README too: cursors are
// replayable — a player can save one and resubmit the opposite guess.
// Accepted, because the payout is flat and the personal best is local:
// cheating gains nothing of value and only spoils your own toy.

function cursorSecret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("daily-run: AUTH_SECRET not configured");
  return `daily-run:${s}`;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", cursorSecret()).update(payload).digest("base64url");
}

export function signCursor(c: RunCursor): string {
  const payload = Buffer.from(JSON.stringify(c)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyCursor(token: string): RunCursor | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as RunCursor;
    if (typeof c.d !== "string" || typeof c.i !== "number" || typeof c.r !== "number") return null;
    return c;
  } catch {
    return null;
  }
}

/** Today's run date (UTC). The deck turns at midnight UTC; the page says
 *  so rather than pretending to know the visitor's midnight. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
