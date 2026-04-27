// E2E for set-progress / collector completion tracking.
//
// Seven suites covering the canonical TCG-collector workflow:
//   1. importSetMaster validation + idempotency
//   2. Per-set progress math (owned / total / completion %)
//   3. by-rarity breakdown
//   4. Variant-loose vs variants-strict counting
//   5. Detail checklist (owned + missing) ordering
//   6. Multi-set overview rollup
//   7. Edge cases: unknown set, empty user

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const {
  importSetMaster, getSetProgress, getSetDetail,
  listSetsWithProgress, listAllSets,
} = await import("../src/lib/portfolio/sets");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function ownCard(userId: string, sku: string, qty = 1, name = "Card") {
  await pool.query(
    `INSERT INTO portfolio_cards (user_id, sku, card_name, quantity, condition)
     VALUES ($1, $2, $3, $4, 'NM')
     ON CONFLICT (user_id, sku, condition) DO UPDATE SET quantity = $4`,
    [userId, sku, name, qty],
  );
}

async function cleanup(userIds: string[], setCodes: string[]) {
  await pool.query(`DELETE FROM portfolio_cards WHERE user_id = ANY($1::uuid[])`, [userIds]);
  if (setCodes.length > 0) {
    await pool.query(`DELETE FROM card_set_cards WHERE set_code = ANY($1::text[])`, [setCodes]);
    await pool.query(`DELETE FROM card_sets WHERE set_code = ANY($1::text[])`, [setCodes]);
  }
  await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];
  const allSets: string[] = [`TST-${t}`, `TST2-${t}`, `EMPT-${t}`];

  // ── Suite 1: importSetMaster ──
  console.log("\n— Suite 1: importSetMaster validation + idempotency");

  // Empty cards array → 400
  const empty = await importSetMaster({
    setCode: `TST-${t}`, setName: "Test Set", game: "test",
    cards: [],
  });
  assert(!empty.ok && empty.status === 400, "empty cards array rejected");

  // Missing setName → 400
  const noName = await importSetMaster({
    setCode: `TST-${t}`, setName: "", game: "test",
    cards: [{ card_number: "001", sku: "X", card_name: "X" }],
  });
  assert(!noName.ok, "missing setName rejected");

  // Valid import — 6 cards across 3 rarities
  const r1 = await importSetMaster({
    setCode: `TST-${t}`,
    setName: "Test Set",
    game: "test",
    releasedAt: "2026-01-15",
    cards: [
      { card_number: "001", sku: `TST-${t}-001`, card_name: "Common Card 1", rarity: "C" },
      { card_number: "002", sku: `TST-${t}-002`, card_name: "Common Card 2", rarity: "C" },
      { card_number: "003", sku: `TST-${t}-003`, card_name: "Uncommon Card", rarity: "UC" },
      { card_number: "004", sku: `TST-${t}-004`, card_name: "Rare Card 1", rarity: "R" },
      { card_number: "005", sku: `TST-${t}-005`, card_name: "Rare Card 2", rarity: "R" },
      { card_number: "006", sku: `TST-${t}-006`, card_name: "Super Rare", rarity: "SR" },
    ],
  });
  assert(r1.ok, `import ok (${r1.ok ? "ok" : r1.reason})`);
  if (r1.ok) {
    assert(r1.value.inserted === 6, `6 cards inserted (got ${r1.value.inserted})`);
    assert(r1.value.total === 6, "total_cards = 6");
  }

  // Re-import (idempotent) — 0 new inserts
  const r2 = await importSetMaster({
    setCode: `TST-${t}`,
    setName: "Test Set Renamed",  // updated
    game: "test",
    cards: [
      { card_number: "001", sku: `TST-${t}-001`, card_name: "Common Card 1", rarity: "C" },
      { card_number: "002", sku: `TST-${t}-002`, card_name: "Common Card 2", rarity: "C" },
    ],
  });
  assert(r2.ok && r2.value.inserted === 0, "re-import is idempotent (0 new)");

  // Set name updated by re-import
  const setRow = await pool.query(`SELECT set_name FROM card_sets WHERE set_code = $1`, [`TST-${t}`]);
  assert(setRow.rows[0].set_name === "Test Set Renamed", "set_name updated on re-import");

  // ── Suite 2: getSetProgress math ──
  console.log("\n— Suite 2: per-set progress math");

  const u1 = await makeUser(`set-${t}-1`);
  allUsers.push(u1);

  // No cards owned → 0% completion
  const empty1 = await getSetProgress(u1, `TST-${t}`);
  assert(empty1.ok, "empty progress lookup ok");
  if (empty1.ok) {
    assert(empty1.value.owned_unique === 0, "0 owned");
    assert(empty1.value.completion_pct === 0, "0% complete");
    assert(empty1.value.total_cards === 6, "denominator = 6");
  }

  // Own 3 of 6 → 50%
  await ownCard(u1, `TST-${t}-001`, 1);
  await ownCard(u1, `TST-${t}-003`, 2);  // 2 copies of one card
  await ownCard(u1, `TST-${t}-004`, 1);

  const half = await getSetProgress(u1, `TST-${t}`);
  if (half.ok) {
    assert(half.value.owned_unique === 3, `owned_unique = 3 (got ${half.value.owned_unique})`);
    assert(half.value.completion_pct === 50, `50% complete (got ${half.value.completion_pct})`);
    assert(half.value.owned_copies === 4,
      `4 total copies (1+2+1 = 4) (got ${half.value.owned_copies})`);
  }

  // Own all 6 → 100%
  await ownCard(u1, `TST-${t}-002`);
  await ownCard(u1, `TST-${t}-005`);
  await ownCard(u1, `TST-${t}-006`);

  const full = await getSetProgress(u1, `TST-${t}`);
  if (full.ok) {
    assert(full.value.owned_unique === 6, "owned_unique = 6 at completion");
    assert(full.value.completion_pct === 100, "100% complete");
  }

  // ── Suite 3: by-rarity breakdown ──
  console.log("\n— Suite 3: by-rarity breakdown");

  const u3 = await makeUser(`set-${t}-3`);
  allUsers.push(u3);
  await ownCard(u3, `TST-${t}-001`);  // 1 of 2 commons
  await ownCard(u3, `TST-${t}-003`);  // 1 of 1 UC
  // 0 of 2 rares; 0 of 1 SR

  const byR = await getSetProgress(u3, `TST-${t}`);
  if (byR.ok) {
    const byRarity = byR.value.by_rarity;
    const c = byRarity.find((b) => b.rarity === "C");
    const uc = byRarity.find((b) => b.rarity === "UC");
    const r = byRarity.find((b) => b.rarity === "R");
    const sr = byRarity.find((b) => b.rarity === "SR");
    assert(c?.owned === 1 && c?.total === 2, "C: 1/2");
    assert(uc?.owned === 1 && uc?.total === 1, "UC: 1/1");
    assert(r?.owned === 0 && r?.total === 2, "R: 0/2");
    assert(sr?.owned === 0 && sr?.total === 1, "SR: 0/1");
  }

  // ── Suite 4: variants-loose vs strict ──
  console.log("\n— Suite 4: variants-loose default vs variants-strict");

  // Add an alt-art variant of card 001 to the master
  await importSetMaster({
    setCode: `TST-${t}`,
    setName: "Test Set Renamed",
    game: "test",
    cards: [
      // Variant of an existing card_number; same number, different sku
      { card_number: "001", sku: `TST-${t}-001-AA`, card_name: "Common Card 1 (Alt Art)", rarity: "C", variant: "AA" },
    ],
  });

  // u3 owns only the base "001" sku, not the alt art.
  // Variants-loose: card 001 is "owned" → owned_unique unchanged
  const loose = await getSetProgress(u3, `TST-${t}`, { variantsStrict: false });
  if (loose.ok) {
    assert(loose.value.owned_unique === 2,
      `variants-loose: still 2 owned (base 001 + UC) (got ${loose.value.owned_unique})`);
  }

  // Variants-strict: each (number, variant) counted separately.
  // Master now has 7 entries (was 6 + the alt art variant).
  // u3 owns 2 distinct (number, variant) pairs.
  const strict = await getSetProgress(u3, `TST-${t}`, { variantsStrict: true });
  if (strict.ok) {
    assert(strict.value.total_cards === 7,
      `variants-strict total = 7 (6 + 1 alt art) (got ${strict.value.total_cards})`);
    assert(strict.value.owned_unique === 2, "still 2 owned (base + UC, no alt art)");
  }

  // ── Suite 5: getSetDetail checklist ──
  console.log("\n— Suite 5: detail checklist with ordering + ownership flags");

  const detail = await getSetDetail(u1, `TST-${t}`);
  assert(detail.ok, "detail ok");
  if (detail.ok) {
    // 7 rows now (6 + alt art)
    assert(detail.value.cards.length === 7, `7 cards in checklist (got ${detail.value.cards.length})`);

    // Ordered by card_number then variant ASC
    for (let i = 1; i < detail.value.cards.length; i++) {
      const prev = detail.value.cards[i - 1];
      const curr = detail.value.cards[i];
      const prevKey = `${prev.card_number}_${prev.variant}`;
      const currKey = `${curr.card_number}_${curr.variant}`;
      assert(prevKey <= currKey,
        `row ${i - 1} (${prevKey}) ≤ row ${i} (${currKey})`);
    }

    // u1 owns all base cards (suite 2). Alt art is NOT owned.
    const altArt = detail.value.cards.find((c) => c.variant === "AA");
    assert(altArt?.is_owned === false, "alt art shows as not-owned for u1");

    // Card 003: u1 owns 2 copies
    const card003 = detail.value.cards.find((c) => c.card_number === "003" && c.variant === "");
    assert(card003?.owned_count === 2, `card 003 shows owned_count = 2`);
    assert(card003?.is_owned === true, "card 003 is_owned = true");
  }

  // ── Suite 6: listSetsWithProgress overview ──
  console.log("\n— Suite 6: multi-set overview");

  // Create a second set with different game
  await importSetMaster({
    setCode: `TST2-${t}`,
    setName: "Test Set Two",
    game: "other",
    cards: [
      { card_number: "001", sku: `TST2-${t}-001`, card_name: "Other Card", rarity: "C" },
    ],
  });

  // u1 doesn't own anything from TST2
  const allMine = await listSetsWithProgress(u1);
  const tstFirst = allMine.find((s) => s.set_code === `TST-${t}`);
  const tstSecond = allMine.find((s) => s.set_code === `TST2-${t}`);
  assert(tstFirst != null && tstSecond != null,
    "both sets in overview");
  assert(tstFirst!.completion_pct === 100, "TST is 100% for u1");
  assert(tstSecond!.owned_unique === 0, "TST2 has 0 owned for u1");

  // game filter
  const onlyTest = await listSetsWithProgress(u1, { game: "test" });
  assert(onlyTest.every((s) => s.game === "test"),
    "game=test filter excludes other games");

  // minOwned filter — only "collecting"
  const collecting = await listSetsWithProgress(u1, { minOwned: 1 });
  assert(collecting.length === 1 && collecting[0].set_code === `TST-${t}`,
    "minOwned=1 excludes sets with 0 owned");

  // ── Suite 7: edge cases ──
  console.log("\n— Suite 7: edge cases");

  const ghost = await getSetProgress(u1, "DOES-NOT-EXIST");
  assert(!ghost.ok && ghost.status === 404, "unknown set → 404");

  // Empty set (master with no cards)
  await pool.query(
    `INSERT INTO card_sets (set_code, game, set_name, total_cards) VALUES ($1, 'test', 'Empty', 0)`,
    [`EMPT-${t}`],
  );
  const emptyRes = await getSetProgress(u1, `EMPT-${t}`);
  if (emptyRes.ok) {
    assert(emptyRes.value.total_cards === 0, "empty set total = 0");
    assert(emptyRes.value.completion_pct === 0,
      `empty set completion = 0% (avoids divide-by-zero) (got ${emptyRes.value.completion_pct})`);
  }

  // Lib-level listAllSets
  const all = await listAllSets("test");
  assert(all.some((s) => s.set_code === `TST-${t}`), "listAllSets returns test sets");
  assert(all.every((s) => s.game === "test"), "listAllSets game filter works");

  // ── Cleanup ──
  await cleanup(allUsers, allSets);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
