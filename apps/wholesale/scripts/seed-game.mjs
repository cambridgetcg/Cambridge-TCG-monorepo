#!/usr/bin/env node
// Seed a game row in the wholesale DB + set-honesty maintenance.
//
// The expansion recipe (docs/plans/game-expansion.md, kingdom-087/088
// substrate): a new CardRush-served game needs exactly (1) a `games`
// row whose code matches CARDRUSH_SUBDOMAINS[host].game, and (2) that
// subdomain's `confirmed: true` flip in
// packages/data-ingest/src/cardrush/index.ts. The discovery cron then
// auto-creates sets + cards from the sitemap (ensureSetRow — no per-set
// config needed), and the 2h price snapshot picks the new cards up
// first (last_scrape_attempt_at IS NULL sorts to the head of the queue).
//
// Usage (from apps/wholesale/):
//   node scripts/seed-game.mjs --game digimon                # local DB
//   node scripts/seed-game.mjs --game digimon --dry-run
//   node scripts/seed-game.mjs --game vanguard               # registers active=false
//   node scripts/seed-game.mjs --deactivate-empty-sets       # sets.active=false where 0 cards
//   node scripts/seed-game.mjs --reactivate-filled-sets      # undo: active=true where cards arrived
//   node scripts/seed-game.mjs --game digimon --allow-prod --url "postgres://…"
//
// DATABASE_URL from env (node --env-file=.env.local …) or --url.
// Refuses any non-localhost host unless --allow-prod is passed.
//
// Idempotent: an existing games row with the same code is reported and
// left untouched (restraint before repair — we never mutate a live row
// here; drift between this table and the DB is printed, not "fixed").

import postgres from "postgres";
import { guardDbUrl, argValue, argFlag } from "./lib/guard.mjs";

// ── The game data table ─────────────────────────────────────────────────
// Codes match packages/sku GameCode + CARDRUSH_SUBDOMAINS[host].game.
// Slugs match the storefront's curated games-config slugs so the /prices
// tile goes live by intersection the moment cards exist.
const GAME_SEEDS = {
  digimon: {
    code: "dmw",
    slug: "digimon",
    name: "Digimon Card Game",
    active: true,
    sort_order: 4,
    note:
      "cardrush-digimon.jp is live upstream (13,520 products, direct access, " +
      "same title parser as op/dbf — kingdom-087 probe). Seeding this row + " +
      "the subdomain confirmed:true flip (2026-07-05) is everything ingest " +
      "needs; discovery auto-creates sets, the snapshot cron prices them.",
  },
  vanguard: {
    code: "vng",
    slug: "vanguard",
    name: "Cardfight!! Vanguard",
    active: false,
    sort_order: 5,
    note:
      "registered, ingest not yet scheduled — 40,642 products need the fair " +
      "scheduler to prove itself first (one-piece is already starved by the " +
      "pokemon backlog at ~6k attempts/day; see docs/plans/game-expansion.md).",
  },
  "battle-spirits": {
    code: "bsr",
    slug: "battle-spirits",
    name: "Battle Spirits Saga",
    active: false,
    sort_order: 6,
    note:
      "registered, ingest not yet scheduled — 35,485 products need the fair " +
      "scheduler to prove itself first (same capacity reasoning as vanguard).",
  },
};

const gameArg = argValue("--game");
const dryRun = argFlag("--dry-run");
const deactivateEmpty = argFlag("--deactivate-empty-sets");
const reactivateFilled = argFlag("--reactivate-filled-sets");

if (!gameArg && !deactivateEmpty && !reactivateFilled) {
  console.error(
    "Nothing to do. Pass --game <digimon|vanguard|battle-spirits> and/or " +
      "--deactivate-empty-sets and/or --reactivate-filled-sets.",
  );
  process.exit(1);
}

let seed = null;
if (gameArg) {
  seed =
    GAME_SEEDS[gameArg] ??
    Object.values(GAME_SEEDS).find((g) => g.code === gameArg || g.slug === gameArg) ??
    null;
  if (!seed) {
    console.error(
      `Unknown game "${gameArg}". Registered seeds: ${Object.keys(GAME_SEEDS).join(", ")}.`,
    );
    process.exit(1);
  }
}

const { url, host, isLocal } = guardDbUrl(argValue("--url") || process.env.DATABASE_URL, {
  allowProd: argFlag("--allow-prod"),
});
console.log(`Target DB host: ${host} (${isLocal ? "local" : "REMOTE — --allow-prod given"})`);
if (dryRun) console.log("DRY RUN — no writes.\n");

