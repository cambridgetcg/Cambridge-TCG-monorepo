#!/usr/bin/env tsx
// Seed the first purchase record: Remambo order A-6002858
// Usage: npx tsx tools/seed-purchase.ts [--dry-run]
//
// Resolves card_ids via condition_prices → cards URL matching.
// Creates missing card variants if needed.
// Idempotent: skips if remamboOrderId already exists.

import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

// Load .env.local (same pattern as scrape-cardrush.ts)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const dryRun = process.argv.includes("--dry-run");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it in .env.local.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

// ---------------------------------------------------------------------------
// Manifest data from Remambo order A-6002858
// ---------------------------------------------------------------------------

interface ManifestItem {
  order_item_id: number | null;
  card_number: string;
  name: string;
  set_code: string;
  qty: number;
  price_jpy: number;
  url: string;          // cardrush URL used in Remambo
  tag: "A-" | "Mint";
}

const REMAMBO_ORDER_ID = "A-6002858";
const PARCEL_ID = "Z-770762";
const ORDERED_AT = new Date("2026-02-26T00:00:00.000Z");
const SHIPPED_AT = new Date("2026-03-02T00:00:00.000Z");
const ITEMS_TOTAL_JPY = 164340;
const SERVICE_FEE_JPY = 500;
const SHIPPING_JPY = 700;

const manifest: ManifestItem[] = [
  { order_item_id: null, card_number: "OP01-016", name: "ナミ(パラレル/和柄/illust:S-KINOKO)", set_code: "OP05", qty: 2, price_jpy: 14800, url: "https://www.cardrush-op.jp/product/1555", tag: "A-" },
  { order_item_id: null, card_number: "OP05-100", name: "エネル(パラレル/和柄/illust:S-KINOKO)", set_code: "OP05", qty: 2, price_jpy: 8980, url: "https://www.cardrush-op.jp/product/1560", tag: "A-" },
  { order_item_id: 43, card_number: "OP01-121", name: "ヤマト(パラレル/和柄/illust:S-KINOKO)", set_code: "OP05", qty: 1, price_jpy: 7480, url: "https://www.cardrush-op.jp/product/1556", tag: "A-" },
  { order_item_id: null, card_number: "OP03-092", name: "ロブ・ルッチ(パラレル/和柄/illust:S-KINOKO)", set_code: "OP05", qty: 3, price_jpy: 2480, url: "https://www.cardrush-op.jp/product/1558", tag: "A-" },
  { order_item_id: null, card_number: "ST01-012", name: "モンキー・D・ルフィ(パラレル/黒背景)", set_code: "ST01", qty: 10, price_jpy: 2780, url: "https://www.cardrush-op.jp/product/1553", tag: "A-" },
  { order_item_id: null, card_number: "OP02-120", name: "ウタ(パラレル/和柄/illust:S-KINOKO)", set_code: "OP05", qty: 3, price_jpy: 8480, url: "https://www.cardrush-op.jp/product/1557", tag: "A-" },
  { order_item_id: null, card_number: "OP02-004", name: "エドワード・ニューゲート(パラレル/illust:Hayaken-sarena)", set_code: "OP04", qty: 3, price_jpy: 3980, url: "https://www.cardrush-op.jp/product/1512", tag: "A-" },
  { order_item_id: null, card_number: "OP02-085", name: "マゼラン(パラレル/illust:Anderson)", set_code: "OP04", qty: 4, price_jpy: 2380, url: "https://www.cardrush-op.jp/product/778", tag: "Mint" },
  { order_item_id: null, card_number: "OP02-099", name: "サカズキ(パラレル/illust:DAI-XT.)", set_code: "OP04", qty: 4, price_jpy: 2380, url: "https://www.cardrush-op.jp/product/779", tag: "Mint" },
  { order_item_id: null, card_number: "OP13-120", name: "サボ(パラレル/海賊旗背景/漫画絵)", set_code: "OP13", qty: 4, price_jpy: 2280, url: "https://www.cardrush-op.jp/product/9480", tag: "Mint" },
  { order_item_id: null, card_number: "OP13-119", name: "ポートガス・Ｄ・エース(パラレル/海賊旗背景/漫画絵)", set_code: "OP13", qty: 4, price_jpy: 2130, url: "https://www.cardrush-op.jp/product/9613", tag: "A-" },
];

