#!/usr/bin/env tsx
import postgres from 'postgres';
import { readFileSync, existsSync } from 'fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 });

async function main() {
  // Check the December purchases
  const purchases = await sql`
    SELECT p.id, p.remambo_order_id, p.status, p.items_total_jpy,
      (SELECT count(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count,
      (SELECT sum(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_qty
    FROM purchases p
    WHERE p.remambo_order_id IN ('A-5281950', 'A-5094027', 'A-5004931')
    ORDER BY p.remambo_order_id
  `;

  console.log('December 2025 purchases imported:');
  for (const p of purchases) {
    console.log(`  ${p.remambo_order_id} (id=${p.id}): ${p.status}, ${p.item_count} items, qty=${p.total_qty}, ¥${p.items_total_jpy}`);
  }

  // Spot-check stock for a few cards
  const spotCheck = await sql`
    SELECT c.card_number, c.name, c.stock, c.pending_stock
    FROM cards c
    WHERE c.id IN (3498, 3577, 3586, 43916, 37996)
    ORDER BY c.card_number
  `;

  console.log('\nSpot-check stock levels:');
  for (const c of spotCheck) {
    console.log(`  ${c.card_number} ${c.name?.slice(0, 30)}: stock=${c.stock}, pending=${c.pending_stock}`);
  }

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
