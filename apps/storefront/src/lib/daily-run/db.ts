// Daily Run DB helpers — the day's deck, the once-a-day claim, the reveal.
//
// What this module carries that others don't: the binding between one UTC
// day and one verifiable_draws row, so "today's deck is the same for
// everyone and was committed before anyone played" is a database fact, not
// a promise. Adjacent modules reach toward it for: provable-draw (the
// shuffle), wholesale prices (the morning snapshot), membership streak +
// rewards earnings (the flat claim), the maintenance cron (yesterday's
// reveal).

import { query } from "@/lib/db";
import { commitDraw, rollSlot, revealDraw, type CommittedDraw } from "@/lib/provable-draw";
import { fetchPrices } from "@/lib/wholesale/client";
import { earnRewardPoints, type RewardEarningResult } from "@/lib/rewards/earnings";
import { bumpStreak } from "@/lib/membership/streak";
import { DAILY_PAYOUT_BASE, DECK_SIZE, POOL_SIZE, NUM_SLOTS, deriveDeck, todayUtc } from "./game";
import type { DailyCard, DailyRunDay } from "./types";

function rowToDay(row: { run_date: string | Date; draw_id: string; cards: DailyCard[] }): DailyRunDay {
  const d = row.run_date instanceof Date ? row.run_date.toISOString().slice(0, 10) : String(row.run_date).slice(0, 10);
  return { run_date: d, draw_id: row.draw_id, cards: row.cards };
}

export async function getDay(runDate: string): Promise<DailyRunDay | null> {
  const r = await query(
    `SELECT run_date, draw_id, cards FROM daily_run_days WHERE run_date = $1`,
    [runDate],
  );
  return r.rows[0] ? rowToDay(r.rows[0]) : null;
}

/** Build the price-eligible pool: in stock, has image and name and a real
 *  price, then spaced so adjacent prices differ by at least 5% — guesses
 *  should be questions, never coin-flips on identical prices (ties still
 *  favour the player if they slip through). Editorial choice, stated here;
 *  the SHUFFLE over the pool is the provably fair part. */
async function buildPool(): Promise<DailyCard[]> {
  const res = await fetchPrices({ in_stock: true, limit: 200 });
  const eligible = res.items
    .filter((c) => c.image_url && (c.name || c.name_en) && c.price_gbp > 0)
    .map((c) => ({
      sku: c.sku,
      name: (c.name_en || c.name) as string,
      image_url: c.image_url,
      set_code: c.set_code,
      card_number: c.card_number ?? null,
      price_pence: Math.round(c.price_gbp * 100),
    }))
    .sort((a, b) => b.price_pence - a.price_pence);

  const spaced: DailyCard[] = [];
  for (const card of eligible) {
    const last = spaced[spaced.length - 1];
    if (!last || last.price_pence * 0.95 >= card.price_pence) spaced.push(card);
    if (spaced.length === POOL_SIZE) break;
  }
  return spaced;
}

/** The day's deck, created on the day's first request. Two simultaneous
 *  first visitors race politely: ON CONFLICT DO NOTHING + re-read means
 *  both see the same deck; the loser's committed draw stays unrevealed and
 *  unreferenced (admitted in the README). The seed stays sealed until
 *  revealYesterday runs after midnight. */
export async function getOrCreateToday(): Promise<DailyRunDay> {
  const today = todayUtc();
  const existing = await getDay(today);
  if (existing) return existing;

  const pool = await buildPool();
  if (pool.length < DECK_SIZE) throw new Error(`daily-run: pool too thin (${pool.length})`);
  const poolSorted = pool.map((c) => c.sku).sort();
  const weights: Record<string, number> = {};
  for (const sku of poolSorted) weights[sku] = 1;

  const draw = await commitDraw({
    kind: "custom",
    userId: null,
    subjectId: `daily-run:${today}`,
    weights,
    numSlots: NUM_SLOTS,
  });
  const slotPicks: string[] = [];
  for (let i = 0; i < NUM_SLOTS; i++) slotPicks.push(rollSlot<string>(draw, i).picked);
  const deckSkus = deriveDeck(slotPicks, poolSorted, DECK_SIZE);
  const bySku = new Map(pool.map((c) => [c.sku, c]));
  const cards = deckSkus.map((sku) => bySku.get(sku)!).filter(Boolean);

  await query(
    `INSERT INTO daily_run_days (run_date, draw_id, cards)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (run_date) DO NOTHING`,
    [today, draw.id, JSON.stringify(cards)],
  );
  const settled = await getDay(today);
  if (!settled) throw new Error("daily-run: day vanished after insert");
  return settled;
}

/** Yesterday's deck, if revealed — for the page's quiet proof link. */
export async function getYesterdayProof(): Promise<{ run_date: string; draw_id: string } | null> {
  const r = await query(
    `SELECT d.run_date, d.draw_id
       FROM daily_run_days d
       JOIN verifiable_draws v ON v.id = d.draw_id
      WHERE d.run_date < $1 AND v.revealed_at IS NOT NULL
      ORDER BY d.run_date DESC LIMIT 1`,
    [todayUtc()],
  );
  if (!r.rows[0]) return null;
  return { run_date: String(r.rows[0].run_date).slice(0, 10), draw_id: r.rows[0].draw_id };
}

/** The flat once-a-day claim. Order matters and is deliberate:
 *  1. the claim row is the idempotency guard (PK user_id+run_date);
 *  2. bumpStreak FIRST — finishing a run is a real "I'm here today"
 *     action, and bumping first means today's multiplier applies;
 *  3. earnRewardPoints composes tier × streak and annotates the ledger.
 *  Returns null when already claimed today — silently; no nag. */
export async function claimDailyBerries(userId: string): Promise<RewardEarningResult | null> {
  const today = todayUtc();
  const claim = await query(
    `INSERT INTO daily_run_claims (user_id, run_date)
     VALUES ($1, $2)
     ON CONFLICT (user_id, run_date) DO NOTHING
     RETURNING run_date`,
    [userId, today],
  );
  if (!claim.rows[0]) return null;
  await bumpStreak(userId);
  return earnRewardPoints({
    userId,
    baseAmount: DAILY_PAYOUT_BASE,
    type: "manual_credit",
    description: "Daily Run finished",
    referenceId: `daily-run:${today}`,
  });
}

/** Reveal yesterday's seed so anyone can replay the shuffle at
 *  /verify/draw/[id]. Runs from the existing maintenance cron — no new
 *  cron route. Idempotent: revealDraw only stamps unrevealed rows. */
export async function revealDailyRunYesterday(): Promise<{ revealed: number }> {
  const r = await query(
    `SELECT v.id, v.kind, v.server_seed, v.commitment, v.client_seed, v.nonce, v.weights, v.num_slots
       FROM daily_run_days d
       JOIN verifiable_draws v ON v.id = d.draw_id
      WHERE d.run_date < $1 AND v.revealed_at IS NULL`,
    [todayUtc()],
  );
  let revealed = 0;
  for (const row of r.rows) {
    const draw: CommittedDraw = {
      id: row.id,
      kind: row.kind,
      serverSeed: row.server_seed,
      commitment: row.commitment,
      clientSeed: row.client_seed,
      nonce: Number(row.nonce),
      weights: row.weights,
      numSlots: row.num_slots,
    };
    const slots = [];
    for (let i = 0; i < draw.numSlots; i++) {
      const { roll, picked } = rollSlot<string>(draw, i);
      slots.push({ picked, roll });
    }
    await revealDraw(draw, { slots });
    revealed++;
  }
  return { revealed };
}
