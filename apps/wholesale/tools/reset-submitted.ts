#!/usr/bin/env tsx
/**
 * Reset remambo_submitted_at for order items that still need ordering
 * (ordered_qty - fulfilled_qty - purchased_qty > 0).
 *
 * Usage: npx tsx tools/reset-submitted.ts [--dry-run]
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

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

  // Find order_item IDs that still need ordering but have remambo_submitted_at set
  const rows = await sql`
    WITH fulfilled AS (
      SELECT order_item_id, SUM(fulfilled_qty)::int AS qty
      FROM fulfillment_entries GROUP BY order_item_id
    ),
    purchased AS (
      SELECT pi.order_item_id, SUM(pi.quantity)::int AS qty
      FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
      GROUP BY pi.order_item_id
    )
    SELECT oi.id, oi.order_id, c.card_number,
      oi.quantity AS ordered_qty,
      COALESCE(f.qty, 0)::int AS fulfilled_qty,
      COALESCE(p.qty, 0)::int AS purchased_qty,
      GREATEST(oi.quantity - COALESCE(f.qty, 0) - COALESCE(p.qty, 0), 0)::int AS to_order_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN cards c ON c.id = oi.card_id
    LEFT JOIN fulfilled f ON f.order_item_id = oi.id
    LEFT JOIN purchased p ON p.order_item_id = oi.id
    WHERE o.status IN ('paid', 'ordered', 'shipped', 'delivered')
      AND oi.remambo_submitted_at IS NOT NULL
      AND GREATEST(oi.quantity - COALESCE(f.qty, 0) - COALESCE(p.qty, 0), 0) > 0
    ORDER BY oi.order_id, c.card_number
  `;

  console.log(`Found ${rows.length} items with remambo_submitted_at set but still needing ordering:\n`);
  for (const r of rows) {
    console.log(`  #${r.order_id} ${r.card_number} ordered:${r.ordered_qty} fulfilled:${r.fulfilled_qty} purchased:${r.purchased_qty} to_order:${r.to_order_qty}`);
  }

  const ids = rows.map((r: any) => r.id);

  if (dryRun) {
    console.log(`\n[DRY RUN] Would reset remambo_submitted_at for ${ids.length} items`);
  } else {
    await sql`
      UPDATE order_items
      SET remambo_submitted_at = NULL
      WHERE id = ANY(${ids})
    `;
    console.log(`\nReset remambo_submitted_at for ${ids.length} items`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
