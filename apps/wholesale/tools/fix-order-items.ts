#!/usr/bin/env tsx
/**
 * Fix order items that are linked to wrong card variants.
 * Updates card_id and recalculates unit_price and line_total.
 *
 * Usage: npx tsx tools/fix-order-items.ts [--dry-run]
 */
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const dryRun = process.argv.includes("--dry-run");

// Corrections: order_item_id -> correct card_id
const corrections = [
  { orderItemId: 82, wrongCardId: 44918, correctCardId: 77716, reason: "OP05-119: 手配書 -> illust:Tacchan" },
  { orderItemId: 57, wrongCardId: 43167, correctCardId: 43163, reason: "P-001: CS/Nijihayashi -> illust:Midori Matsuda" },
  { orderItemId: 133, wrongCardId: 43164, correctCardId: 43162, reason: "P-001: フルアート/foil -> 未開封/illust:tasaka" },
  { orderItemId: 90, wrongCardId: 43209, correctCardId: 43208, reason: "P-028: 未開封/set3 -> illust:Boichi" },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

  console.log("=== Fix Order Item Card Variants ===\n");
  if (dryRun) console.log("Mode: DRY RUN\n");

  for (const fix of corrections) {
    // Get current order item
    const [oi] = await sql`
      SELECT oi.id, oi.card_id, oi.quantity, oi.unit_price::float AS current_gbp,
             oi.line_total::float AS current_total
      FROM order_items oi WHERE oi.id = ${fix.orderItemId}
    `;

    // Get correct card details
    const [correctCard] = await sql`
      SELECT id, card_number, name, cardrush_jpy, gbp_jpy_rate, category
      FROM cards WHERE id = ${fix.correctCardId}
    `;

    // Get wrong card details for comparison
    const [wrongCard] = await sql`
      SELECT id, card_number, name, cardrush_jpy
      FROM cards WHERE id = ${fix.wrongCardId}
    `;

    // Calculate new price using pricing formula
    const rate = correctCard.gbp_jpy_rate;
    const isSealed = correctCard.category === "sealed";
    const markup = isSealed ? 1.18 : 1.22;
    const fee = isSealed ? 2.20 : 0.22;
    const newPrice = Math.round(((correctCard.cardrush_jpy / rate) * markup + fee) * 1.20 * 100) / 100;
    const newLineTotal = Math.round(newPrice * oi.quantity * 100) / 100;

    console.log(`--- ${fix.reason} ---`);
    console.log(`  Order item #${fix.orderItemId} (qty: ${oi.quantity})`);
    console.log(`  Wrong:   card_id=${fix.wrongCardId} "${wrongCard.name}" ¥${wrongCard.cardrush_jpy.toLocaleString()}`);
    console.log(`  Correct: card_id=${fix.correctCardId} "${correctCard.name}" ¥${correctCard.cardrush_jpy.toLocaleString()}`);
    console.log(`  Price:   £${oi.current_gbp.toFixed(2)} -> £${newPrice.toFixed(2)}`);
    console.log(`  Total:   £${oi.current_total.toFixed(2)} -> £${newLineTotal.toFixed(2)}`);

    if (!dryRun) {
      await sql`
        UPDATE order_items
        SET card_id = ${fix.correctCardId},
            unit_price = ${newPrice},
            line_total = ${newLineTotal},
            remambo_submitted_at = NULL
        WHERE id = ${fix.orderItemId}
      `;
      console.log(`  ✅ Updated\n`);
    } else {
      console.log(`  [DRY RUN] Would update\n`);
    }
  }

  if (!dryRun) {
    // Recalculate order total
    await sql`
      UPDATE orders SET total = (
        SELECT SUM(line_total) FROM order_items WHERE order_id = 31
      ) WHERE id = 31
    `;

    const [order] = await sql`SELECT total::float AS total FROM orders WHERE id = 31`;
    console.log(`Order #31 new total: £${order.total.toFixed(2)}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
