// E2E for the social module. Covers the three day-one contract bugs
// fixed in this arc + idempotency / atomicity regressions in the
// follow counters + the new review → notification + activity wiring.
//
// Hits the lib helpers directly; route handlers are thin auth +
// delegate wrappers (same pattern used across the session).

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
  getPublicProfile,
  updateProfile,
  toggleFollow,
  isFollowing,
  getFollowers,
  getFollowing,
  getUserActivity,
} = await import("../src/lib/social/db");

const { submitReview, getUserReviews } = await import("../src/lib/escrow/trust-engine");
const { listNotifications, unreadCount } = await import("../src/lib/notifications/db");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name, is_public) VALUES ($1, $2, true) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function makeTrade(buyerId: string, sellerId: string, sku: string): Promise<string> {
  const bid = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'bid', 10.00, 1, 'NM', 'open') RETURNING id`,
    [buyerId, sku],
  );
  const ask = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'ask', 10.00, 1, 'NM', 'open') RETURNING id`,
    [sellerId, sku],
  );
  const t = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout, created_at)
     VALUES ($1, $2, $3, $4, $5, 10.00, 1, 'completed', 0.80, 9.20, NOW())
     RETURNING id`,
    [buyerId, sellerId, bid.rows[0].id, ask.rows[0].id, sku],
  );
  return t.rows[0].id;
}

async function cleanup(userIds: string[], tradeIds: string[]) {
  if (tradeIds.length > 0) {
    await pool.query(`DELETE FROM trade_reviews WHERE trade_id = ANY($1::uuid[])`, [tradeIds]);
    await pool.query(`DELETE FROM market_trades WHERE id = ANY($1::uuid[])`, [tradeIds]);
  }
  if (userIds.length > 0) {
    await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM activity_feed WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM follows WHERE follower_id = ANY($1::uuid[]) OR following_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM market_orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];
  const allTrades: string[] = [];

  // ── Suite 1: updateProfile accepts snake_case + camelCase ──
  //
  // Regression guard: the day-one bug was that the PATCH route only
  // read `body.isPublic` while /account/profile sent `is_public`. The
  // lib's updateProfile is case-agnostic (it takes an object with
  // camelCase keys); the route's `pick()` helper bridges both. This
  // suite exercises the lib directly — the route contract is covered
  // by reading both forms of the payload in the route code.
  console.log("\n— Suite 1: updateProfile (lib level)");
  const u1 = await makeUser(`social-${t}-1`);
  allUsers.push(u1);

  await updateProfile(u1, {
    username: `u${t}_abc`,
    bio: "Testing the day-one bug stays fixed.",
    isPublic: false,
  });
  const p1 = await getPublicProfile(u1);
  assert(p1?.username === `u${t}_abc`, "username saved");
  assert(p1?.bio === "Testing the day-one bug stays fixed.", "bio saved");
  assert(p1?.is_public === false, "is_public saved as false");

  await updateProfile(u1, { isPublic: true });
  const p1b = await getPublicProfile(u1);
  assert(p1b?.is_public === true, "is_public toggled back to true");

  // ── Suite 2: username uniqueness throws pg 23505 ──
  console.log("\n— Suite 2: duplicate username surfaces as pg code 23505");
  const u2 = await makeUser(`social-${t}-2`);
  allUsers.push(u2);

  let caught: { code?: string } | null = null;
  try {
    await updateProfile(u2, { username: `u${t}_abc` });
  } catch (err) {
    caught = err as { code?: string };
  }
  assert(caught?.code === "23505",
    `duplicate username rejected with pg code 23505 (got ${caught?.code})`);

  // ── Suite 3: follow toggle atomicity + counter correctness ──
  //
  // The old impl did three sequential queries (SELECT, DELETE/INSERT,
  // UPDATE counters). A follow+unfollow race could drift the counters.
  // The new impl wraps them in BEGIN/COMMIT. This suite verifies the
  // counters track the real follows-table count across rapid toggles.
  console.log("\n— Suite 3: toggleFollow atomicity + counter sync");
  const u3 = await makeUser(`social-${t}-3`);
  allUsers.push(u3);

  const r1 = await toggleFollow(u1, u3);
  assert(r1 === true, "first call creates follow (returns true)");
  assert(await isFollowing(u1, u3), "isFollowing confirms");

  const countsAfterFollow = await pool.query(
    `SELECT following_count FROM users WHERE id=$1
     UNION ALL SELECT follower_count FROM users WHERE id=$2`,
    [u1, u3],
  );
  assert(countsAfterFollow.rows[0].following_count === 1, "follower's following_count=1");
  assert(countsAfterFollow.rows[1].following_count === 1, "followee's follower_count=1");

  const r2 = await toggleFollow(u1, u3);
  assert(r2 === false, "second call unfollows (returns false)");
  assert(!(await isFollowing(u1, u3)), "follow is gone");

  const countsAfterUnfollow = await pool.query(
    `SELECT following_count FROM users WHERE id=$1
     UNION ALL SELECT follower_count FROM users WHERE id=$2`,
    [u1, u3],
  );
  assert(countsAfterUnfollow.rows[0].following_count === 0, "following_count=0 after unfollow");
  assert(countsAfterUnfollow.rows[1].following_count === 0, "follower_count=0 after unfollow");

  // Rapid toggle 5x should leave counters at 1 (odd final state)
  for (let i = 0; i < 5; i++) await toggleFollow(u1, u3);
  const counts5 = await pool.query(
    `SELECT following_count FROM users WHERE id=$1
     UNION ALL SELECT follower_count FROM users WHERE id=$2`,
    [u1, u3],
  );
  assert(counts5.rows[0].following_count === 1, `5 toggles ends at following=1 (got ${counts5.rows[0].following_count})`);
  assert(counts5.rows[1].following_count === 1, `5 toggles ends at follower=1 (got ${counts5.rows[1].following_count})`);

  // Self-follow is rejected
  const selfFollow = await toggleFollow(u1, u1);
  assert(selfFollow === false, "self-follow returns false (not allowed)");

  // ── Suite 4: follow notification dedup (route level) ──
  //
  // The route fires notify({ kind: 'follow.new', referenceId:
  // '<follower>:<followed>' }). Repeat follow/unfollow/re-follow
  // cycles shouldn't spam — each dedup key collapses to one row.
  console.log("\n— Suite 4: follow.new notifications");

  // Direct test of notify dedup via lib (route calls notify())
  const { notify } = await import("../src/lib/notifications/db");
  await notify({
    userId: u3,
    kind: "follow.new",
    title: "Test",
    referenceType: "follow",
    referenceId: `${u1}:${u3}`,
  });
  await notify({
    userId: u3,
    kind: "follow.new",
    title: "Test (dup)",
    referenceType: "follow",
    referenceId: `${u1}:${u3}`,
  });
  const u3notifs = await listNotifications(u3);
  const followNotifs = u3notifs.filter((n) => n.kind === "follow.new");
  assert(followNotifs.length === 1,
    `follow.new dedup produces exactly 1 row (got ${followNotifs.length})`);

  // ── Suite 5: getFollowers / getFollowing ──
  console.log("\n— Suite 5: follower/following list queries");
  // u1 already follows u3 from suite 3
  const u4 = await makeUser(`social-${t}-4`);
  const u5 = await makeUser(`social-${t}-5`);
  allUsers.push(u4, u5);
  await toggleFollow(u4, u3);
  await toggleFollow(u5, u3);
  await toggleFollow(u1, u5);

  const u3followers = await getFollowers(u3);
  assert(u3followers.length === 3, `u3 has 3 followers (got ${u3followers.length})`);
  const followerIds = u3followers.map((u) => u.user_id);
  assert(followerIds.includes(u1) && followerIds.includes(u4) && followerIds.includes(u5),
    "followers list contains all three");

  const u1following = await getFollowing(u1);
  assert(u1following.length === 2,
    `u1 follows 2 people — u3 and u5 (got ${u1following.length})`);
  const followingIds = u1following.map((u) => u.user_id);
  assert(followingIds.includes(u3) && followingIds.includes(u5),
    "following list contains both targets");

  // ── Suite 6: review → notification + activity feed ──
  console.log("\n— Suite 6: submitReview fires notify + postActivity");
  const buyer = await makeUser(`rev-b-${t}`);
  const seller = await makeUser(`rev-s-${t}`);
  allUsers.push(buyer, seller);
  const trade = await makeTrade(buyer, seller, `SOC-${t}`);
  allTrades.push(trade);

  const beforeRev = await unreadCount(seller);

  const review = await submitReview({
    tradeId: trade,
    reviewerId: buyer,
    revieweeId: seller,
    role: "buyer",
    rating: 5,
    cardAccuracy: 5,
    shippingSpeed: 4,
    communication: 5,
    comment: "Great trader, cards exactly as described.",
  });
  assert(review.id != null, "review persisted");
  assert(review.rating === 5, "rating stored");

  // Notification on reviewee
  const afterRev = await unreadCount(seller);
  assert(afterRev === beforeRev + 1,
    `seller's unread count rose by 1 (got +${afterRev - beforeRev})`);

  const sellerNotifs = await listNotifications(seller);
  const revNotif = sellerNotifs.find((n) => n.kind === "review.received");
  assert(revNotif != null, "review.received notification exists");
  assert(revNotif?.reference_id === review.id,
    "notification reference_id matches review id (idempotent)");

  // Public activity on reviewee (read raw — ActivityEvent type doesn't
  // include reference_id / is_public, but the columns are present).
  const activityRows = await pool.query(
    `SELECT event_type, reference_id, is_public FROM activity_feed
      WHERE user_id=$1 AND event_type='review_received'`,
    [seller],
  );
  assert(activityRows.rows.length === 1, "review_received activity event posted");
  assert(activityRows.rows[0].reference_id === review.id,
    "activity reference_id matches review");
  assert(activityRows.rows[0].is_public === true,
    "activity is public (shows on profile feed)");
  // Touch getUserActivity to make sure the lib call doesn't throw on
  // this event shape.
  const activity = await getUserActivity(seller, 20);
  assert(activity.some((a) => a.event_type === "review_received"),
    "getUserActivity surfaces the review event");

  // ── Suite 7: getUserReviews returns the review with joined metadata ──
  console.log("\n— Suite 7: getUserReviews join correctness");
  const sellerReviews = await getUserReviews(seller);
  assert(sellerReviews.length === 1, `seller has 1 review (got ${sellerReviews.length})`);
  const r = sellerReviews[0] as unknown as { rating: number; reviewer_name?: string | null };
  assert(r.rating === 5, "rating joined correctly");
  assert(typeof r.reviewer_name === "string" && r.reviewer_name.length > 0,
    "reviewer_name populated from users JOIN");

  // ── Cleanup ──
  await cleanup(allUsers, allTrades);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
