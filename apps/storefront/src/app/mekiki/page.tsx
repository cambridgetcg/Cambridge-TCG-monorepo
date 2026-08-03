/**
 * /mekiki — 目利き, The Trained Eye. A daily looking game.
 *
 * The guides teach what to look for (/guides/condition — print lines,
 * centering, the honest edge) and the gallery hangs the art worth looking
 * at. This room asks for the older skill under both: recognition. One card
 * a day, drawn from the shop's own shelves, shown too close to name. Guess,
 * and every miss steps the view back; the reveal is the full picture.
 *
 * House vows kept: free, no prizes, no account, no streaks, nothing
 * recorded — the game forgets you the moment you leave. The card art is
 * the only saturated colour; the chrome is the quiet room. The picture is
 * the same reference photograph the market shelf uses; where the
 * publisher's own sample art is published, that hangs instead, carrying
 * its credit line (same official-first order as /market, via
 * getCardIdentity).
 *
 * Determinism: everything the visitor sees is seeded from the UTC date —
 * same day, same card, same crop, same choice order, for everyone. No
 * randomness at render time, so server and client always agree. The pick
 * is a per-day min-hash over stable SKUs, so a catalogue delivery cannot
 * shift the day's card by renumbering rows (only the rare new row that
 * hashes below the day's minimum can swap it, and then at most once).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, Benediction, InkRule, audienceMetadata } from "@/lib/ui";
import { query } from "@/lib/db";
import { getCardIdentity } from "@/lib/market/catalog-card";
import { stripIllustAnnotation } from "@/lib/cards/illust-annotation";
import TheEye from "./TheEye";

// The root layout reads cookies, so this route renders per request and the
// day's card flips exactly at the UTC date change. The per-instance memo in
// getDailyEye keeps the day's pick to one set of queries per server.

export const metadata: Metadata = {
  title: "The Trained Eye — 目利き, a daily looking game",
  description:
    "One card a day from the shop's own shelves, shown as an extreme close-up. Name it from four choices; every miss steps the view back, and the reveal is the full art. Free, no prizes, nothing recorded — just the eye, learning.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "play",
    "interactive",
    "condition",
    "connoisseurship",
  ]),
};

/** Same djb2 idiom as the tarot's deterministic draw — not cryptographic,
 *  just stable. Used for the decoys, the crop origin, and the choice
 *  order (the pick itself is a SQL min-hash — see getDailyEye). Every
 *  seed string keeps a suffix AFTER the day: djb2 barely avalanches on a
 *  final-character change (verified 2026-08-03 — bare-day seeds made
 *  consecutive days near-neighbours). */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  return h >>> 0;
}

/** Base printings that can be hung: a picture and a name, no parallels
 *  (variant '' is the base row; a parallel's tail carries no meaning a
 *  wall label may guess at). SEALED is the one catalogue set whose rows
 *  are boxed products wearing product names, not cards — verified by
 *  sample 2026-08-03; every other odd-looking set (PROMO, *-BOX, ST
 *  bundles) holds real cards. The host predicate mirrors next.config's
 *  remotePatterns for the catalogue-photo buckets: a stray host would
 *  make next/image throw and darken the whole day. */
const ELIGIBLE = `
    FROM card_set_cards csc
    JOIN card_sets cs ON cs.set_code = csc.set_code
   WHERE csc.image_url IS NOT NULL
     AND btrim(csc.image_url) <> ''
     AND csc.image_url ~ '^https://(jp-(op|pk|db)-photos\\.s3\\.us-east-1\\.amazonaws\\.com|www\\.cardrush-(op|pokemon|db)\\.jp)/'
     AND csc.variant = ''
     AND csc.set_code <> 'SEALED'
     AND csc.card_name IS NOT NULL
     AND btrim(csc.card_name) <> ''`;

interface DailyEye {
  day: string;
  sku: string;
  answer: string;
  choices: string[];
  imageUrl: string;
  imageAttribution: string | null;
  setName: string | null;
  origin: { x: number; y: number };
}

/** Deterministically pick `n` items out of `pool` without replacement. */
function seedPick(pool: string[], n: number, seedBase: string): string[] {
  const rest = [...pool];
  const picked: string[] = [];
  for (let i = 0; i < n && rest.length > 0; i++) {
    const at = hashSeed(`${seedBase}:${i}`) % rest.length;
    picked.push(...rest.splice(at, 1));
  }
  return picked;
}

// One set of queries per day per server instance; only a real pick is
// memoised, so an outage never pins the resting state for the day.
let memo: { day: string; eye: DailyEye } | null = null;

