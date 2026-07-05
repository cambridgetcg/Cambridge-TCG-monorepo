#!/usr/bin/env node
// Seed the LOCAL wholesale database with a small living catalog so local
// dev shows a real market: 2 One Piece sets (OP01, OP02), ~30 cards with
// plausible JPY/GBP prices, and condition_prices snapshot rows.
//
// LOCAL ONLY. The script refuses to run against any non-localhost database
// host — it exists to make dev environments breathe, never to write to
// production. Idempotent: every insert is an upsert; re-running refreshes
// the same rows.
//
// Usage:
//   node scripts/seed-dev-catalog.mjs
//   WHOLESALE_DATABASE_URL="postgres://localhost:5432/ctcg_wholesale_dev" node scripts/seed-dev-catalog.mjs
//   node scripts/seed-dev-catalog.mjs --url "postgres://localhost:5432/ctcg_wholesale_dev"

import pg from "pg";

// ── args / target ────────────────────────────────────────────────────────

const urlArgIdx = process.argv.indexOf("--url");
const argUrl = urlArgIdx >= 0 ? process.argv[urlArgIdx + 1] : null;
const rawUrl = (
  argUrl ||
  process.env.WHOLESALE_DATABASE_URL ||
  "postgres://localhost:5432/ctcg_wholesale_dev"
).trim();

// Match the app's SSL handling (scripts/migrate.mjs): strip sslmode.
// No ssl option below — this script only ever talks to local Postgres.
const cleanedUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
let host;
try {
  host = new URL(cleanedUrl).hostname;
} catch {
  console.error(`Refusing to run: cannot parse database URL host.`);
  process.exit(1);
}
if (!LOCAL_HOSTS.has(host)) {
  console.error(
    `Refusing to run: database host "${host}" is not localhost. ` +
    `This script seeds dev fixtures only.`,
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: cleanedUrl });

// ── fixture data ─────────────────────────────────────────────────────────

const GAME = { code: "op", name: "One Piece Card Game", slug: "one-piece" };

const SETS = [
  { code: "OP01", name: "Romance Dawn", release_date: "2022-12-02", sort_order: 1 },
  { code: "OP02", name: "Paramount War", release_date: "2023-03-10", sort_order: 2 },
];

const GBP_JPY_RATE = 185.42;

// [card_number, name_en, name (JP), rarity, cardrush_jpy, stock]
const CARDS = {
  OP01: [
    ["OP01-001", "Roronoa Zoro", "ロロノア・ゾロ", "L", 380, 6],
    ["OP01-002", "Trafalgar Law", "トラファルガー・ロー", "L", 480, 4],
    ["OP01-003", "Monkey.D.Luffy", "モンキー・D・ルフィ", "L", 350, 8],
    ["OP01-006", "Otama", "お玉", "C", 30, 24],
    ["OP01-013", "Karoo", "カルー", "C", 40, 18],
    ["OP01-016", "Nami", "ナミ", "R", 150, 9],
    ["OP01-024", "Bonney", "ジュエリー・ボニー", "R", 90, 12],
    ["OP01-025", "Roronoa Zoro", "ロロノア・ゾロ", "SR", 1480, 3],
    ["OP01-029", "Sanji", "サンジ", "R", 220, 7],
    ["OP01-033", "Brook", "ブルック", "C", 50, 15],
    ["OP01-041", "Nico Robin", "ニコ・ロビン", "R", 180, 5],
    ["OP01-047", "Trafalgar Law", "トラファルガー・ロー", "SR", 980, 2],
    ["OP01-051", "Eustass \"Captain\" Kid", "ユースタス・“キャプテン”キッド", "SR", 850, 3],
    ["OP01-060", "Donquixote Doflamingo", "ドンキホーテ・ドフラミンゴ", "L", 420, 4],
    ["OP01-078", "Crocodile", "クロコダイル", "SR", 680, 0],
    ["OP01-120", "Shanks", "シャンクス", "SEC", 12800, 1],
  ],
  OP02: [
    ["OP02-001", "Edward.Newgate", "エドワード・ニューゲート", "L", 450, 5],
    ["OP02-002", "Monkey.D.Garp", "モンキー・D・ガープ", "L", 380, 6],
    ["OP02-004", "Marco", "マルコ", "R", 260, 8],
    ["OP02-013", "Portgas.D.Ace", "ポートガス・D・エース", "SR", 2980, 2],
    ["OP02-018", "Izo", "イゾウ", "C", 40, 20],
    ["OP02-022", "Jozu", "ジョズ", "UC", 60, 14],
    ["OP02-030", "Whitebeard Pirates", "白ひげ海賊団", "C", 35, 22],
    ["OP02-041", "Squard", "スクアード", "UC", 50, 11],
    ["OP02-049", "Smoker", "スモーカー", "SR", 780, 3],
    ["OP02-058", "Sengoku", "センゴク", "R", 190, 7],
    ["OP02-085", "Magellan", "マゼラン", "SR", 640, 4],
    ["OP02-093", "Sabo", "サボ", "R", 320, 6],
    ["OP02-106", "Tsuru", "つる", "C", 30, 16],
    ["OP02-120", "Portgas.D.Ace", "ポートガス・D・エース", "SEC", 9200, 0],
  ],
};

// Wholesale tooling builds legacy-form SKUs like OP-OP01-001-JP
// (defaultGenerateBaseSku in apps/wholesale/tools/lib/cardrush-mapper.ts);
// the storefront catalog mirrors that form.
const skuFor = (cardNumber) => `OP-${cardNumber}-JP`;

