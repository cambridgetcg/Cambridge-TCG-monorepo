#!/usr/bin/env tsx
/**
 * Detailed comparison of a single purchase: DB vs Remambo.
 * Usage: npx tsx tools/verify-purchase-detail.ts --order=A-6140128 [--headed]
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
const orderArg = process.argv.find(a => a.startsWith("--order="))?.split("=")[1] || "";
const orderId = orderArg.startsWith("A-") ? orderArg : `A-${orderArg}`;
const sql = postgres(process.env.DATABASE_URL || "");

async function main() {
  if (!orderArg) { console.error("Usage: --order=A-XXXXXXX"); process.exit(1); }

  // Get DB items
  const dbItems = await sql`
    SELECT pi.*, c.card_number, c.name as card_name
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

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const remamboItems: { name: string; qty: number; price: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Price: ¥") && i + 1 < lines.length && lines[i + 1].startsWith("Quantity:")) {
      const price = parseInt(lines[i].replace(/[^\d]/g, "")) || 0;
      const qty = parseInt(lines[i + 1].replace(/[^\d]/g, "")) || 0;
      const name = (i >= 2 ? lines[i - 2] : "unknown");
      remamboItems.push({ name, qty, price });
    }
  }

  // Build lookup maps
  // DB: key by card_number + price
  const dbMap = new Map<string, { qty: number; price: number; condition: string; cardNumber: string; name: string }>();
  for (const item of dbItems) {
    const key = `${item.card_number}|${item.unit_price_jpy}`;
    const existing = dbMap.get(key);
    if (existing) {
      existing.qty += item.quantity;
    } else {
      dbMap.set(key, { qty: item.quantity, price: item.unit_price_jpy, condition: item.condition, cardNumber: item.card_number, name: item.card_name });
    }
  }

  // Remambo: extract card number from name
  const remamboMap = new Map<string, { qty: number; price: number; name: string }>();
  for (const item of remamboItems) {
    const cardNum = item.name.match(/^[\w-]+/)?.[0] || item.name;
    const key = `${cardNum}|${item.price}`;
    const existing = remamboMap.get(key);
    if (existing) {
      existing.qty += item.qty;
    } else {
      remamboMap.set(key, { qty: item.qty, price: item.price, name: item.name });
    }
  }

  console.log(`\n=== Detailed Comparison: ${orderId} ===\n`);
  console.log(`DB: ${dbItems.length} line items, ${dbItems.reduce((s: number, i: any) => s + i.quantity, 0)} qty, ¥${dbItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price_jpy, 0)}`);
  console.log(`Remambo: ${remamboItems.length} items, ${remamboItems.reduce((s, i) => s + i.qty, 0)} qty, ¥${remamboItems.reduce((s, i) => s + i.qty * i.price, 0)}\n`);

  // Find differences
  const allKeys = new Set([...dbMap.keys(), ...remamboMap.keys()]);
  let diffs = 0;

  for (const key of Array.from(allKeys).sort()) {
    const db = dbMap.get(key);
    const rm = remamboMap.get(key);

    if (db && rm) {
      if (db.qty !== rm.qty) {
        diffs++;
        console.log(`  QTY DIFF: ${key.split("|")[0]} @¥${key.split("|")[1]}`);
        console.log(`    DB: ${db.qty}  Remambo: ${rm.qty}`);
      }
    } else if (db && !rm) {
      diffs++;
      console.log(`  DB ONLY: ${db.cardNumber} @¥${db.price} x${db.qty} (${db.condition})`);
      // Check if same card exists at different price in Remambo
      for (const [rk, rv] of remamboMap) {
        if (rk.startsWith(db.cardNumber + "|") && !dbMap.has(rk)) {
          console.log(`    → Remambo has this card at ¥${rv.price} x${rv.qty} instead`);
        }
      }
    } else if (!db && rm) {
      diffs++;
      const cardNum = key.split("|")[0];
      console.log(`  REMAMBO ONLY: ${cardNum} @¥${rm.price} x${rm.qty} "${rm.name}"`);
      // Check if same card exists at different price in DB
      for (const [dk, dv] of dbMap) {
        if (dk.startsWith(cardNum + "|") && !remamboMap.has(dk)) {
          console.log(`    → DB has this card at ¥${dv.price} x${dv.qty} instead`);
        }
      }
    }
  }

  if (diffs === 0) {
    console.log("  No differences found.");
  } else {
    console.log(`\n  Total differences: ${diffs}`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
