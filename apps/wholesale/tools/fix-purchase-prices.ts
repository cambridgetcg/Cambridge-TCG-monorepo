#!/usr/bin/env tsx
/**
 * Fix purchase_items prices to match actual Remambo order prices.
 * Usage: npx tsx tools/fix-purchase-prices.ts --order=A-6140128 [--headed] [--dry-run]
 */
import { readFileSync } from "fs";
import { chromium } from "playwright";
import postgres from "postgres";

if (require("fs").existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const headed = process.argv.includes("--headed");
const dryRun = process.argv.includes("--dry-run");
const orderArg = process.argv.find(a => a.startsWith("--order="))?.split("=")[1] || "";
const orderId = orderArg.startsWith("A-") ? orderArg : `A-${orderArg}`;
const sql = postgres(process.env.DATABASE_URL || "");

async function main() {
  if (!orderArg) { console.error("Usage: --order=A-XXXXXXX [--dry-run] [--headed]"); process.exit(1); }

  console.log(`\n=== Fix Purchase Prices: ${orderId} ${dryRun ? "(DRY RUN)" : ""} ===\n`);

  // Get DB items
  const dbItems = await sql`
    SELECT pi.id, pi.card_id, pi.quantity, pi.unit_price_jpy, pi.condition,
           c.card_number, c.name as card_name
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    LEFT JOIN cards c ON c.id = pi.card_id
    WHERE p.remambo_order_id = ${orderId}
    ORDER BY pi.unit_price_jpy, c.card_number
  `;

  // Scrape Remambo
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', process.env.REMAMBO_EMAIL || "");
  await page.fill('input[placeholder="Password"]', process.env.REMAMBO_PASS || process.env.REMAMBO_PASSWORD || "");
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");

  const numericId = orderId.replace("A-", "");
  await page.goto(`https://www.remambo.jp/office/orders/details?orderId=${numericId}`, { waitUntil: "networkidle" });
  const text = await page.evaluate(() => document.body.innerText);
  await browser.close();

  // Parse Remambo items
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const remamboItems: { cardNumber: string; name: string; qty: number; price: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Price: ¥") && i + 1 < lines.length && lines[i + 1].startsWith("Quantity:")) {
      const price = parseInt(lines[i].replace(/[^\d]/g, "")) || 0;
      const qty = parseInt(lines[i + 1].replace(/[^\d]/g, "")) || 0;
      const name = (i >= 2 ? lines[i - 2] : "unknown");
      const cardNumber = name.match(/^[\w-]+/)?.[0] || "";
      remamboItems.push({ cardNumber, name, qty, price });
    }
  }

  // Match DB items to Remambo items by card_number + quantity
  // Group both by card_number
  const dbByCard = new Map<string, typeof dbItems>();
  for (const item of dbItems) {
    const key = item.card_number;
    if (!dbByCard.has(key)) dbByCard.set(key, []);
    dbByCard.get(key)!.push(item);
  }

  const rmByCard = new Map<string, typeof remamboItems>();
  for (const item of remamboItems) {
    const key = item.cardNumber;
    if (!rmByCard.has(key)) rmByCard.set(key, []);
    rmByCard.get(key)!.push(item);
  }

  let updates = 0;
  let totalDiff = 0;

  for (const [cardNum, dbGroup] of dbByCard) {
    const rmGroup = rmByCard.get(cardNum);
    if (!rmGroup) {
      console.log(`  WARNING: ${cardNum} not found in Remambo order`);
      continue;
    }

    // Sort both by quantity (desc) then price to align them
    const dbSorted = [...dbGroup].sort((a, b) => b.quantity - a.quantity || a.unit_price_jpy - b.unit_price_jpy);
    const rmSorted = [...rmGroup].sort((a, b) => b.qty - a.qty || a.price - b.price);

    // Match by quantity
    for (const dbItem of dbSorted) {
      const matchIdx = rmSorted.findIndex(rm => rm.qty === dbItem.quantity);
      if (matchIdx === -1) {
        console.log(`  WARNING: ${cardNum} x${dbItem.quantity} @¥${dbItem.unit_price_jpy} — no qty match in Remambo`);
        continue;
      }
      const rmItem = rmSorted.splice(matchIdx, 1)[0];

      if (dbItem.unit_price_jpy !== rmItem.price) {
        const diff = (rmItem.price - dbItem.unit_price_jpy) * dbItem.quantity;
        totalDiff += diff;
        updates++;
        console.log(`  ${cardNum} x${dbItem.quantity}: ¥${dbItem.unit_price_jpy} → ¥${rmItem.price} (${diff > 0 ? "+" : ""}¥${diff})`);

        if (!dryRun) {
          await sql`UPDATE purchase_items SET unit_price_jpy = ${rmItem.price} WHERE id = ${dbItem.id}`;
        }
      }
    }
  }

  // Update purchase items_total_jpy
  if (updates > 0 && !dryRun) {
    const newTotal = await sql`
      SELECT COALESCE(SUM(pi.quantity * pi.unit_price_jpy), 0)::int as total
      FROM purchase_items pi
      JOIN purchases p ON p.id = pi.purchase_id
      WHERE p.remambo_order_id = ${orderId}
    `;
    await sql`UPDATE purchases SET items_total_jpy = ${newTotal[0].total} WHERE remambo_order_id = ${orderId}`;
    console.log(`\n  Updated purchases.items_total_jpy → ¥${newTotal[0].total}`);
  }

  console.log(`\n  Price updates: ${updates}`);
  console.log(`  Net difference: ${totalDiff > 0 ? "+" : ""}¥${totalDiff}`);
  if (dryRun) console.log(`  (dry run — no changes made)`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
