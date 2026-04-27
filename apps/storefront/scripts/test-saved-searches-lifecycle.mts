// E2E for the saved-searches arc. Eight suites against the lib +
// matcher + cron sweep. Direct-lib pattern matching offers/returns.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

const {
  createSearch, pauseSearch, resumeSearch, archiveSearch, extendSearch,
  listSearches, getSearch, listMatchesForSearch, runSavedSearchSweep,
} = await import("../src/lib/market/saved-searches");

const { listNotifications } = await import("../src/lib/notifications/db");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function makeAsk(args: {
  sellerId: string;
  sku: string;
  cardName?: string;
  setCode?: string;
  condition?: string;
  price: number;
}): Promise<string> {
  const r = await pool.query(
    `INSERT INTO market_orders
       (user_id, side, sku, card_name, set_code, condition, price, quantity, status)
     VALUES ($1, 'ask', $2, $3, $4, $5, $6, 1, 'open')
     RETURNING id`,
    [args.sellerId, args.sku, args.cardName ?? "Test Card",
     args.setCode ?? null, args.condition ?? "NM", args.price.toFixed(2)],
  );
  return r.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(
    `DELETE FROM saved_search_matches
      WHERE search_id IN (SELECT id FROM saved_searches WHERE user_id = ANY($1::uuid[]))`,
    [userIds],
  );
  await pool.query(`DELETE FROM saved_searches WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM market_orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];

  // ── Suite 1: createSearch validation ──
  console.log("\n— Suite 1: createSearch validation");
  const buyer1 = await makeUser(`ss-b1-${t}`);
  allUsers.push(buyer1);

  // Empty query
  const empty = await createSearch({
    userId: buyer1, name: "Empty", query: {},
  });
  assert(!empty.ok && empty.reason.includes("criterion"),
    "empty query rejected");

  // No name
  const noName = await createSearch({
    userId: buyer1, name: "", query: { text: "x" },
  });
  assert(!noName.ok, "blank name rejected");

  // min > max
  const flipped = await createSearch({
    userId: buyer1, name: "Flipped",
    query: { min_price: 100, max_price: 50 },
  });
  assert(!flipped.ok && flipped.reason.includes("min_price"),
    "min > max rejected");

  // Negative price
  const neg = await createSearch({
    userId: buyer1, name: "Neg", query: { max_price: -1 },
  });
  assert(!neg.ok, "negative price rejected");

  // Valid
  const ok = await createSearch({
    userId: buyer1, name: "Cheap Charizards",
    query: { text: "charizard", max_price: 100 },
  });
  assert(ok.ok, `valid search created (${ok.ok ? "ok" : ok.reason})`);
  if (ok.ok) {
    assert(ok.value.status === "active", "starts active");
    assert(ok.value.match_count === 0, "match_count starts 0");
    assert(ok.value.last_scanned_at === null, "last_scanned_at null pre-sweep");
  }
  const search1 = ok.ok ? ok.value : null;

  // ── Suite 2: sweep matches new asks + fires notification ──
  console.log("\n— Suite 2: runSavedSearchSweep matches + notifies");
  const seller1 = await makeUser(`ss-s1-${t}`);
  allUsers.push(seller1);

  // Two asks: one matching ('Charizard'), one not ('Pikachu')
  const matchingAsk = await makeAsk({
    sellerId: seller1, sku: `CHAR-${t}-1`,
    cardName: "Charizard ex", price: 75.00,
  });
  await makeAsk({
    sellerId: seller1, sku: `PIKA-${t}-1`,
    cardName: "Pikachu", price: 50.00,
  });
  // Above-max ask shouldn't match
  await makeAsk({
    sellerId: seller1, sku: `CHAR-${t}-2`,
    cardName: "Charizard SR", price: 200.00,
  });

  const sweep1 = await runSavedSearchSweep();
  assert(sweep1.scanned >= 1, `sweep scanned at least 1 (got ${sweep1.scanned})`);
  assert(sweep1.matched === 1, `sweep matched exactly 1 (got ${sweep1.matched})`);
  assert(sweep1.notified === 1, "fired exactly 1 notification");

  const matches1 = await listMatchesForSearch(search1!.id, buyer1);
  assert(matches1.length === 1, `1 match recorded (got ${matches1.length})`);
  assert(matches1[0].order_id === matchingAsk, "matched order_id correct");
  assert(matches1[0].matched_price === "75.00", "matched_price snapshotted");

  const notifs = await listNotifications(buyer1);
  const matchNotif = notifs.find((n) => n.kind === "search.match");
  assert(matchNotif != null, "buyer got search.match notification");
  assert(matchNotif?.title.includes("Charizard"), "title names the matched card");

  // Search row updated
  const updated = await getSearch(search1!.id, buyer1);
  assert(updated?.match_count === 1, "match_count incremented");
  assert(updated?.last_match_at != null, "last_match_at stamped");
  assert(updated?.last_scanned_at != null, "last_scanned_at advanced");

  // ── Suite 3: re-running sweep is idempotent ──
  console.log("\n— Suite 3: sweep dedup");
  const sweep2 = await runSavedSearchSweep();
  assert(sweep2.matched === 0, `re-sweep finds 0 new matches (got ${sweep2.matched})`);

  const after = await getSearch(search1!.id, buyer1);
  assert(after?.match_count === 1, "match_count unchanged on re-sweep");

  // ── Suite 4: pause excludes from sweep ──
  console.log("\n— Suite 4: pauseSearch removes from sweep");
  const pr = await pauseSearch(search1!.id, buyer1);
  assert(pr.ok, "pause ok");
  if (pr.ok) assert(pr.value.status === "paused", "status paused");

  // Add a NEW matching ask
  await makeAsk({
    sellerId: seller1, sku: `CHAR-${t}-3`,
    cardName: "Charizard V", price: 80.00,
  });
  const sweep3 = await runSavedSearchSweep();
  // search1 is paused so it won't scan; if no other test data is
  // active, scanned could be 0 (but other test runs may leave rows).
  // What we can assert: search1's match_count didn't change.
  const stillPaused = await getSearch(search1!.id, buyer1);
  assert(stillPaused?.match_count === 1,
    "paused search did not pick up new match");

  // resume + sweep
  const rr = await resumeSearch(search1!.id, buyer1);
  assert(rr.ok, "resume ok");
  await runSavedSearchSweep();
  const afterResume = await getSearch(search1!.id, buyer1);
  assert(afterResume!.match_count >= 2,
    `resumed search picked up new match (count ${afterResume!.match_count})`);

  // ── Suite 5: extend resurrects expired ──
  console.log("\n— Suite 5: extendSearch revives expired");
  // Make a 2nd search and back-date its expires_at + force expired status
  const s2r = await createSearch({
    userId: buyer1, name: "Old search",
    query: { text: "doesnotmatch" },
  });
  if (!s2r.ok) throw new Error(`setup: ${s2r.reason}`);
  await pool.query(
    `UPDATE saved_searches SET status='expired', expires_at=NOW() - INTERVAL '1 day' WHERE id=$1`,
    [s2r.value.id],
  );

  const ext = await extendSearch(s2r.value.id, buyer1);
  assert(ext.ok, "extend ok");
  if (ext.ok) {
    assert(ext.value.status === "active", "status revived to active");
    assert(new Date(ext.value.expires_at).getTime() > Date.now(),
      "expires_at advanced");
  }

  // Archive → can't extend
  const arc = await archiveSearch(s2r.value.id, buyer1);
  assert(arc.ok, "archive ok");
  const tryExt = await extendSearch(s2r.value.id, buyer1);
  assert(!tryExt.ok && tryExt.reason.includes("Archived"),
    "extending archived rejected");

  // ── Suite 6: TTL sweep marks expired ──
  console.log("\n— Suite 6: TTL sweep on active+past-expiry");
  const s3r = await createSearch({
    userId: buyer1, name: "TTL-test",
    query: { text: "anything" },
  });
  if (!s3r.ok) throw new Error(`setup: ${s3r.reason}`);
  await pool.query(
    `UPDATE saved_searches SET expires_at=NOW() - INTERVAL '1 day' WHERE id=$1`,
    [s3r.value.id],
  );

  await runSavedSearchSweep();
  const swept = await getSearch(s3r.value.id, buyer1);
  assert(swept?.status === "expired",
    `TTL sweep marked expired (got ${swept?.status})`);

  // ── Suite 7: ownership / authorization ──
  console.log("\n— Suite 7: ownership checks");
  const buyer2 = await makeUser(`ss-b2-${t}`);
  allUsers.push(buyer2);

  const otherPause = await pauseSearch(search1!.id, buyer2);
  assert(!otherPause.ok && otherPause.status === 403,
    "non-owner pause rejected with 403");

  const stranger = await listMatchesForSearch(search1!.id, buyer2);
  assert(stranger.length === 0, "non-owner gets empty match list");

  // ── Suite 8: list filters out archived ──
  console.log("\n— Suite 8: listSearches excludes archived");
  const list = await listSearches(buyer1);
  assert(list.every((s) => s.status !== "archived"),
    "archived rows hidden from listSearches");

  // ── Cleanup ──
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
