import postgres from "postgres";
import { readFileSync, existsSync } from "fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

async function main() {
  const all = await sql`
    SELECT pi.condition, count(*)::int as cnt, sum(pi.quantity)::int as qty
    FROM purchase_items pi
    GROUP BY pi.condition ORDER BY pi.condition
  `;
  console.log("All conditions in purchase_items:");
  console.table(all);

  const aItems = await sql`
    SELECT pi.condition, c.card_number, c.name, pi.quantity, pi.unit_price_jpy, pu.remambo_order_id
    FROM purchase_items pi
    JOIN cards c ON c.id = pi.card_id
    JOIN purchases pu ON pu.id = pi.purchase_id
    WHERE pi.condition LIKE '状態%'
    ORDER BY pu.remambo_order_id, c.card_number
  `;
  if (aItems.length > 0) {
    console.log("\nA- condition items:");
    console.table(aItems);
  } else {
    console.log("\nNo A- condition items found.");
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
