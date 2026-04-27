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
  const ids = ['A-5281950', 'A-5094027', 'A-5069755', 'A-5004931', 'A-4879575'];
  const rows = await sql`SELECT remambo_order_id, id, status, items_total_jpy FROM purchases WHERE remambo_order_id = ANY(${ids}) ORDER BY remambo_order_id`;
  console.log('Already imported:', rows.length);
  for (const r of rows) console.log(' ', r.remambo_order_id, 'id='+r.id, r.status, '¥'+r.items_total_jpy);
  const missing = ids.filter(id => !rows.find((r: any) => r.remambo_order_id === id));
  console.log('To import:', missing.join(' '));
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
