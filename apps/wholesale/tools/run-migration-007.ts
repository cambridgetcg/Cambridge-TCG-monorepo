import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Running migration 007: stock_targets...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stock_targets (
      id SERIAL PRIMARY KEY,
      price_min NUMERIC(10, 2) NOT NULL,
      price_max NUMERIC(10, 2) NOT NULL,
      target_qty INTEGER NOT NULL
    )
  `);

  // Check if data already exists
  const existing = await db.execute(sql`SELECT count(*) as cnt FROM stock_targets`);
  const count = Number((existing as any)[0]?.cnt ?? 0);

  if (count === 0) {
    await db.execute(sql`
      INSERT INTO stock_targets (price_min, price_max, target_qty) VALUES
        (0, 5, 8),
        (5, 15, 4),
        (15, 50, 2),
        (50, 9999, 1)
    `);
    console.log("Inserted default tiers");
  } else {
    console.log(`Tiers already exist (${count} rows)`);
  }

  console.log("Done!");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
