#!/usr/bin/env tsx
/**
 * List all Remambo orders across all pages.
 * Usage: npx tsx tools/list-all-remambo-orders.ts [--headed]
 */
import { readFileSync } from "fs";
import { chromium, type Page } from "playwright";

if (require("fs").existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const headed = process.argv.includes("--headed");

interface Order {
  id: string;
  date: string;
  status: string;
  title: string;
  total: string;
}

function parseOrders(text: string): Order[] {
  const lines = text.split("\n").map(l => l.trim());
  const orders: Order[] = [];
  for (let i = 0; i < lines.length; i++) {
    const idMatch = lines[i].match(/^A-(\d+)$/);
    if (idMatch) {
      let title = "", status = "", date = "", total = "";
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (lines[j].match(/^\d{2}\.\d{2}\.\d{4}$/)) date = lines[j];
        if (lines[j].match(/^(paid to seller|negotiations|purchase process|Remambo warehouse|shipped|received|canceled)/)) status = lines[j];
        if (lines[j].match(/^¥[\d,]+$/)) total = lines[j];
        if (!title && lines[j].match(/^[\w-]/) && lines[j].includes("...")) title = lines[j].split("...")[0].trim();
        if (!title && lines[j].match(/^(OP|EB|ST|P-|PRB)/)) title = lines[j];
      }
      orders.push({ id: "A-" + idMatch[1], date, status, title, total });
    }
  }
  return orders;
}

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', process.env.REMAMBO_EMAIL || "");
  await page.fill('input[placeholder="Password"]', process.env.REMAMBO_PASS || process.env.REMAMBO_PASSWORD || "");
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");
  console.log("Logged in.\n");

  const allOrders: Order[] = [];
  const seenIds = new Set<string>();

  // Try different status filters to get all orders
  const statuses = ["paid_to_seller", "purchase_process", "remambo_warehouse", "shipped", "received"];

  // First try default page (shows all active)
  for (let pg = 1; pg <= 5; pg++) {
    const url = `https://www.remambo.jp/office/orders?page=${pg}`;
    await page.goto(url, { waitUntil: "networkidle" });
    const text = await page.evaluate(() => document.body.innerText);

    // Check total
    const totalMatch = text.match(/Total:\s*(\d+)/);
    const totalOnPage = totalMatch ? parseInt(totalMatch[1]) : 0;

    const orders = parseOrders(text);
    let newCount = 0;
    for (const o of orders) {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id);
        allOrders.push(o);
        newCount++;
      }
    }

    console.log(`Page ${pg}: found ${orders.length} orders (${newCount} new), total=${totalOnPage}`);
    if (orders.length === 0 || newCount === 0) break;

    // Check if we have all
    const pageMatch = text.match(/Page:\s*(\d+)\/(\d+)/);
    if (pageMatch && pg >= parseInt(pageMatch[2])) break;
  }

  // Also check "received" status for older orders
  console.log("\nChecking received orders...");
  for (let pg = 1; pg <= 5; pg++) {
    await page.goto(`https://www.remambo.jp/office/orders?page=${pg}&status=received`, { waitUntil: "networkidle" });
    const text = await page.evaluate(() => document.body.innerText);
    const orders = parseOrders(text);
    let newCount = 0;
    for (const o of orders) {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id);
        o.status = o.status || "received";
        allOrders.push(o);
        newCount++;
      }
    }
    console.log(`Received page ${pg}: found ${orders.length} (${newCount} new)`);
    if (orders.length === 0 || newCount === 0) break;
    const pageMatch = text.match(/Page:\s*(\d+)\/(\d+)/);
    if (pageMatch && pg >= parseInt(pageMatch[2])) break;
  }

  // Check "shipped"
  console.log("\nChecking shipped orders...");
  for (let pg = 1; pg <= 3; pg++) {
    await page.goto(`https://www.remambo.jp/office/orders?page=${pg}&status=shipped`, { waitUntil: "networkidle" });
    const text = await page.evaluate(() => document.body.innerText);
    const orders = parseOrders(text);
    let newCount = 0;
    for (const o of orders) {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id);
        o.status = o.status || "shipped";
        allOrders.push(o);
        newCount++;
      }
    }
    console.log(`Shipped page ${pg}: found ${orders.length} (${newCount} new)`);
    if (orders.length === 0 || newCount === 0) break;
  }

  await browser.close();

  // Sort by date
  allOrders.sort((a, b) => {
    const [ad, am, ay] = a.date.split(".").map(Number);
    const [bd, bm, by_] = b.date.split(".").map(Number);
    return (ay - by_) || (am - bm) || (ad - bd);
  });

  console.log(`\n=== All Orders (${allOrders.length}) ===\n`);
  for (const o of allOrders) {
    console.log(`${o.id}\t${o.date}\t${o.status}\t${o.total}\t${o.title}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
