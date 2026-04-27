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

const text = readFileSync("tools/logs/orders-xhr.txt", "utf-8");

// Parse order IDs with their dates from the concatenated text
// Format: A-XXXXXXX ... received/shipped/etc DD.MM.YYYY
const orderPattern = /A-(\d{7})/g;
const orders: { id: string; date: string; title: string }[] = [];

let match;
while ((match = orderPattern.exec(text)) !== null) {
  const id = "A-" + match[1];
  // Find the date after this order ID (within next 500 chars)
  const after = text.slice(match.index, match.index + 500);
  const dateMatch = after.match(/received(\d{2}\.\d{2}\.\d{4})/);
  const date = dateMatch ? dateMatch[1] : "";
  // Get title snippet
  const titleMatch = after.match(/A-\d{7}\s*(.*?)(?:\.{3}|¥)/);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 60) : "";
  orders.push({ id, date, title });
}

function isInRange(dateStr: string): boolean {
  const [d, m, y] = dateStr.split(".").map(Number);
  if (!d || !m || !y) return false;
  if (y === 2025 && m === 12) return true;
  if (y === 2026 && (m === 1 || m === 2)) return true;
  return false;
}

async function main() {
  const target = orders.filter(o => isInRange(o.date));
  console.log(`Total orders: ${orders.length}`);
  console.log(`Dec 2025 – Feb 2026 orders: ${target.length}\n`);

  // Check which are already imported
  const ids = target.map(o => o.id);
  const existing = await sql`SELECT remambo_order_id FROM purchases WHERE remambo_order_id = ANY(${ids})`;
  const existingSet = new Set(existing.map((r: any) => r.remambo_order_id));

  console.log("ID\t\tDate\t\tStatus\t\tTitle");
  console.log("-".repeat(100));
  const toImport: string[] = [];
  for (const o of target) {
    const status = existingSet.has(o.id) ? "✓ imported" : "TO IMPORT";
    console.log(`${o.id}\t${o.date}\t${status}\t${o.title}`);
    if (!existingSet.has(o.id)) toImport.push(o.id.replace("A-", ""));
  }

  console.log(`\nAlready imported: ${existingSet.size}`);
  console.log(`To import: ${toImport.length}`);
  if (toImport.length > 0) {
    console.log("\nOrder IDs to import:");
    console.log(toImport.join(" "));
  }

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
