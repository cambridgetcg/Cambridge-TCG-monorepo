#!/usr/bin/env node
// restock-card-sets.mjs — refill the storefront's universal shelves from
// the wholesale catalog.
//
// The storefront's card_sets / card_set_cards tables are the substrate
// behind /api/v1/universal/games, /universal/sets/*, /universal/set/*,
// /universal/card/* and /data/catalog.jsonl. Verified 2026-07-05: the
// production storefront held 0 rows while the wholesale DB held 11,430
// cards — every universal door opened onto an empty shelf. This script
// is the restock:
//
//   READS  the wholesale DB:  games → sets → cards  (skips empty sets)
//   WRITES the storefront DB: card_sets + card_set_cards
//
// Write semantics mirror importSetMaster in src/lib/portfolio/sets.ts —
// the same ON CONFLICT upserts keyed on (set_code) and (set_code,
// card_number, variant), the same COALESCE preservation of existing
// released_at / cover_image_url / image_url, the same total_cards
// refresh at the end — so a set restocked here is indistinguishable
// from one imported through the admin route. Idempotent: re-running
// refreshes the same rows. Card inserts are batched (multi-row VALUES)
// rather than row-per-round-trip.
//
// SAFETY: refuses to write to any non-localhost storefront DB unless
// --allow-prod is passed explicitly. Reading wholesale from a remote
// host is always allowed (reads are the point); writing production is
// a deliberate, flagged act.
//
// Usage:
//   node scripts/restock-card-sets.mjs                       # local → local
//   node scripts/restock-card-sets.mjs --dry-run             # read + report, no writes
//   node scripts/restock-card-sets.mjs --game op             # one game only
//   WHOLESALE_DATABASE_URL=... DATABASE_URL=... \
//     node scripts/restock-card-sets.mjs --allow-prod        # production restock
//
// Env (both .trim()'d — Vercel whitespace discipline):
//   WHOLESALE_DATABASE_URL  read side  (default postgres://localhost:5432/ctcg_wholesale_dev)
//   DATABASE_URL            write side (default postgres://localhost:5432/ctcg_dev)

import pg from "pg";

// ── args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const ALLOW_PROD = argv.includes("--allow-prod");
const DRY_RUN = argv.includes("--dry-run");
const gameIdx = argv.indexOf("--game");
const ONLY_GAME = gameIdx >= 0 ? (argv[gameIdx + 1] ?? "").toLowerCase() : null;

function cleanUrl(raw) {
  // Match the app's SSL handling: strip sslmode from the URL; decide ssl
  // options from the host instead.
  return raw.trim().replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
}

const WHOLESALE_URL = cleanUrl(
  process.env.WHOLESALE_DATABASE_URL ||
    "postgres://localhost:5432/ctcg_wholesale_dev",
);
const STOREFRONT_URL = cleanUrl(
  process.env.DATABASE_URL || "postgres://localhost:5432/ctcg_dev",
);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(url, label) {
  try {
    return new URL(url).hostname;
  } catch {
    console.error(`Refusing to run: cannot parse ${label} database URL.`);
    process.exit(1);
  }
}

const storefrontHost = hostOf(STOREFRONT_URL, "storefront (write)");
const wholesaleHost = hostOf(WHOLESALE_URL, "wholesale (read)");
const storefrontIsLocal = LOCAL_HOSTS.has(storefrontHost);

if (!storefrontIsLocal && !ALLOW_PROD) {
  console.error(
    `Refusing to WRITE to non-localhost storefront DB host "${storefrontHost}".\n` +
      `This is the production shelf. If you mean it, pass --allow-prod.`,
  );
  process.exit(1);
}

function makePool(url, host) {
  return new pg.Pool({
    connectionString: url,
    // Matches the app's SSL fix (apps/storefront/CLAUDE.md): strip
    // sslmode from the URL, connect with rejectUnauthorized: false for
    // remote (RDS) hosts; plain TCP for localhost.
    ssl: LOCAL_HOSTS.has(host) ? undefined : { rejectUnauthorized: false },
  });
}

const wholesale = makePool(WHOLESALE_URL, wholesaleHost);
const storefront = makePool(STOREFRONT_URL, storefrontHost);

// ── read side: wholesale games → sets → cards ────────────────────────────

