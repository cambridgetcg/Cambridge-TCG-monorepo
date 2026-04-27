import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";

// Load .env.local
const envFile = readFileSync(".env.local", "utf8");
const dbUrl = envFile.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1] ?? "";

const client = postgres(dbUrl, { ssl: "require", max: 1 });
const db = drizzle(client);

async function main() {
  // ALL purchase items for A-6061096
  const allItems: any[] = await db.execute(sql`
    SELECT pi.id, pi.card_id, pi.order_item_id, pi.condition, pi.quantity, pi.unit_price_jpy,
           c.card_number, c.sku,
           oi.order_id, oi.quantity AS ordered_qty
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    JOIN cards c ON c.id = pi.card_id
    LEFT JOIN order_items oi ON oi.id = pi.order_item_id
    WHERE p.remambo_order_id = 'A-6061096'
    ORDER BY c.card_number, pi.condition
  `);

  console.log("Total items in purchase A-6061096:", allItems.length);
  console.log("Total qty:", allItems.reduce((s, r) => s + Number(r.quantity), 0));
  console.log("");

  // Items not linked to any order
  const unlinked = allItems.filter((r) => r.order_item_id === null);
  if (unlinked.length > 0) {
    console.log("=== ITEMS NOT LINKED TO ANY ORDER ===");
    for (const r of unlinked) {
      console.log(`  ${r.card_number} ${r.condition} qty:${r.quantity} @¥${r.unit_price_jpy} (card_id:${r.card_id})`);
    }
  } else {
    console.log("All items are linked to an order.");
  }

  // Compare Remambo page vs DB for the 4 extra items
  console.log("\n=== COMPARISON: REMAMBO PAGE vs DB ===\n");
  console.log("Remambo page shows 4 extra items (no 'Order #31' prefix):");
  console.log("  1. EB02-061 状態A- qty:6 @¥1,780 = ¥10,680");
  console.log("  2. OP01-024 状態A- qty:8 @¥980  = ¥7,840");
  console.log("  3. OP07-109 状態A- qty:8 @¥1,080 = ¥8,640");
  console.log("  4. OP07-015 Mint   qty:1 @¥4,980 = ¥4,980");

  console.log("\nDB records for these cards in purchase A-6061096:");
  for (const cardNum of ["EB02-061", "OP01-024", "OP07-109", "OP07-015"]) {
    const matches = allItems.filter((r) => r.card_number === cardNum);
    for (const m of matches) {
      console.log(`  ${m.card_number} ${m.condition} qty:${m.quantity} @¥${m.unit_price_jpy} (pi.id:${m.id}, order_item_id:${m.order_item_id}, order:${m.order_id})`);
    }
    if (matches.length === 0) console.log(`  ${cardNum} — NOT FOUND in purchase items!`);
  }

  // EB02-061 anomaly check
  console.log("\n=== EB02-061 ALL ENTRIES ===");
  const eb02 = allItems.filter((r) => r.card_number === "EB02-061");
  for (const r of eb02) {
    console.log(`  pi.id:${r.id} qty:${r.quantity} @¥${r.unit_price_jpy} condition:${r.condition} subtotal:¥${Number(r.quantity) * Number(r.unit_price_jpy)} order_item_id:${r.order_item_id}`);
  }

  // EB01-003 check (might be misresolved)
  console.log("\n=== EB01-003 ALL ENTRIES ===");
  const eb01 = allItems.filter((r) => r.card_number === "EB01-003");
  for (const r of eb01) {
    console.log(`  pi.id:${r.id} qty:${r.quantity} @¥${r.unit_price_jpy} condition:${r.condition} card_id:${r.card_id} order_item_id:${r.order_item_id} order:${r.order_id}`);
  }

  // Sum all subtotals to verify against Remambo total of ¥281,140
  const dbTotal = allItems.reduce((s, r) => s + Number(r.quantity) * Number(r.unit_price_jpy), 0);
  console.log("\n=== TOTAL CHECK ===");
  console.log("Remambo page total: ¥281,140");
  console.log("DB calculated total: ¥" + dbTotal);
  console.log("Difference: ¥" + (dbTotal - 281140));

  // Show items where qty * price seems anomalous (> ¥50,000)
  console.log("\n=== HIGH-VALUE ITEMS (subtotal > ¥50,000) ===");
  for (const r of allItems) {
    const sub = Number(r.quantity) * Number(r.unit_price_jpy);
    if (sub > 50000) {
      console.log(`  pi.id:${r.id} ${r.card_number} ${r.condition} qty:${r.quantity} @¥${r.unit_price_jpy} = ¥${sub}`);
    }
  }

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
