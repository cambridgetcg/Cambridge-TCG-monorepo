// E2E for the direct-messaging arc. Eight suites against the lib.
// Direct-lib pattern matching offers/returns/saved-searches.

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
  sendMessage, listConversations, getConversation,
  markConversationRead, setConversationArchived,
  blockUser, unblockUser, isBlockedEither,
  unreadConversationCount, findOrCreateConversation,
} = await import("../src/lib/messages/db");

const { listNotifications } = await import("../src/lib/notifications/db");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name, accepts_messages) VALUES ($1, $2, true) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(
    `DELETE FROM dm_messages
      WHERE conversation_id IN (
        SELECT id FROM dm_conversations
         WHERE user_a_id = ANY($1::uuid[]) OR user_b_id = ANY($1::uuid[])
      )`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM dm_conversations
      WHERE user_a_id = ANY($1::uuid[]) OR user_b_id = ANY($1::uuid[])`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM user_blocks
      WHERE blocker_id = ANY($1::uuid[]) OR blocked_id = ANY($1::uuid[])`,
    [userIds],
  );
  await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];

  // ── Suite 1: sendMessage happy path + canonical conversation ──
  console.log("\n— Suite 1: sendMessage creates canonical conversation");
  const alice = await makeUser(`dm-a-${t}`);
  const bob = await makeUser(`dm-b-${t}`);
  allUsers.push(alice, bob);

  const r1 = await sendMessage({
    senderId: alice, recipientId: bob,
    body: "Hey Bob, got any LP versions of OP01-001?",
  });
  assert(r1.ok, `first message ok (${r1.ok ? "ok" : r1.reason})`);
  if (r1.ok) {
    assert(r1.value.body.includes("LP"), "body persisted");
  }

  // Bob replies — should land in the SAME conversation row.
  const r2 = await sendMessage({
    senderId: bob, recipientId: alice,
    body: "Yes, £6.50, willing to negotiate.",
  });
  assert(r2.ok, "reply ok");

  // Verify single conversation row regardless of who initiated.
  const conv = await pool.query(
    `SELECT COUNT(*)::int AS n FROM dm_conversations
      WHERE (user_a_id, user_b_id) IN (($1,$2), ($2,$1))`,
    [alice, bob],
  );
  assert(conv.rows[0].n === 1, `one canonical conversation row (got ${conv.rows[0].n})`);

  // Both sides see this thread in their inbox.
  const aliceInbox = await listConversations(alice);
  const bobInbox = await listConversations(bob);
  assert(aliceInbox.length === 1, "alice inbox has 1");
  assert(bobInbox.length === 1, "bob inbox has 1");
  assert(aliceInbox[0].other_user_id === bob, "alice's inbox shows bob as other");
  assert(bobInbox[0].other_user_id === alice, "bob's inbox shows alice as other");

  // Conversation cache populated
  assert(aliceInbox[0].message_count === 2, "message_count = 2");
  assert(aliceInbox[0].last_message_preview?.includes("£6.50"),
    "preview shows latest message");

  const buyerNotifs = await listNotifications(bob);
  assert(buyerNotifs.some((n) => n.kind === "message.received"),
    "bob got message.received notification");

  // ── Suite 2: validation rejections ──
  console.log("\n— Suite 2: validation");

  // Self-message
  const self = await sendMessage({
    senderId: alice, recipientId: alice, body: "hi me",
  });
  assert(!self.ok && self.reason.includes("yourself"), "self-message rejected");

  // Empty body
  const empty = await sendMessage({
    senderId: alice, recipientId: bob, body: "   ",
  });
  assert(!empty.ok, "empty body rejected");

  // Over-length body
  const huge = await sendMessage({
    senderId: alice, recipientId: bob, body: "x".repeat(2001),
  });
  assert(!huge.ok && huge.reason.includes("2000"), "over-length rejected");

  // Recipient missing
  const ghost = await sendMessage({
    senderId: alice,
    recipientId: "00000000-0000-0000-0000-000000000000",
    body: "hello?",
  });
  assert(!ghost.ok && ghost.status === 404, "ghost recipient → 404");

  // ── Suite 3: rate limit ──
  console.log("\n— Suite 3: rate limit");
  const charlie = await makeUser(`dm-c-${t}`);
  const dave = await makeUser(`dm-d-${t}`);
  allUsers.push(charlie, dave);

  // Burst of 6 within a minute — 6th should be rejected (cap=5/min)
  for (let i = 0; i < 5; i++) {
    const r = await sendMessage({
      senderId: charlie, recipientId: dave, body: `msg ${i}`,
    });
    assert(r.ok, `burst msg ${i} ok`);
  }
  const sixth = await sendMessage({
    senderId: charlie, recipientId: dave, body: "msg 6",
  });
  assert(!sixth.ok && sixth.status === 429, "6th message in burst → 429");

  // ── Suite 4: accepts_messages opt-out ──
  console.log("\n— Suite 4: accepts_messages=false blocks unsolicited");
  const eve = await makeUser(`dm-e-${t}`);
  allUsers.push(eve);
  await pool.query(
    `UPDATE users SET accepts_messages = false WHERE id = $1`, [eve],
  );

  const blockedByOptOut = await sendMessage({
    senderId: alice, recipientId: eve, body: "hello",
  });
  assert(!blockedByOptOut.ok && blockedByOptOut.status === 403,
    "accepts_messages=false → 403");

  // ── Suite 5: bidirectional block ──
  console.log("\n— Suite 5: block list (bidirectional)");
  const frank = await makeUser(`dm-f-${t}`);
  allUsers.push(frank);

  // alice blocks frank
  const br = await blockUser(alice, frank);
  assert(br.ok, "block ok");

  assert(await isBlockedEither(alice, frank), "isBlockedEither true after block");

  // alice → frank: blocked (alice blocking frank)
  const aliceToFrank = await sendMessage({
    senderId: alice, recipientId: frank, body: "test",
  });
  assert(!aliceToFrank.ok && aliceToFrank.status === 403,
    "alice→frank blocked (alice blocked them)");

  // frank → alice: ALSO blocked (bidirectional)
  const frankToAlice = await sendMessage({
    senderId: frank, recipientId: alice, body: "test",
  });
  assert(!frankToAlice.ok && frankToAlice.status === 403,
    "frank→alice blocked (alice blocked them, bidirectional)");

  // Self-block rejected
  const selfBlock = await blockUser(alice, alice);
  assert(!selfBlock.ok, "self-block rejected");

  // Unblock restores
  await unblockUser(alice, frank);
  assert(!(await isBlockedEither(alice, frank)),
    "isBlockedEither false after unblock");
  const aliceToFrank2 = await sendMessage({
    senderId: alice, recipientId: frank, body: "now we good",
  });
  assert(aliceToFrank2.ok, "send works after unblock");

  // ── Suite 6: markConversationRead ──
  console.log("\n— Suite 6: markConversationRead advances cursor");
  // Use the alice/bob conversation from suite 1. Suite 1 ended with
  // bob as the last sender (he replied), so bob currently has 0
  // unread. Send a fresh alice→bob so bob has something to mark.
  await sendMessage({
    senderId: alice, recipientId: bob, body: "One more thing —",
  });
  const convId = aliceInbox[0].id;

  const before = await unreadConversationCount(bob);
  assert(before === 1, `bob has 1 unread before mark (got ${before})`);

  const mr = await markConversationRead(convId, bob);
  assert(mr.ok, "markRead ok");

  const after = await unreadConversationCount(bob);
  assert(after === 0, `bob has 0 unread after mark (got ${after})`);

  // Non-participant rejected
  const stranger = await markConversationRead(convId, charlie);
  assert(!stranger.ok && stranger.status === 403, "non-participant markRead → 403");

  // ── Suite 7: archive (per-user) ──
  console.log("\n— Suite 7: archive per-user");
  // Alice may also have a convo with frank from suite 5 (block →
  // unblock → send-after-unblock created it). Compare BEFORE/AFTER
  // counts rather than expecting an absolute 0.
  const aliceInboxBefore = await listConversations(alice);
  await setConversationArchived(convId, alice, true);

  const aliceInboxAfter = await listConversations(alice);
  assert(aliceInboxAfter.length === aliceInboxBefore.length - 1,
    `alice's inbox shrank by 1 after archive (got ${aliceInboxBefore.length} → ${aliceInboxAfter.length})`);

  // The bob convo should be GONE from alice's view; bob's view unaffected
  assert(!aliceInboxAfter.some((c) => c.id === convId),
    "archived convo not in alice's inbox");
  const bobInboxAfter = await listConversations(bob);
  assert(bobInboxAfter.some((c) => c.id === convId),
    "convo still in bob's inbox (per-user archive)");

  // New message un-archives both sides
  const wakeup = await sendMessage({
    senderId: bob, recipientId: alice, body: "Still there?",
  });
  assert(wakeup.ok, "wake-up message ok");

  const aliceInboxRevived = await listConversations(alice);
  assert(aliceInboxRevived.some((c) => c.id === convId),
    "alice's archived convo revived by new message (un-archives)");
  assert(aliceInboxRevived.length === aliceInboxBefore.length,
    `alice's inbox count restored after un-archive (${aliceInboxBefore.length} → ${aliceInboxRevived.length})`);

  // ── Suite 8: getConversation thread ──
  console.log("\n— Suite 8: getConversation");
  const thread = await getConversation(convId, alice);
  assert(thread.ok, "getConversation ok");
  if (thread.ok) {
    assert(thread.value.messages.length >= 3,
      `thread has multiple messages (got ${thread.value.messages.length})`);
    // Oldest first
    for (let i = 1; i < thread.value.messages.length; i++) {
      assert(
        new Date(thread.value.messages[i - 1].created_at).getTime() <=
        new Date(thread.value.messages[i].created_at).getTime(),
        `message ${i - 1} ≤ message ${i} by created_at (oldest first)`,
      );
    }
  }

  // Stranger rejected
  const strangerRead = await getConversation(convId, charlie);
  assert(!strangerRead.ok && strangerRead.status === 403,
    "non-participant getConversation → 403");

  // ── Suite 9: findOrCreateConversation idempotent ──
  console.log("\n— Suite 9: findOrCreateConversation");
  const c1 = await findOrCreateConversation(alice, bob);
  const c2 = await findOrCreateConversation(bob, alice);  // reversed args
  assert(c1.id === c2.id, "find-or-create returns same row regardless of arg order");

  // Cleanup
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