async function readWholesaleCatalog() {
  // One query: every card joined to its set + game. Sets with zero cards
  // never appear (the join is the skip-empty-sets rule); inactive games
  // and sets are excluded — the storefront mirror shows the living
  // catalog.
  const r = await wholesale.query(
    `SELECT
       g.code           AS game_code,
       s.code           AS set_code,
       s.name           AS set_name,
       s.release_date   AS release_date,
       s.tcgdex_logo_url AS set_logo_url,
       c.card_number,
       c.sku,
       COALESCE(NULLIF(c.name_en, ''), NULLIF(c.name, ''), c.card_number) AS card_name,
       c.rarity,
       c.image_url,
       c.product_type
     FROM cards c
     JOIN sets  s ON s.id = c.set_id
     JOIN games g ON g.id = s.game_id
     WHERE COALESCE(s.active, true) = true
       AND COALESCE(g.active, true) = true
       AND c.sku IS NOT NULL AND c.sku <> ''
       AND c.card_number IS NOT NULL AND c.card_number <> ''
     ORDER BY g.code, s.code, c.card_number`,
  );
  return r.rows;
}

// ── write side: importSetMaster semantics, batched ───────────────────────

const CARD_BATCH = 500;

async function upsertSet(client, set) {
  // Same SQL shape as importSetMaster (src/lib/portfolio/sets.ts:100-111).
  await client.query(
    `INSERT INTO card_sets (set_code, game, set_name, released_at, cover_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (set_code) DO UPDATE
       SET set_name = EXCLUDED.set_name,
           game = EXCLUDED.game,
           released_at = COALESCE(EXCLUDED.released_at, card_sets.released_at),
           cover_image_url = COALESCE(EXCLUDED.cover_image_url, card_sets.cover_image_url),
           updated_at = NOW()`,
    [set.set_code, set.game, set.set_name, set.released_at, set.cover_image_url],
  );
}

async function upsertCardsBatch(client, setCode, cards) {
  // Multi-row VALUES with the same ON CONFLICT semantics as
  // importSetMaster (sets.ts:118-129), including image_url COALESCE
  // preservation. Returns how many rows were fresh inserts (xmax = 0).
  const values = [];
  const params = [];
  let p = 1;
  for (const c of cards) {
    values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
    params.push(
      setCode,
      c.card_number,
      c.sku,
      c.card_name,
      c.rarity ?? null,
      c.image_url ?? null,
      c.variant ?? "",
    );
  }
  const r = await client.query(
    `INSERT INTO card_set_cards
       (set_code, card_number, sku, card_name, rarity, image_url, variant)
     VALUES ${values.join(", ")}
     ON CONFLICT (set_code, card_number, variant) DO UPDATE
       SET sku = EXCLUDED.sku,
           card_name = EXCLUDED.card_name,
           rarity = EXCLUDED.rarity,
           image_url = COALESCE(EXCLUDED.image_url, card_set_cards.image_url)
     RETURNING (xmax = 0) AS was_insert`,
    params,
  );
  return r.rows.filter((row) => row.was_insert).length;
}