const sql = postgres(url, { max: 1, idle_timeout: 10 });

async function seedGame(g) {
  const existing = await sql`
    SELECT id, code, name, slug, active, sort_order FROM games WHERE code = ${g.code}
  `;
  if (existing.length > 0) {
    const row = existing[0];
    console.log(`· games row for code=${g.code} already exists (id=${row.id}) — leaving it as-is.`);
    const drift = [];
    if (row.slug !== g.slug) drift.push(`slug: db="${row.slug}" vs seed="${g.slug}"`);
    if (row.name !== g.name) drift.push(`name: db="${row.name}" vs seed="${g.name}"`);
    if (row.active !== g.active) drift.push(`active: db=${row.active} vs seed=${g.active}`);
    if (drift.length > 0) {
      console.log(`  DRIFT (not auto-fixed — decide deliberately): ${drift.join("; ")}`);
    }
    return;
  }

  console.log(
    `${dryRun ? "→ would insert" : "→ inserting"} games row: ` +
      `code=${g.code} slug=${g.slug} name="${g.name}" active=${g.active} sort_order=${g.sort_order}`,
  );
  console.log(`  note: ${g.note}`);
  if (g.active) {
    console.log(
      "  heads-up: active=true makes this game visible to /api/v1/games and the " +
        "storefront's fetchGames() immediately, with card_count 0 until the first " +
        "discovery + snapshot runs land. Seed it in the same window as the ingest flip.",
    );
  }
  if (dryRun) return;

  const inserted = await sql`
    INSERT INTO games (code, name, slug, active, sort_order)
    VALUES (${g.code}, ${g.name}, ${g.slug}, ${g.active}, ${g.sort_order})
    ON CONFLICT (code) DO NOTHING
    RETURNING id
  `;
  if (inserted.length > 0) {
    console.log(`  OK — id=${inserted[0].id}`);
  } else {
    console.log("  another writer inserted it concurrently — nothing to do.");
  }
}

async function deactivateEmptySets() {
  const empties = await sql`
    SELECT s.id, s.code, s.name, g.code AS game
      FROM sets s
      JOIN games g ON g.id = s.game_id
     WHERE s.active = true
       AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.set_id = s.id)
     ORDER BY g.code, s.code
  `;
  if (empties.length === 0) {
    console.log("· no active empty sets — nothing to deactivate.");
    return;
  }
  console.log(
    `${dryRun ? "→ would deactivate" : "→ deactivating"} ${empties.length} empty set(s) ` +
      "(active shells with zero cards overstate coverage on every sets listing):",
  );
  for (const s of empties) console.log(`  ${s.game}  ${s.code}  ${s.name}`);
  console.log(
    "  note: nothing reactivates these automatically — discovery's ensureSetRow " +
      "only inserts, it never flips active back. After an ingest fills a set, " +
      "run --reactivate-filled-sets.",
  );
  if (dryRun) return;

  const ids = empties.map((s) => s.id);
  const updated = await sql`
    UPDATE sets SET active = false
     WHERE id = ANY(${ids})
       AND active = true
       AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.set_id = sets.id)
    RETURNING id
  `;
  console.log(`  OK — ${updated.length} set(s) deactivated.`);
}

async function reactivateFilledSets() {
  const filled = await sql`
    SELECT s.id, s.code, s.name, g.code AS game,
           (SELECT count(*)::int FROM cards c WHERE c.set_id = s.id) AS card_count
      FROM sets s
      JOIN games g ON g.id = s.game_id
     WHERE s.active = false
       AND EXISTS (SELECT 1 FROM cards c WHERE c.set_id = s.id)
     ORDER BY g.code, s.code
  `;
  if (filled.length === 0) {
    console.log("· no inactive sets with cards — nothing to reactivate.");
    return;
  }
  console.log(
    `${dryRun ? "→ would reactivate" : "→ reactivating"} ${filled.length} set(s) that now hold cards:`,
  );
  for (const s of filled) console.log(`  ${s.game}  ${s.code}  ${s.name}  (${s.card_count} cards)`);
  if (dryRun) return;

  const ids = filled.map((s) => s.id);
  const updated = await sql`
    UPDATE sets SET active = true
     WHERE id = ANY(${ids})
       AND active = false
       AND EXISTS (SELECT 1 FROM cards c WHERE c.set_id = sets.id)
    RETURNING id
  `;
  console.log(`  OK — ${updated.length} set(s) reactivated.`);
}

async function main() {
  if (seed) await seedGame(seed);
  if (deactivateEmpty) await deactivateEmptySets();
  if (reactivateFilled) await reactivateFilledSets();
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