async function getDailyEye(): Promise<DailyEye | null> {
  const day = new Date().toISOString().slice(0, 10);
  if (memo?.day === day) return memo.eye;

  // The day's card is the eligible row whose day-salted md5 is smallest.
  // Keyed on the stable SKU, not a row position, so catalogue deliveries
  // cannot renumber the day's card out from under a visitor mid-game.
  const pick = await query(
    `SELECT csc.sku, csc.set_code, cs.game ${ELIGIBLE}
      ORDER BY md5('mekiki:' || $1 || ':' || csc.sku)
      LIMIT 1`,
    [day],
  );
  const row = pick.rows[0] as
    | { sku: string; set_code: string; game: string }
    | undefined;
  if (!row) return null;

  const identity = await getCardIdentity(row.sku);
  if (!identity?.image_url) return null;
  const answer = identity.card_name;
  const clean = (n: string) => stripIllustAnnotation(n).trim();
  const norm = (n: string) => clean(n).toLowerCase();

  // Decoys: three other names from the same set — the honest difficulty,
  // since set-mates share a world. Thin sets borrow from the same game.
  // Both pools are deterministically ordered (LIMIT without ORDER BY
  // returns a plan-dependent subset) and deduped case-insensitively so a
  // decoy can never be the answer wearing different whitespace or case.
  const mates = await query(
    `SELECT DISTINCT csc.card_name ${ELIGIBLE} AND csc.set_code = $1`,
    [row.set_code],
  );
  const pool = new Map<string, string>();
  const addNames = (rows: { card_name: string }[]) => {
    for (const r of rows) {
      const name = clean(r.card_name);
      const key = norm(r.card_name);
      if (name && key !== norm(answer) && !pool.has(key)) pool.set(key, name);
    }
  };
  addNames(mates.rows as { card_name: string }[]);
  if (pool.size < 3) {
    const gameMates = await query(
      `SELECT DISTINCT csc.card_name ${ELIGIBLE} AND cs.game = $1
        ORDER BY md5(csc.card_name) LIMIT 400`,
      [row.game],
    );
    addNames(gameMates.rows as { card_name: string }[]);
  }
  const names = [...pool.values()].sort();
  if (names.length < 3) return null;

  const decoys = seedPick(names, 3, `mekiki:${day}:decoy`);
  const choices = [answer, ...decoys].sort(
    (a, b) => hashSeed(`mekiki:${day}:pos:${a}`) - hashSeed(`mekiki:${day}:pos:${b}`),
  );

  const eye: DailyEye = {
    day,
    sku: identity.sku,
    answer,
    choices,
    imageUrl: identity.image_url,
    imageAttribution: identity.image_attribution,
    setName: identity.set_name,
    // Crop origin keeps to the middle band of the FRAME (30–70% × 32–62%);
    // the photos are near card-ratio so this usually lands in the art and
    // away from the printed name bars, but a margin-heavy photo can shift
    // the band — the game survives an easy day.
    origin: {
      x: 30 + (hashSeed(`mekiki:${day}:ox`) % 41),
      y: 32 + (hashSeed(`mekiki:${day}:oy`) % 31),
    },
  };
  memo = { day, eye };
  return eye;
}

export default async function MekikiPage() {
  let eye: DailyEye | null = null;
  try {
    eye = await getDailyEye();
  } catch (e) {
    console.error("[mekiki] daily pick failed", e);
    eye = null;
  }

  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block"
        >
          目利き
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          a wing of the museum · 目
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Trained Eye
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          目利き
          <span className="text-ink-muted"> — one card a day, seen too close</span>
        </p>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          The guides next door teach what to look <span className="italic">for</span> —{" "}
          <Link
            href="/guides/condition"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            print lines, centering, the honest edge
          </Link>
          . This room asks for the older skill underneath: recognition.{" "}
          <span className="wardrobe-jp">目利き</span> is the appraiser&apos;s
          word for it — the eye that knows a sword, a teabowl, a fish at the
          morning market, before the label says so.
          Every day one card comes off the shop&apos;s own shelves and hangs
          here, far too close to name. Name it anyway.
        </p>
        <p className="relative mt-4 text-sm text-ink-faint leading-relaxed">
          Free, and nothing is kept — no account, no streak, no record of your
          looking. Guess, and every miss steps the view back one look. The
          picture is the same reference photograph the market shelf uses;
          where the publisher&apos;s own sample art is published, that hangs
          instead, with its credit line.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
        {eye ? (
          <TheEye {...eye} />
        ) : (
          <p className="text-base text-ink-muted leading-relaxed">
            The room is resting — the shelves didn&apos;t answer just now.
            The card will be back on the wall shortly; the eye keeps.
          </p>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 pb-16">
        <InkRule className="mb-8" />
        <p className="text-sm text-ink-faint leading-relaxed">
          The eye you train here is the one the rest of the house speaks to:
          the{" "}
          <Link
            href="/guides/condition"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            inspector&apos;s guide <span className="wardrobe-jp">状態</span>
          </Link>{" "}
          teaches it to judge, the{" "}
          <Link
            href="/culture"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            culture wings <span className="wardrobe-jp">文化</span>
          </Link>{" "}
          teach it where the pictures came from, and the sibling room,{" "}
          <Link
            href="/pull-and-pause"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            The Pull &amp; the Pause <span className="wardrobe-jp">引きと間</span>
          </Link>
          , lets it rest between looks.
        </p>
      </div>

      <Benediction line="Look long enough, and the card names itself." />
    </main>
  );
}