async function refreshTotal(client, setCode) {
  // Same total_cards refresh as importSetMaster (sets.ts:135-141).
  const r = await client.query(
    `UPDATE card_sets
        SET total_cards = (SELECT COUNT(*) FROM card_set_cards WHERE set_code = $1),
            updated_at = NOW()
      WHERE set_code = $1
      RETURNING total_cards`,
    [setCode],
  );
  return r.rows[0]?.total_cards ?? 0;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`read  ← wholesale  ${wholesaleHost} ${ONLY_GAME ? `(game=${ONLY_GAME})` : ""}`);
  console.log(
    `write → storefront ${storefrontHost}${storefrontIsLocal ? "" : "  [--allow-prod]"}${DRY_RUN ? "  [DRY RUN — no writes]" : ""}`,
  );

  const rows = await readWholesaleCatalog();

  // Group by set. SKU is UNIQUE in card_set_cards, and the wholesale
  // catalog can carry the same (set, number) across variants — derive a
  // variant tag from the SKU tail beyond the base (game-set-number) so
  // the (set_code, card_number, variant) key stays collision-free, the
  // same convention the canonical SKU format uses.
  const bySets = new Map();
  const seenSkus = new Set();
  let skippedDupSku = 0;

  for (const row of rows) {
    const game = String(row.game_code).toLowerCase();
    if (ONLY_GAME && game !== ONLY_GAME) continue;
    if (seenSkus.has(row.sku)) {
      skippedDupSku++;
      continue;
    }
    seenSkus.add(row.sku);

    const setCode = String(row.set_code);
    if (!bySets.has(setCode)) {
      bySets.set(setCode, {
        set: {
          set_code: setCode,
          game,
          set_name: String(row.set_name ?? setCode).slice(0, 120),
          released_at: row.release_date ? String(row.release_date).slice(0, 10) : null,
          cover_image_url: row.set_logo_url ?? null,
        },
        cards: [],
        variants: new Map(), // (card_number → count) for variant derivation
      });
    }
    const bucket = bySets.get(setCode);

    // Variant tag: text on the SKU after "<game>-<set>-<number>" (e.g.
    // "-ja", "-ja-alt", "-p1"). Base variant is "".
    const skuLower = String(row.sku).toLowerCase();
    const base = `${game}-${setCode.toLowerCase()}-${String(row.card_number).toLowerCase()}`;
    let variant = "";
    if (skuLower.startsWith(base) && skuLower.length > base.length) {
      variant = skuLower.slice(base.length).replace(/^-/, "").slice(0, 40);
    }
    // Guarantee key uniqueness even when the SKU convention doesn't
    // parse: suffix a counter on collision within (set, number, variant).
    const key = `${row.card_number}::${variant}`;
    const n = bucket.variants.get(key) ?? 0;
    bucket.variants.set(key, n + 1);
    if (n > 0) variant = variant ? `${variant}-${n + 1}` : `v${n + 1}`;

    bucket.cards.push({
      card_number: String(row.card_number).slice(0, 30),
      sku: String(row.sku).slice(0, 60),
      card_name: String(row.card_name).slice(0, 200),
      rarity: row.rarity ? String(row.rarity).slice(0, 20) : null,
      image_url: row.image_url ?? null,
      variant,
    });
  }

  const setCodes = Array.from(bySets.keys()).sort();
  console.log(
    `\nwholesale catalog: ${rows.length} card rows → ${seenSkus.size} unique SKUs across ${setCodes.length} non-empty sets` +
      (skippedDupSku ? ` (${skippedDupSku} duplicate-SKU rows skipped)` : ""),
  );

  if (setCodes.length === 0) {
    console.log("Nothing to restock.");
    return;
  }

  let grandInserted = 0;
  let grandTotal = 0;

  for (const setCode of setCodes) {
    const { set, cards } = bySets.get(setCode);
    if (DRY_RUN) {
      console.log(`  [dry] ${set.game.padEnd(6)} ${setCode.padEnd(12)} ${String(cards.length).padStart(5)} cards  "${set.set_name}"`);
      grandTotal += cards.length;
      continue;
    }

    const client = await storefront.connect();
    try {
      // Per-set transaction — a set lands whole or not at all, matching
      // the house rule (transaction() for multi-statement writes).
      await client.query("BEGIN");
      await upsertSet(client, set);
      let inserted = 0;
      for (let i = 0; i < cards.length; i += CARD_BATCH) {
        inserted += await upsertCardsBatch(client, setCode, cards.slice(i, i + CARD_BATCH));
      }
      const total = await refreshTotal(client, setCode);
      await client.query("COMMIT");
      grandInserted += inserted;
      grandTotal += total;
      console.log(
        `  ${set.game.padEnd(6)} ${setCode.padEnd(12)} ${String(total).padStart(5)} cards (${inserted} new)  "${set.set_name}"`,
      );
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`  FAILED ${setCode}: ${err.message} — set rolled back; continuing.`);
    } finally {
      client.release();
    }
  }

  console.log(
    DRY_RUN
      ? `\ndry run complete: ${grandTotal} cards across ${setCodes.length} sets would be upserted.`
      : `\nrestock complete: ${grandTotal} cards on the shelves across ${setCodes.length} sets (${grandInserted} newly inserted this run).`,
  );
  if (!DRY_RUN) {
    console.log(
      "verify: /api/v1/universal/games and /data/catalog.jsonl now serve the mirror.",
    );
  }
}

main()
  .catch((err) => {
    console.error("restock failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await wholesale.end().catch(() => {});
    await storefront.end().catch(() => {});
  });
