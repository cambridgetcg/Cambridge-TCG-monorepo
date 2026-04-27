#!/usr/bin/env tsx
/**
 * For items with price mismatches, reverse-engineer the original JPY price
 * from the GBP selling price, then find matching CardRush links.
 *
 * Formula: price = ((cardrushJpy / rate) * 1.22 + 0.22) * 1.20
 * Reverse: cardrushJpy = ((price / 1.20 - 0.22) / 1.22) * rate
 */
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

  // Problem items (order_item_id from the manifest)
  const problemIds = [82, 57, 133, 90]; // OP05-119, P-001 CS, P-001 foil, P-028 unsealed

  const rows = await sql`
    SELECT oi.id, oi.unit_price::float AS gbp_price,
           c.id AS card_id, c.card_number, c.name, c.cardrush_jpy, c.cardrush_url,
           c.gbp_jpy_rate AS rate, c.category, c.sku
    FROM order_items oi
    JOIN cards c ON c.id = oi.card_id
    WHERE oi.id = ANY(${problemIds})
    ORDER BY c.card_number
  `;

  const rate = rows[0]?.rate || 209.83;

  console.log("=== Finding correct CardRush links ===\n");
  console.log(`Exchange rate: ¥${rate}/£\n`);

  for (const row of rows) {
    const isSealed = row.category === "sealed";
    const fee = isSealed ? 2.20 : 0.22;
    const markup = isSealed ? 1.18 : 1.22;

    // Reverse: original JPY = ((gbp - fee) / markup) * rate
    const impliedJpy = Math.round(((row.gbp_price - fee) / markup) * rate);

    console.log(`--- Order item #${row.id}: ${row.card_number} ---`);
    console.log(`  Name: ${row.name}`);
    console.log(`  GBP sell: £${row.gbp_price.toFixed(2)}`);
    console.log(`  Implied original JPY: ¥${impliedJpy.toLocaleString()}`);
    console.log(`  Current card JPY: ¥${row.cardrush_jpy?.toLocaleString()}`);
    console.log(`  Current URL: ${row.cardrush_url}`);
    console.log(`  SKU: ${row.sku}`);

    // Find all cards in DB with same card_number
    const siblings = await sql`
      SELECT id, card_number, name, sku, cardrush_url, cardrush_jpy, category
      FROM cards
      WHERE card_number = ${row.card_number}
      ORDER BY cardrush_jpy
    `;
    console.log(`\n  All DB cards with card_number=${row.card_number}:`);
    for (const s of siblings) {
      const match = s.cardrush_jpy === impliedJpy ? " ✅ MATCH" :
                    Math.abs((s.cardrush_jpy || 0) - impliedJpy) <= 100 ? " ~CLOSE" : "";
      console.log(`    id=${s.id} ¥${s.cardrush_jpy?.toLocaleString() || "?"} ${s.name} ${s.cardrush_url || "no URL"}${match}`);
    }

    // Also check condition_prices for this card_number
    const cps = await sql`
      SELECT DISTINCT ON (cardrush_url, condition)
        cardrush_url, condition, price_jpy, stock, name
      FROM condition_prices
      WHERE card_number = ${row.card_number}
        AND cardrush_url IS NOT NULL AND cardrush_url != ''
      ORDER BY cardrush_url, condition, snapshot_date DESC
    `;
    if (cps.length > 0) {
      console.log(`\n  condition_prices entries for ${row.card_number}:`);
      for (const cp of cps) {
        const match = cp.price_jpy === impliedJpy ? " ✅ MATCH" :
                      Math.abs(cp.price_jpy - impliedJpy) <= 100 ? " ~CLOSE" : "";
        console.log(`    ${cp.condition.padEnd(8)} ¥${cp.price_jpy.toLocaleString().padEnd(8)} stock:${cp.stock} ${cp.name} ${cp.cardrush_url}${match}`);
      }
    }

    console.log("");
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
