import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1, ssl: "require" });

  // The 11 card_numbers from Remambo order 6002858
  const cardNumbers = ["OP01-016","OP05-100","OP01-121","OP03-092","ST01-012","OP02-120","OP02-004","OP02-085","OP02-099","OP13-120","OP13-119"];

  // Check which exist in the cards table
  const cards = await sql`
    SELECT id, sku, card_number, name, set_code, cardrush_url, cardrush_jpy
    FROM cards
    WHERE card_number = ANY(${cardNumbers})
    ORDER BY card_number
  `;

  console.log("=== Cards in catalog matching Remambo order ===");
  console.log("Found", cards.length, "cards\n");
  const foundNumbers = new Set<string>();
  for (const c of cards) {
    foundNumbers.add(c.card_number);
    console.log(`  #${c.id} ${c.sku} | ${c.card_number} ${c.name} | ${c.set_code} | ¥${c.cardrush_jpy} | ${c.cardrush_url}`);
  }

  console.log("\n=== Missing from catalog ===\n");
  for (const cn of cardNumbers) {
    if (!foundNumbers.has(cn)) {
      console.log(`  ${cn} — NOT IN CARDS TABLE`);
    }
  }

  // Also check condition_prices to get full details for missing cards
  const missing = cardNumbers.filter(cn => !foundNumbers.has(cn));
  if (missing.length > 0) {
    const cpRows = await sql`
      SELECT DISTINCT ON (card_number, name) card_number, name, condition, cardrush_url, price_jpy
      FROM condition_prices
      WHERE card_number = ANY(${missing})
        AND condition = 'Mint'
      ORDER BY card_number, name, snapshot_date DESC
    `;
    console.log("\n=== condition_prices Mint entries for missing cards ===\n");
    for (const r of cpRows) {
      console.log(`  ${r.card_number} ${r.name} | ${r.condition} | ¥${r.price_jpy} | ${r.cardrush_url}`);
    }
  }

  // Check cards table structure - what columns are required
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'cards'
    ORDER BY ordinal_position
  `;
  console.log("\n=== cards table columns ===\n");
  for (const c of cols) {
    console.log(`  ${c.column_name} ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : 'nullable'} ${c.column_default || ''}`);
  }

  await sql.end();
}
main().catch(console.error);
