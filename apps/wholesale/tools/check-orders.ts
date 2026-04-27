#!/usr/bin/env tsx
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

  const orders = await sql`
    SELECT o.id, o.status, count(oi.id)::int AS items,
      sum(CASE WHEN oi.remambo_submitted_at IS NOT NULL THEN 1 ELSE 0 END)::int AS submitted
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id
    ORDER BY o.id
  `;
  console.log("Orders:");
  for (const o of orders) {
    console.log(`  #${o.id} ${o.status} | ${o.items} items, ${o.submitted} submitted to remambo`);
  }

  const toOrder = await sql`
    WITH order_scope AS (
      SELECT oi.id AS item_id, oi.order_id, oi.card_id, oi.quantity AS ordered_qty,
             oi.remambo_submitted_at
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN ('paid', 'ordered', 'shipped', 'delivered')
    ),
    fulfilled AS (
      SELECT order_item_id, SUM(fulfilled_qty)::int AS qty
      FROM fulfillment_entries GROUP BY order_item_id
    ),
    purchased AS (
      SELECT pi.order_item_id, SUM(pi.quantity)::int AS qty
      FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
      GROUP BY pi.order_item_id
    )
    SELECT os.item_id, os.order_id, c.card_number, c.cardrush_url, c.cardrush_jpy,
      os.ordered_qty,
      COALESCE(f.qty, 0)::int AS fulfilled_qty,
      COALESCE(p.qty, 0)::int AS purchased_qty,
      GREATEST(os.ordered_qty - COALESCE(f.qty, 0) - COALESCE(p.qty, 0), 0)::int AS to_order_qty,
      os.remambo_submitted_at
    FROM order_scope os
    JOIN cards c ON c.id = os.card_id
    LEFT JOIN fulfilled f ON f.order_item_id = os.item_id
    LEFT JOIN purchased p ON p.order_item_id = os.item_id
    WHERE GREATEST(os.ordered_qty - COALESCE(f.qty, 0) - COALESCE(p.qty, 0), 0) > 0
    ORDER BY os.order_id, c.card_number
  `;

  console.log(`\nTo-order pipeline items (need ordering): ${toOrder.length}`);
  let totalToOrder = 0;
  for (const r of toOrder) {
    totalToOrder += r.to_order_qty;
    const submitted = r.remambo_submitted_at ? "SUBMITTED" : "not submitted";
    const hasUrl = r.cardrush_url ? "has URL" : "NO URL";
    console.log(`  #${r.order_id} ${r.card_number} ordered:${r.ordered_qty} fulfilled:${r.fulfilled_qty} purchased:${r.purchased_qty} to_order:${r.to_order_qty} [${submitted}] [${hasUrl}]`);
  }
  console.log(`Total qty to order: ${totalToOrder}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
