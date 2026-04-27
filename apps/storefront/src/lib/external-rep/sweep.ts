// Daily external-rep decay sweep.
//
// Re-verifies every external_reputation entry past its decay_at
// (90-day clock) by re-running the same code-fetch as the user-
// initiated path. Failed re-checks bump failed_check_count; when
// it crosses FAILED_CHECK_LIMIT the verified flag drops + trust
// recomputes (handled inside runVerificationCheck via isReverify).
//
// Self-gates to 05:15 UTC — slots between trust recompute (05:00)
// and after the fraud + review sweeps so the trust score the user
// sees in the morning reflects all signals.

import { query } from "@/lib/db";
import { runVerificationCheck } from "./verify";

const UTC_HOUR_WINDOW = 5;
const UTC_MINUTE_WINDOW_START = 15;
const UTC_MINUTE_WINDOW_END = 17;

const BATCH_SIZE = 200;

export interface ExternalRepSweepResult {
  ranInWindow: boolean;
  checked: number;
  succeeded: number;
  failed: number;
  downgraded: number;
}

function inWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === UTC_HOUR_WINDOW
    && now.getUTCMinutes() >= UTC_MINUTE_WINDOW_START
    && now.getUTCMinutes() <  UTC_MINUTE_WINDOW_END;
}

export async function runExternalRepDecaySweep(opts?: { force?: boolean }): Promise<ExternalRepSweepResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, checked: 0, succeeded: 0, failed: 0, downgraded: 0 };
  }

  const result: ExternalRepSweepResult = {
    ranInWindow: true,
    checked: 0,
    succeeded: 0,
    failed: 0,
    downgraded: 0,
  };

  const dueRes = await query(
    `SELECT id, failed_check_count
       FROM external_reputation
      WHERE verified = true
        AND decay_at IS NOT NULL
        AND decay_at < NOW()
      ORDER BY decay_at ASC
      LIMIT $1`,
    [BATCH_SIZE],
  );

  for (const row of dueRes.rows) {
    try {
      const beforeCount = row.failed_check_count ?? 0;
      const r = await runVerificationCheck(row.id, {
        isReverify: true,
        actorLabel: "system:decay-sweep",
      });
      result.checked++;
      if (r.ok) {
        result.succeeded++;
      } else {
        result.failed++;
        // runVerificationCheck downgrades when count crosses limit;
        // detect by re-reading the row.
        const after = await query(
          `SELECT verified FROM external_reputation WHERE id = $1`,
          [row.id],
        );
        if (after.rows[0]?.verified === false && beforeCount < 3) {
          result.downgraded++;
        }
      }
    } catch (err) {
      console.error(`[external-rep-sweep] failed for rep ${row.id}:`, err);
    }
  }

  return result;
}
