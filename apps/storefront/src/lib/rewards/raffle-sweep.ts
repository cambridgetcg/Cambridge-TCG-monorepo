// Raffle auto-draw cron.
//
// Finds raffles where draw_at <= NOW() and status is still 'active', then
// invokes provablyFairDraw() and emails the winner. Without this, raffles
// sit indefinitely until admin manually clicks Draw — which they often
// don't.
//
// Was previously using the legacy drawRaffleWinner (Math.random()) which
// produced no proof and had no audit trail. Switched to the commit-reveal
// implementation so cron-drawn raffles are verifiable like manual draws.
// Pre-commits the seed if admin hasn't (raffles created before the
// pre-commit hook landed); the proof captures whether commit preceded draw.
//
// Sets winner_notified=true on successful email so a re-sweep doesn't
// double-mail. Failed emails leave the flag false; next tick retries.

import { query } from "@/lib/db";
import { provablyFairDraw, commitSeed } from "./provable-fair";

export interface RaffleSweepResult {
  drawn: number;
  notified: number;
  failures: number;
}

export async function runRaffleAutoDraw(): Promise<RaffleSweepResult> {
  // Find raffles overdue for a draw
  const due = await query(
    `SELECT id, title, prize_description, prize_value
       FROM raffles
      WHERE status = 'active'
        AND draw_at IS NOT NULL
        AND draw_at <= NOW()`
  );

  let drawn = 0;
  let notified = 0;
  let failures = 0;

  for (const raffle of due.rows) {
    try {
      // Belt-and-braces pre-commit: if admin didn't pre-commit before
      // entries closed, commit now. The commit precedes the draw within
      // this same loop iteration so committed_at < drawn_at is preserved
      // even for raffles that skipped the manual pre-commit step.
      // commitSeed is idempotent (no-ops if seed already exists).
      try { await commitSeed(raffle.id); } catch (err) {
        console.warn(`[raffle-sweep] pre-commit skipped for ${raffle.id}:`, err);
      }

      const result = await provablyFairDraw(raffle.id);
      drawn++;

      if (result.winner) {
        // Resolve winner email + name in one query
        const u = await query(
          `SELECT email, name FROM users WHERE id = $1`,
          [result.winner.user_id]
        );
        const email = u.rows[0]?.email;
        if (email) {
          try {
            const { sendRaffleWinnerEmail } = await import("./email");
            await sendRaffleWinnerEmail({
              email,
              name: u.rows[0]?.name ?? null,
              raffleTitle: raffle.title,
              prizeDescription: raffle.prize_description,
            });
            await query(
              `UPDATE raffles SET winner_notified = true, updated_at = NOW() WHERE id = $1`,
              [raffle.id]
            );
            notified++;
          } catch (err) {
            failures++;
            console.error(`[raffle-sweep] notify failed for ${raffle.id}:`, err);
          }
        }
      }
    } catch (err) {
      failures++;
      console.error(`[raffle-sweep] draw failed for ${raffle.id}:`, err);
    }
  }

  return { drawn, notified, failures };
}

// Notify a previously-drawn raffle winner whose email failed last time.
// Useful if SES had a transient issue when the sweep ran.
export async function retryWinnerNotifications(): Promise<{ retried: number }> {
  const overdue = await query(
    `SELECT id, title, prize_description, winner_user_id
       FROM raffles
      WHERE status = 'completed'
        AND winner_user_id IS NOT NULL
        AND winner_notified = false
        AND winner_drawn_at < NOW() - INTERVAL '1 hour'`
  );
  let retried = 0;
  for (const r of overdue.rows) {
    const u = await query(`SELECT email, name FROM users WHERE id = $1`, [r.winner_user_id]);
    if (!u.rows[0]?.email) continue;
    try {
      const { sendRaffleWinnerEmail } = await import("./email");
      await sendRaffleWinnerEmail({
        email: u.rows[0].email,
        name: u.rows[0].name ?? null,
        raffleTitle: r.title,
        prizeDescription: r.prize_description,
      });
      await query(`UPDATE raffles SET winner_notified = true WHERE id = $1`, [r.id]);
      retried++;
    } catch (err) {
      console.error(`[raffle-sweep] retry notify failed for ${r.id}:`, err);
    }
  }
  return { retried };
}