// Mirrors computePrice() in packages/pricing/src/index.ts — the canonical
// formula. Duplicated in structure only (every constant comes from the
// channel_pricing table read below) because that package exports
// TypeScript source, which a plain .mjs script cannot import.
function computeChannelPrice(jpy, rate, cfg, category) {
  const baseGbp = jpy / rate;
  const flatFee = category === "sealed" ? cfg.flatFeeSealed : cfg.flatFeeSingles;
  const exVat = (baseGbp * cfg.marginMultiplier + flatFee) * cfg.retailMultiplier;
  const preRound = exVat * cfg.vatMultiplier;
  const step = cfg.roundTo > 0 ? cfg.roundTo : 0.01;
  return Math.round((Math.round(preRound / step) * step) * 100) / 100;
}

// ── seeding ──────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // The production cards table has price/stock columns (canonical schema:
    // apps/wholesale/src/lib/db/schema.ts) that the checked-in wholesale
    // SQL migrations predate — a fresh local DB built from those files
    // lacks them. Align the local table so direct-DB catalog reads work.
    await client.query(`
      ALTER TABLE cards
        ADD COLUMN IF NOT EXISTS price numeric(10, 2),
        ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pending_stock integer NOT NULL DEFAULT 0
    `);

    // cards.price is the wholesale-channel price. Constants come from the
    // channel_pricing table (runtime authoritative) — never hardcoded here.
    const cfgRes = await client.query(
      `SELECT margin_multiplier, flat_fee_singles, flat_fee_sealed,
              vat_multiplier, retail_multiplier, round_to
         FROM channel_pricing WHERE channel = 'wholesale'`,
    );
    if (cfgRes.rows.length === 0) {
      throw new Error(
        "channel_pricing has no 'wholesale' row — run the wholesale migrations " +
        "(apps/wholesale/drizzle/0010_seed_channel_pricing.sql) first.",
      );
    }
    const cfg = {
      marginMultiplier: Number(cfgRes.rows[0].margin_multiplier),
      flatFeeSingles: Number(cfgRes.rows[0].flat_fee_singles),
      flatFeeSealed: Number(cfgRes.rows[0].flat_fee_sealed),
      vatMultiplier: Number(cfgRes.rows[0].vat_multiplier),
      retailMultiplier: Number(cfgRes.rows[0].retail_multiplier),
      roundTo: Number(cfgRes.rows[0].round_to),
    };

    const gameRes = await client.query(
      `INSERT INTO games (code, name, slug, active, sort_order)
       VALUES ($1, $2, $3, true, 0)
       ON CONFLICT (code) DO UPDATE SET name = $2, slug = $3, active = true
       RETURNING id`,
      [GAME.code, GAME.name, GAME.slug],
    );
    const gameId = gameRes.rows[0].id;

    let cardCount = 0;
    let conditionCount = 0;

    for (const set of SETS) {
      const setRes = await client.query(
        `INSERT INTO sets (game_id, code, name, release_date, sort_order, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (game_id, code) DO UPDATE
           SET name = $3, release_date = $4, sort_order = $5, active = true
         RETURNING id`,
        [gameId, set.code, set.name, set.release_date, set.sort_order],
      );
      const setId = setRes.rows[0].id;

      for (const [cardNumber, nameEn, nameJp, rarity, jpy, stock] of CARDS[set.code]) {
        const baseGbp = Math.round((jpy / GBP_JPY_RATE) * 100) / 100;
        const price = computeChannelPrice(jpy, GBP_JPY_RATE, cfg, "singles");
        await client.query(
          `INSERT INTO cards (
             card_number, sku, name, name_en, set_code, set_name,
             game_id, set_id, category, rarity,
             cardrush_jpy, gbp_jpy_rate, base_gbp, price,
             stock, pending_stock, cardrush_url, last_synced_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'singles', $9,
                     $10, $11, $12, $13, $14, 0, $15, NOW())
           ON CONFLICT (sku) DO UPDATE SET
             name = $3, name_en = $4, set_code = $5, set_name = $6,
             game_id = $7, set_id = $8, rarity = $9,
             cardrush_jpy = $10, gbp_jpy_rate = $11, base_gbp = $12,
             price = $13, stock = $14, last_synced_at = NOW()`,
          [
            cardNumber, skuFor(cardNumber), nameJp, nameEn, set.code, set.name,
            gameId, setId, rarity,
            jpy, GBP_JPY_RATE, baseGbp, price, stock,
            `https://www.cardrush-op.jp/product/${cardNumber.toLowerCase()}`,
          ],
        );
        cardCount++;

        // Two CardRush-style condition rows per card: 状態A at list price,
        // 状態B at a 15% played-condition discount.
        const conditions = [
          { condition: "状態A", price_jpy: jpy, stock, discount_pct: null },
          {
            condition: "状態B",
            price_jpy: Math.round(jpy * 0.85),
            stock: Math.max(0, Math.floor(stock / 2)),
            discount_pct: 15,
          },
        ];
        for (const c of conditions) {
          await client.query(
            `INSERT INTO condition_prices (
               card_number, name, set_code, rarity, condition,
               price_jpy, stock, cardrush_url, snapshot_date, discount_pct
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, $9)
             ON CONFLICT (card_number, name, condition, snapshot_date)
               DO UPDATE SET price_jpy = $6, stock = $7, discount_pct = $9`,
            [
              cardNumber, nameJp, set.code, rarity, c.condition,
              c.price_jpy, c.stock,
              `https://www.cardrush-op.jp/product/${cardNumber.toLowerCase()}`,
              c.discount_pct,
            ],
          );
          conditionCount++;
        }
      }
    }

    await client.query("COMMIT");
    console.log(
      `Seeded ${GAME.slug}: ${SETS.length} sets, ${cardCount} cards, ` +
      `${conditionCount} condition_prices rows into ${host}.`,
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
