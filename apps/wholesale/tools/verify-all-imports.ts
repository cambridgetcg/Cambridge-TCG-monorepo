#!/usr/bin/env tsx
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

async function main() {
  const purchases = await sql`
    SELECT p.id, p.remambo_order_id, p.status, p.items_total_jpy, p.ordered_at,
      (SELECT count(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count,
      (SELECT sum(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_qty,
      (SELECT sum(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id AND pi.condition NOT LIKE '状態%') as mint_qty
    FROM purchases p
    ORDER BY p.ordered_at DESC
  `;

  console.log("All purchases in DB:\n");
  console.log("Order ID\t\tDate\t\tStatus\t\tItems\tQty\tMint\t¥Total");
  console.log("-".repeat(110));

  let totalItems = 0, totalQty = 0, totalMint = 0, totalJpy = 0;
  for (const p of purchases) {
    const date = p.ordered_at ? new Date(p.ordered_at).toISOString().split("T")[0] : "?";
    console.log(`${p.remambo_order_id}\t${date}\t${p.status}\t\t${p.item_count}\t${p.total_qty}\t${p.mint_qty || 0}\t¥${Number(p.items_total_jpy).toLocaleString()}`);
    totalItems += Number(p.item_count);
    totalQty += Number(p.total_qty || 0);
    totalMint += Number(p.mint_qty || 0);
    totalJpy += Number(p.items_total_jpy);
  }

  console.log("-".repeat(110));
  console.log(`TOTAL: ${purchases.length} purchases, ${totalItems} items, ${totalQty} qty, ${totalMint} mint, ¥${totalJpy.toLocaleString()}`);

  // Stock summary
  const stockSummary = await sql`
    SELECT count(*) as cards_with_stock, sum(stock) as total_stock
    FROM cards WHERE stock > 0
  `;
  console.log(`\nStock: ${stockSummary[0].cards_with_stock} cards with stock, ${stockSummary[0].total_stock} total units`);

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
