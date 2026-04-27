// E2E test of mergeTokens against the live DB.
import pg from "pg";
const merge = await import("../src/lib/bounty/merge");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

try {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Merge Test') RETURNING id`,
    [`merge-test-${Date.now()}@test.invalid`],
  );
  const userId: string = u.rows[0].id;

  // 1) Fresh user → insufficient tokens
  const r1 = await merge.mergeTokens(userId, "common");
  assert(!r1.ok && "error" in r1 && r1.error === "insufficient_tokens", "no tokens → insufficient");

  // Seed 4 common tokens
  await pool.query(
    `INSERT INTO bounty_pull_tokens (user_id, tier, count) VALUES ($1, 'common', 4)`,
    [userId],
  );

  // 2) Should succeed
  const r2 = await merge.mergeTokens(userId, "common");
  assert(r2.ok && "toTier" in r2 && r2.toTier === "uncommon", "4 commons → 1 uncommon");

  // 3) Verify balances
  const bal = await pool.query(
    `SELECT tier, count FROM bounty_pull_tokens WHERE user_id = $1 ORDER BY tier`,
    [userId],
  );
  const byTier: Record<string, number> = {};
  for (const r of bal.rows) byTier[r.tier] = r.count;
  assert(byTier.common === 0, "common balance = 0 after merge");
  assert(byTier.uncommon === 1, "uncommon balance = 1 after merge");

  // 4) Audit row exists
  const audit = await pool.query(
    `SELECT from_tier, to_tier, tokens_consumed FROM bounty_merges WHERE user_id = $1`,
    [userId],
  );
  assert(audit.rows.length === 1, "1 audit row written");
  assert(audit.rows[0].from_tier === "common", "audit from_tier = common");
  assert(audit.rows[0].to_tier === "uncommon", "audit to_tier = uncommon");
  assert(audit.rows[0].tokens_consumed === 4, "audit tokens_consumed = 4");

  // 5) Chain up: 4 uncommon → 1 rare. Seed 3 more first.
  await pool.query(
    `UPDATE bounty_pull_tokens SET count = count + 3 WHERE user_id = $1 AND tier = 'uncommon'`,
    [userId],
  );
  const r3 = await merge.mergeTokens(userId, "uncommon");
  assert(r3.ok && "toTier" in r3 && r3.toTier === "rare", "chain: 4 uncommon → 1 rare");

  // 6) super_rare not mergeable
  await pool.query(
    `INSERT INTO bounty_pull_tokens (user_id, tier, count) VALUES ($1, 'super_rare', 4)`,
    [userId],
  );
  const r4 = await merge.mergeTokens(userId, "super_rare");
  assert(!r4.ok && "error" in r4 && r4.error === "not_mergeable", "super_rare not mergeable");

  // 7) legendary not mergeable
  const r5 = await merge.mergeTokens(userId, "legendary");
  assert(!r5.ok && "error" in r5 && r5.error === "not_mergeable", "legendary not mergeable");

  // 8) Disabled tier refuses merge-into
  await pool.query(`UPDATE bounty_pull_tiers SET enabled = false WHERE tier = 'super_rare'`);
  // User has 1 rare. Seed 3 more.
  await pool.query(
    `UPDATE bounty_pull_tokens SET count = count + 3 WHERE user_id = $1 AND tier = 'rare'`,
    [userId],
  );
  const r6 = await merge.mergeTokens(userId, "rare");
  assert(!r6.ok && "error" in r6 && r6.error === "tier_disabled", "merging into disabled tier refused");
  await pool.query(`UPDATE bounty_pull_tiers SET enabled = true WHERE tier = 'super_rare'`);

  // Stats
  const stats = await merge.getMergeStats(userId);
  assert(stats.total === 2, `merge stats: total = 2 (got ${stats.total})`);

  // Cleanup
  await pool.query(`DELETE FROM bounty_merges WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM bounty_pull_tokens WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
