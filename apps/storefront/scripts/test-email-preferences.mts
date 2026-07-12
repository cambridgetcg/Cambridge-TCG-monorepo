// E2E test of the preferences + unsubscribe-token pipeline against the live
// DB. Does NOT hit SES — purely exercises the DB helpers.

import pg from "pg";
const prefsMod = await import("../src/lib/email/preferences");
const {
  getPreferences,
  setPreferences,
  canSendEvent,
  makeUnsubscribeToken,
  verifyUnsubscribeToken,
  applyUnsubscribe,
} = prefsMod;

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

try {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Prefs Test') RETURNING id`,
    [`prefs-test-${Date.now()}@test.invalid`],
  );
  const userId: string = u.rows[0].id;

  // 1) default preferences
  const defaults = await getPreferences(userId);
  assert(defaults.pull_resolved === true, "defaults: pull_resolved = true");
  assert(defaults.marketing === false, "defaults: marketing = false");
  assert(defaults.streak_at_risk === false, "defaults: streak_at_risk = false");

  // 2) canSendEvent respects defaults
  assert(await canSendEvent(userId, "vault_expired"), "canSendEvent(vault_expired) = true by default");
  assert(!(await canSendEvent(userId, "marketing")), "canSendEvent(marketing) = false by default");

  // 3) setPreferences persists + merges
  const after = await setPreferences(userId, { vault_expired: false, marketing: true });
  assert(after.vault_expired === false, "after set: vault_expired = false");
  assert(after.marketing === true, "after set: marketing = true");
  assert(after.pull_resolved === true, "after set: pull_resolved still = true");
  assert(!(await canSendEvent(userId, "vault_expired")), "canSendEvent now respects opt-out");

  // 4) token round-trip
  const token = makeUnsubscribeToken(userId, "pull_resolved");
  assert(token.split(".").length === 2, "token has body.hmac shape");
  const verified = verifyUnsubscribeToken(token);
  assert(verified?.userId === userId, "token verifies to same userId");
  assert(verified?.category === "pull_resolved", "token verifies to same category");

  // 5) tampered token fails
  const tampered = token.replace(/.$/, (ch) => (ch === "a" ? "b" : "a"));
  assert(verifyUnsubscribeToken(tampered) === null, "tampered token rejected");
  assert(verifyUnsubscribeToken("garbage.notvalid") === null, "gibberish token rejected");

  // 6) applyUnsubscribe changes the preference once; replay adds no record.
  const firstUnsubscribe = await applyUnsubscribe({ userId, category: "pull_resolved" });
  assert(firstUnsubscribe.changed, "first unsubscribe changes the preference");
  assert(!(await canSendEvent(userId, "pull_resolved")), "user is now opted out of pull_resolved");
  const replay = await applyUnsubscribe({ userId, category: "pull_resolved" });
  assert(!replay.changed, "unsubscribe replay is a no-op");

  // Cleanup
  await pool.query(`DELETE FROM user_email_preferences WHERE user_id=$1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