// ---------------------------------------------------------------------------
// Card resolution: find or create cards for each manifest item
// ---------------------------------------------------------------------------

async function resolveCardId(item: ManifestItem): Promise<number> {
  // Strategy:
  // 1. For Mint items: the manifest URL IS the Mint URL → match cards.cardrush_url directly
  // 2. For A- items: look up condition_prices by the A- URL → find same card_number+name Mint entry
  //    → match cards.cardrush_url to the Mint URL

  let mintUrl: string;

  if (item.tag === "Mint") {
    mintUrl = item.url;
  } else {
    // A- item: find the Mint variant URL via condition_prices
    // First get card_number + name from the A- condition_prices entry
    const cpRows = await sql`
      SELECT card_number, name, cardrush_url, condition
      FROM condition_prices
      WHERE cardrush_url = ${item.url}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;

    if (cpRows.length === 0) {
      // No condition_prices entry — try to find via card_number + name pattern in condition_prices
      const cpByCard = await sql`
        SELECT card_number, name, cardrush_url, condition
        FROM condition_prices
        WHERE card_number = ${item.card_number}
          AND condition = 'Mint'
        ORDER BY snapshot_date DESC
        LIMIT 1
      `;

      if (cpByCard.length > 0) {
        mintUrl = cpByCard[0].cardrush_url;
      } else {
        // Fall through — try direct card lookup
        mintUrl = "";
      }
    } else {
      const cp = cpRows[0];
      // Now find the Mint entry for same card_number + name
      const mintCp = await sql`
        SELECT cardrush_url
        FROM condition_prices
        WHERE card_number = ${cp.card_number}
          AND name = ${cp.name}
          AND condition = 'Mint'
        ORDER BY snapshot_date DESC
        LIMIT 1
      `;

      mintUrl = mintCp.length > 0 ? mintCp[0].cardrush_url : "";
    }
  }

  // Try to find card by Mint URL
  if (mintUrl) {
    const cardRows = await sql`
      SELECT id FROM cards WHERE cardrush_url = ${mintUrl} LIMIT 1
    `;
    if (cardRows.length > 0) {
      return cardRows[0].id;
    }
  }

  // Fallback: find card by card_number (may match multiple parallels)
  const cardsByNumber = await sql`
    SELECT id, sku, cardrush_url FROM cards
    WHERE card_number = ${item.card_number}
    ORDER BY id
  `;

  if (cardsByNumber.length > 0) {
    // Return first match
    return cardsByNumber[0].id;
  }

  // Card doesn't exist at all — create it
  console.log(`  Creating new card variant: ${item.card_number} ${item.name}`);
  return createCard(item, mintUrl || item.url);
}

async function createCard(item: ManifestItem, cardrushUrl: string): Promise<number> {
  // Get One Piece game ID
  const [game] = await sql`SELECT id FROM games WHERE code = 'op' LIMIT 1`;
  if (!game) throw new Error("One Piece game not found");

  // Get set ID
  const sets = await sql`SELECT id FROM sets WHERE code = ${item.set_code} AND game_id = ${game.id} LIMIT 1`;
  const setId = sets.length > 0 ? sets[0].id : null;

  // Generate SKU: find highest P-suffix for this card_number
  const existing = await sql`
    SELECT sku FROM cards WHERE card_number = ${item.card_number} ORDER BY sku
  `;

  let sku: string;
  const prefix = item.card_number.match(/^(OP|ST|EB|PRB)/)?.[1] ?? "OP";
  const baseSku = `${prefix}-${item.card_number}-JP`;

  if (existing.length === 0) {
    sku = baseSku;
  } else {
    // Find the highest P-suffix
    let maxP = 0;
    for (const row of existing) {
      const m = row.sku.match(/-P(\d+)$/);
      if (m) maxP = Math.max(maxP, parseInt(m[1]));
      else maxP = Math.max(maxP, 0); // base sku exists
    }
    sku = `${baseSku}-P${maxP + 1}`;
  }

  // Use condition_prices Mint price for the selling price, or estimate from purchase price
  let cardrushJpy = item.price_jpy;
  if (item.tag === "A-") {
    // A- is cheaper; try to find Mint price from condition_prices
    const mintPrice = await sql`
      SELECT price_jpy FROM condition_prices
      WHERE card_number = ${item.card_number} AND condition = 'Mint'
      ORDER BY snapshot_date DESC LIMIT 1
    `;
    if (mintPrice.length > 0) {
      cardrushJpy = mintPrice[0].price_jpy;
    }
  }

  const gbpJpyRate = 191.0; // approximate current rate
  const baseGbp = Math.round((cardrushJpy / gbpJpyRate) * 100) / 100;
  const price = Math.round((baseGbp * 1.22 + 0.22) * 1.20 * 100) / 100;

  const [newCard] = await sql`
    INSERT INTO cards (card_number, sku, name, set_code, cardrush_url, cardrush_jpy,
                       gbp_jpy_rate, base_gbp, price, game_id, set_id, category)
    VALUES (${item.card_number}, ${sku}, ${item.name}, ${item.set_code}, ${cardrushUrl},
            ${cardrushJpy}, ${gbpJpyRate}, ${baseGbp}, ${price}, ${game.id},
            ${setId}, 'singles')
    RETURNING id
  `;

  console.log(`  Created card: ${sku} (id=${newCard.id})`);
  return newCard.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Idempotency check
  const existing = await sql`
    SELECT id FROM purchases WHERE remambo_order_id = ${REMAMBO_ORDER_ID} LIMIT 1
  `;

  if (existing.length > 0) {
    console.log(`Purchase ${REMAMBO_ORDER_ID} already exists (id=${existing[0].id}). Skipping.`);
    await sql.end();
    return;
  }

  console.log(`Seeding purchase: ${REMAMBO_ORDER_ID}`);
  console.log(`  Items: ${manifest.length}, Total: ¥${ITEMS_TOTAL_JPY}`);

  // Resolve card IDs for all items
  console.log("\nResolving card IDs...");
  const resolved: { item: ManifestItem; cardId: number }[] = [];

  for (const item of manifest) {
    console.log(`  ${item.card_number} ${item.name.slice(0, 30)}... (${item.tag})`);
    const cardId = await resolveCardId(item);
    console.log(`    → card_id=${cardId}`);
    resolved.push({ item, cardId });
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would insert:");
    console.log(`  1 purchase: ${REMAMBO_ORDER_ID}, status=shipped`);
    console.log(`  ${resolved.length} purchase_items`);
    for (const { item, cardId } of resolved) {
      console.log(`    card_id=${cardId} ${item.card_number} x${item.qty} ¥${item.price_jpy} (${item.tag})`);
    }
    await sql.end();
    return;
  }

  // Insert purchase
  const [purchase] = await sql`
    INSERT INTO purchases (remambo_order_id, supplier, parcel_id, ordered_at, shipped_at,
                           status, items_total_jpy, service_fee_jpy, shipping_jpy)
    VALUES (${REMAMBO_ORDER_ID}, 'cardrush', ${PARCEL_ID}, ${ORDERED_AT}, ${SHIPPED_AT},
            'shipped', ${ITEMS_TOTAL_JPY}, ${SERVICE_FEE_JPY}, ${SHIPPING_JPY})
    RETURNING id
  `;

  console.log(`\nInserted purchase id=${purchase.id}`);

  // Insert purchase items
  for (const { item, cardId } of resolved) {
    await sql`
      INSERT INTO purchase_items (purchase_id, card_id, order_item_id, condition, quantity,
                                  unit_price_jpy, cardrush_url)
      VALUES (${purchase.id}, ${cardId}, ${item.order_item_id}, ${item.tag === "A-" ? "状態A-" : "Mint"},
              ${item.qty}, ${item.price_jpy}, ${item.url})
    `;
    console.log(`  Inserted: ${item.card_number} x${item.qty} (${item.tag}) → card_id=${cardId}`);
  }

  console.log(`\nDone! Purchase ${REMAMBO_ORDER_ID}: ${resolved.length} items seeded.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
