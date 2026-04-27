#!/usr/bin/env tsx
/**
 * Verify existing purchases in DB match actual Remambo order contents.
 * Scrapes each Remambo order and compares item counts/quantities.
 *
 * Usage: npx tsx tools/verify-purchases.ts [--headed] [--order=ID]
 */
import { readFileSync } from "fs";
import { chromium, type Page } from "playwright";
import postgres from "postgres";

if (require("fs").existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const headed = process.argv.includes("--headed");
const onlyOrder = process.argv.find(a => a.startsWith("--order="))?.split("=")[1];
const sql = postgres(process.env.DATABASE_URL || "");

async function scrapeOrder(page: Page, orderId: string): Promise<{ items: { name: string; qty: number; price: number }[]; total: number; itemsTotal: number }> {
  const numericId = orderId.replace("A-", "");
  await page.goto(`https://www.remambo.jp/office/orders/details?orderId=${numericId}`, { waitUntil: "networkidle" });

  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const items: { name: string; qty: number; price: number }[] = [];
  // Parse text: item name line, then "Stock buy — ...", then "Price: ¥ N", then "Quantity: N"
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Price: ¥") && i + 1 < lines.length && lines[i + 1].startsWith("Quantity:")) {
      const price = parseInt(lines[i].replace(/[^\d]/g, "")) || 0;
      const qty = parseInt(lines[i + 1].replace(/[^\d]/g, "")) || 0;
      // Name is 2 lines before "Price:" (before "Stock buy —")
      const name = (i >= 2 ? lines[i - 2] : "unknown");
      items.push({ name, qty, price });
    }
  }

  // Extract "Items total price: ¥ NNNN" from text
  const totalMatch = text.match(/Items total price:\s*¥\s*([\d,]+)/);
  const itemsTotal = totalMatch ? parseInt(totalMatch[1].replace(/,/g, "")) : 0;

  const calcTotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  return { items, total: calcTotal, itemsTotal };
}

async function main() {
  // Get all purchases from DB
  const dbPurchases = await sql`
    SELECT p.id, p.remambo_order_id, p.items_total_jpy,
      COALESCE(SUM(pi.quantity), 0)::int as db_total_qty,
      COUNT(pi.id)::int as db_item_count,
      COALESCE(SUM(pi.quantity * pi.unit_price_jpy), 0)::int as db_calc_total
    FROM purchases p
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    GROUP BY p.id, p.remambo_order_id, p.items_total_jpy
    ORDER BY p.remambo_order_id
  `;

  const toCheck = onlyOrder
    ? dbPurchases.filter(p => p.remambo_order_id === onlyOrder || p.remambo_order_id === `A-${onlyOrder}`)
    : dbPurchases;

  console.log(`\n=== Purchase Verification ===`);
  console.log(`  Checking ${toCheck.length} purchases against Remambo...\n`);

  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Login
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', process.env.REMAMBO_EMAIL || "");
  await page.fill('input[placeholder="Password"]', process.env.REMAMBO_PASS || process.env.REMAMBO_PASSWORD || "");
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");
  console.log("  Logged in.\n");

  let mismatches = 0;

  for (const purchase of toCheck) {
    const orderId = purchase.remambo_order_id;
    process.stdout.write(`  ${orderId}: `);

    try {
      const remambo = await scrapeOrder(page, orderId);
      const remamboQty = remambo.items.reduce((s, i) => s + i.qty, 0);
      const remamboItemCount = remambo.items.length;

      const qtyMatch = remamboQty === purchase.db_total_qty;
      const itemMatch = remamboItemCount === purchase.db_item_count;
      const totalMatch = Math.abs(remambo.total - purchase.db_calc_total) < 100; // allow small rounding

      if (qtyMatch && itemMatch && totalMatch) {
        console.log(`OK (${remamboItemCount} items, ${remamboQty} qty, ¥${remambo.total})`);
      } else {
        mismatches++;
        console.log(`MISMATCH`);
        if (!itemMatch) console.log(`    Items: Remambo=${remamboItemCount} vs DB=${purchase.db_item_count}`);
        if (!qtyMatch) console.log(`    Qty:   Remambo=${remamboQty} vs DB=${purchase.db_total_qty}`);
        if (!totalMatch) console.log(`    Total: Remambo=¥${remambo.total} vs DB=¥${purchase.db_calc_total}`);

        // Show per-item breakdown from Remambo
        console.log(`    Remambo items:`);
        for (const item of remambo.items) {
          console.log(`      ${item.name.slice(0, 50)} x${item.qty} @¥${item.price}`);
        }
      }
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Checked: ${toCheck.length}`);
  console.log(`  Mismatches: ${mismatches}`);
  console.log(`  OK: ${toCheck.length - mismatches}`);

  await browser.close();
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
