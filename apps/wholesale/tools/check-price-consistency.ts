#!/usr/bin/env tsx
/**
 * Compare the JPY cost we're submitting to Remambo against the GBP selling price
 * to detect items where we'd lose money due to price changes since the order was placed.
 *
 * Pricing formula: price = ((cardrushJpy / gbpJpyRate) * 1.22 + 0.22) * 1.20
 * Sealed:          price = ((cardrushJpy / gbpJpyRate) * 1.18 + 2.20) * 1.20
 *
 * Reverse: impliedJpy = ((price / 1.20 - fee) / markup) * rate
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

  const manifest = JSON.parse(readFileSync("tools/logs/remambo-2026-03-02_22-23-24.json", "utf8"));

  const orderItemIds = [...new Set(manifest.items.map((i: any) => i.order_item_id))] as number[];

  const rows = await sql`
    SELECT oi.id, oi.quantity, oi.unit_price::float AS gbp_price,
           c.card_number, c.name, c.cardrush_jpy AS current_mint_jpy,
           c.gbp_jpy_rate AS rate, c.category
    FROM order_items oi
    JOIN cards c ON c.id = oi.card_id
    WHERE oi.id = ANY(${orderItemIds})
    ORDER BY c.card_number, c.name
  `;

  const rate = rows[0]?.rate || 209.83;
  console.log(`Card table exchange rate: ¥${rate}/£\n`);

  // Build manifest lookup
  const manifestMap = new Map<number, any[]>();
  for (const item of manifest.items) {
    const existing = manifestMap.get(item.order_item_id) || [];
    existing.push(item);
    manifestMap.set(item.order_item_id, existing);
  }

  console.log(
    "Card".padEnd(14) +
    "GBP sell".padEnd(11) +
    "JPY buy".padEnd(13) +
    "Qty".padEnd(6) +
    "Cost £".padEnd(10) +
    "Revenue £".padEnd(11) +
    "Margin".padEnd(10) +
    "Status"
  );
  console.log("-".repeat(90));

  let totalCostGbp = 0;
  let totalRevenueGbp = 0;
  let losses = 0;
  let warnings = 0;
  const issueItems: string[] = [];

  for (const row of rows) {
    const entries = manifestMap.get(row.id) || [];
    for (const entry of entries) {
      const buyJpy = entry.price_jpy;
      const qty = typeof entry.qty === "string" ? parseInt(entry.qty) : entry.qty;
      const sellGbp = row.gbp_price;

      // Cost in GBP at current rate
      const costPerUnitGbp = buyJpy / rate;
      const totalCost = costPerUnitGbp * qty;
      const totalRevenue = sellGbp * qty;
      const margin = ((totalRevenue - totalCost) / totalRevenue) * 100;

      totalCostGbp += totalCost;
      totalRevenueGbp += totalRevenue;

      let status = "";
      if (margin < 0) {
        status = "❌ LOSS";
        losses++;
        issueItems.push(`${row.card_number} ${row.name}: buy ¥${buyJpy} (£${costPerUnitGbp.toFixed(2)}) > sell £${sellGbp.toFixed(2)} — margin ${margin.toFixed(1)}%`);
      } else if (margin < 15) {
        status = "⚠️  LOW";
        warnings++;
        issueItems.push(`${row.card_number} ${row.name}: buy ¥${buyJpy} (£${costPerUnitGbp.toFixed(2)}) vs sell £${sellGbp.toFixed(2)} — margin ${margin.toFixed(1)}%`);
      } else {
        status = "OK";
      }

      console.log(
        row.card_number.padEnd(14) +
        `£${sellGbp.toFixed(2)}`.padEnd(11) +
        `¥${buyJpy.toLocaleString()}`.padEnd(13) +
        `${qty}`.padEnd(6) +
        `£${totalCost.toFixed(2)}`.padEnd(10) +
        `£${totalRevenue.toFixed(2)}`.padEnd(11) +
        `${margin.toFixed(1)}%`.padEnd(10) +
        status
      );
    }
  }

  console.log("-".repeat(90));
  const overallMargin = ((totalRevenueGbp - totalCostGbp) / totalRevenueGbp) * 100;
  console.log(
    "TOTAL".padEnd(14) +
    "".padEnd(11) +
    "".padEnd(13) +
    "".padEnd(6) +
    `£${totalCostGbp.toFixed(2)}`.padEnd(10) +
    `£${totalRevenueGbp.toFixed(2)}`.padEnd(11) +
    `${overallMargin.toFixed(1)}%`
  );

  if (issueItems.length > 0) {
    console.log(`\n=== ISSUES (${losses} losses, ${warnings} low margin) ===\n`);
    for (const issue of issueItems) {
      console.log(`  ${issue}`);
    }
  } else {
    console.log("\nAll items have healthy margins (>15%).");
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
