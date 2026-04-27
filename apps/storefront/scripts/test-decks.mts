// E2E for server-side deck persistence.
import pg from "pg";
import type { DeckCardSnapshot } from "../src/lib/decks/db";
const db = await import("../src/lib/decks/db");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const mkCard = (sku: string, name: string, rarity = "C", price = 1): DeckCardSnapshot => ({
  sku, card_number: sku, name, set_code: "OP01", set_name: "OP01 — Romance Dawn",
  rarity, image_url: null, spot_price: price, tradein_credit: null,
});

try {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Deck Test') RETURNING id`,
    [`deck-test-${Date.now()}@test.invalid`],
  );
  const userId: string = u.rows[0].id;

  // 1) Empty list
  const empty = await db.listUserDecks(userId);
  assert(empty.length === 0, "fresh user → empty list");

  // 2) Save one
  const leader = mkCard("OP01-001", "Luffy Leader", "L", 5);
  const d1 = await db.saveDeck({
    userId,
    name: "Red Zoro Aggro",
    leaderSku: leader.sku,
    entries: [
      { sku: leader.sku, quantity: 1, card: leader },
      { sku: "OP01-002", quantity: 4, card: mkCard("OP01-002", "Zoro") },
    ],
  });
  assert(d1.name === "Red Zoro Aggro", "save: name stored");
  assert(d1.slug.startsWith("red-zoro-aggro-"), `save: slug = ${d1.slug}`);
  assert(d1.leader_sku === "OP01-001", "save: leader_sku stored");
  assert(d1.entries.length === 2, "save: 2 entries");
  assert(!d1.is_public, "save: not public by default");

  // 3) Save same name → overwrite same row (legacy behaviour)
  const d1b = await db.saveDeck({
    userId,
    name: "Red Zoro Aggro",
    leaderSku: leader.sku,
    entries: [{ sku: leader.sku, quantity: 1, card: leader }],
  });
  assert(d1b.id === d1.id, "same name: same deck id");
  assert(d1b.entries.length === 1, "same name: entries updated");

  // 4) List
  const listed = await db.listUserDecks(userId);
  assert(listed.length === 1, "list: 1 deck");

  // 5) Get by slug
  const bySlug = await db.getUserDeck(userId, d1.slug);
  assert(bySlug?.id === d1.id, "get by slug works");

  // 6) Get by id
  const byId = await db.getUserDeck(userId, d1.id);
  assert(byId?.slug === d1.slug, "get by id works");

  // 7) Public visibility gate — not public yet
  const unreachable = await db.getPublicDeckBySlug(d1.slug);
  assert(unreachable === null, "getPublicDeckBySlug: null when private");

  // 8) Toggle to public
  const pub = await db.saveDeck({
    userId, existingId: d1.id, name: "Red Zoro Aggro",
    leaderSku: leader.sku, entries: d1b.entries, isPublic: true,
  });
  assert(pub.is_public, "toggled public");

  // 9) Now reachable via public slug
  const publicFetch = await db.getPublicDeckBySlug(d1.slug);
  assert(publicFetch?.id === d1.id, "public slug lookup works");

  // 10) Second deck with different name
  const d2 = await db.saveDeck({
    userId,
    name: "Blue Control",
    leaderSku: null,
    entries: [{ sku: "OP02-050", quantity: 4, card: mkCard("OP02-050", "Crocodile", "SR", 12.5) }],
  });
  assert(d2.slug.startsWith("blue-control-"), `different name → different slug ${d2.slug}`);
  assert(d2.id !== d1.id, "different name → different id");

  // 11) listPublicDecks — only d1 should appear
  const pubList = await db.listPublicDecks();
  const mine = pubList.filter((p) => p.user_id === userId);
  assert(mine.length === 1, "public list: only the public deck");
  assert(mine[0].id === d1.id, "public list: correct deck");

  // 12) Delete by id
  const deleted = await db.deleteDeck(userId, d2.id);
  assert(deleted, "delete by id returns true");
  const afterDel = await db.listUserDecks(userId);
  assert(afterDel.length === 1, "list: 1 deck after delete");

  // 13) Delete nonexistent → false
  const phantom = await db.deleteDeck(userId, "not-a-real-slug");
  assert(!phantom, "delete nonexistent: false");

  // 14) incrementViewCount
  await db.incrementViewCount(d1.slug);
  await db.incrementViewCount(d1.slug);
  const viewed = await db.getUserDeck(userId, d1.id);
  assert(viewed?.view_count === 2, `view count = 2 (got ${viewed?.view_count})`);

  // Cleanup
  await pool.query(`DELETE FROM user_decks WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
