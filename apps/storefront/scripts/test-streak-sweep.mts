// E2E test for runStreakAtRiskSweep().
// Seeds users with various streak states and asserts who ends up queued.

import pg from "pg";
const mod = await import("../src/lib/email/streak-sweep");
const { runStreakAtRiskSweep } = mod;

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

async function seedUser(email: string, lastVisitDaysAgo: number, streak: number): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Streak') RETURNING id`,
    [email],
  );
  const id = u.rows[0].id;
  // Use a SQL expression directly for the date so Postgres computes it —
  // the pg driver won't accept "CURRENT_DATE - 1" as a text parameter.
  const mult = Math.min(1.5, 1.0 + (streak - 1) * 0.02).toFixed(2);
  await pool.query(
    `INSERT INTO user_streaks (user_id, current_streak, last_visit_date, streak_multiplier)
     VALUES ($1, $2, CURRENT_DATE - $3::int, $4)`,
    [id, streak, lastVisitDaysAgo, mult],
  );
  return id;
}

try {
  const t = Date.now();
  const atRisk = await seedUser(`sweep-risk-${t}@test.invalid`, 1, 5);      // yesterday, streak 5 → queue
  const safe = await seedUser(`sweep-safe-${t}@test.invalid`, 0, 10);       // today → skip
  const broken = await seedUser(`sweep-broken-${t}@test.invalid`, 3, 2);    // 3d ago → skip
  const trivial = await seedUser(`sweep-trivial-${t}@test.invalid`, 1, 1);  // streak 1 → skip

  const result = await runStreakAtRiskSweep();
  assert(result.atRiskCount === 1, `atRiskCount = 1 (got ${result.atRiskCount}) — only the risk user qualifies`);
  assert(result.queuedCount === 1, `queuedCount = 1 (got ${result.queuedCount})`);

  // Verify the queue row
  const rows = await pool.query(
    `SELECT user_id, event, status, idempotency_key FROM email_queue WHERE user_id = $1`,
    [atRisk],
  );
  assert(rows.rows.length === 1, "queue has 1 row for at-risk user");
  assert(rows.rows[0].event === "streak_at_risk", "event = streak_at_risk");
  assert(rows.rows[0].status === "pending", "status = pending");

  // Idempotency: re-running the sweep shouldn't add more rows.
  const result2 = await runStreakAtRiskSweep();
  assert(result2.queuedCount === 1, "re-run also reports 1 (scheduleEmail returns existing id)");
  const rows2 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_queue WHERE user_id = $1`,
    [atRisk],
  );
  assert(rows2.rows[0].n === 1, "queue still has 1 row — idempotent");

  // Cleanup
  for (const id of [atRisk, safe, broken, trivial]) {
    await pool.query(`DELETE FROM email_queue WHERE user_id = $1`, [id]);
    await pool.query(`DELETE FROM user_streaks WHERE user_id = $1`, [id]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
