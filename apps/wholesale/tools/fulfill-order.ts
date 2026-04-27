#!/usr/bin/env tsx
/**
 * Mark all items in an order as fully fulfilled.
 * Usage: npx tsx tools/fulfill-order.ts --order=49 [--dry-run]
 */
import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const orderIdArg = args.find(a => a.startsWith("--order="))?.split("=")[1];

if (!orderIdArg) {
  console.error("Usage: npx tsx tools/fulfill-order.ts --order=<id> [--dry-run]");
  process.exit(1);
}

const orderId = parseInt(orderIdArg);

async function main() {
  // Get order info
  const [order] = await sql`SELECT id, status, client_id FROM orders WHERE id = ${orderId}`;
  if (!order) { console.error(`Order ${orderId} not found`); process.exit(1); }
  console.log(`Order #${order.id} (status: ${order.status})\n`);

  // Get items with fulfillment status
  const items = await sql`
    SELECT oi.id, oi.quantity, c.card_number, c.name,
      COALESCE((SELECT SUM(fe.fulfilled_qty) FROM fulfillment_entries fe WHERE fe.order_item_id = oi.id), 0)::int AS fulfilled
    FROM order_items oi
    JOIN cards c ON c.id = oi.card_id
    WHERE oi.order_id = ${orderId} AND oi.removed_at IS NULL
    ORDER BY oi.id
  `;

  console.log("Items:");
  let toFulfill = 0;
  for (const item of items) {
    const remaining = item.quantity - item.fulfilled;
    const status = remaining <= 0 ? "✓" : `${remaining} remaining`;
    console.log(`  oi=${item.id} ${item.card_number} ${item.name?.slice(0, 40)} qty=${item.quantity} fulfilled=${item.fulfilled} ${status}`);
    if (remaining > 0) toFulfill++;
  }

  const unfulfilled = items.filter((i: any) => i.quantity - i.fulfilled > 0);
  console.log(`\nTotal items: ${items.length}, already fulfilled: ${items.length - unfulfilled.length}, to fulfill: ${unfulfilled.length}`);

  if (unfulfilled.length === 0) {
    console.log("All items already fulfilled!");
    await sql.end();
    return;
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would insert fulfillment entries for:");
    for (const item of unfulfilled) {
      const remaining = item.quantity - item.fulfilled;
      console.log(`  oi=${item.id} ${item.card_number} x${remaining}`);
    }
    await sql.end();
    return;
  }

  // Insert fulfillment entries
  const today = new Date().toISOString().split("T")[0];
  let inserted = 0;
  for (const item of unfulfilled) {
    const remaining = item.quantity - item.fulfilled;
    // Use ON CONFLICT to handle existing entries for today
    await sql`
      INSERT INTO fulfillment_entries (order_id, order_item_id, fulfilled_qty, fulfillment_date)
      VALUES (${orderId}, ${item.id}, ${remaining}, ${today})
      ON CONFLICT (order_item_id, fulfillment_date)
      DO UPDATE SET fulfilled_qty = fulfillment_entries.fulfilled_qty + ${remaining}
    `;
    console.log(`  ✓ oi=${item.id} ${item.card_number} x${remaining}`);
    inserted++;
  }

  console.log(`\nFulfilled ${inserted} items. Syncing stock...`);

  // Sync stock for affected cards
  const cardIds = items.map((i: any) => i.id); // need card_ids not oi ids
  const cardIdRows = await sql`
    SELECT DISTINCT oi.card_id FROM order_items oi WHERE oi.order_id = ${orderId} AND oi.removed_at IS NULL
  `;
  const cids = cardIdRows.map((r: any) => r.card_id);

  if (cids.length > 0) {
    await sql`
      UPDATE cards c SET stock = COALESCE(uk.qty, 0) FROM (
        SELECT pi.card_id, GREATEST(SUM(pi.quantity) - COALESCE(
          (SELECT SUM(fe.fulfilled_qty) FROM fulfillment_entries fe
           JOIN order_items oi ON oi.id = fe.order_item_id AND oi.removed_at IS NULL
           WHERE oi.card_id = pi.card_id), 0), 0)::int AS qty
        FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
        WHERE pu.status = 'received' AND pi.condition NOT LIKE '状態%'
        GROUP BY pi.card_id
      ) uk WHERE c.id = uk.card_id AND c.id = ANY(${cids})
    `;
    console.log(`Stock synced for ${cids.length} cards.`);
  }

  console.log("Done!");
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
