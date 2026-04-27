#!/usr/bin/env tsx
/**
 * Find all December 2025 orders on Remambo.
 */
import { writeFileSync } from "fs";
import path from "path";
import { getRemamboSession } from "./lib/remambo-session";

interface Order { id: string; date: string; total: string; title: string }

function parseOrders(text: string): Order[] {
  const lines = text.split("\n").map(l => l.trim());
  const orders: Order[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/A-(\d{7})/);
    if (m) {
      let date = "", total = "", title = "";
      // Search within context around the order ID
      for (let j = i - 3; j < Math.min(i + 15, lines.length); j++) {
        if (j < 0) continue;
        // Date can be on same line or nearby
        const dateMatch = lines[j].match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dateMatch && !date) date = dateMatch[1];
        const totalMatch = lines[j].match(/¥([\d,]+)/);
        if (totalMatch && !total && j > i) total = "¥" + totalMatch[1];
        if (!title && j > i && lines[j].match(/^(OP|EB|ST|P-|PRB)/))
          title = lines[j].trim().slice(0, 70);
      }
      orders.push({ id: "A-" + m[1], date, total, title });
    }
  }
  return orders;
}

async function main() {
  const headed = process.argv.includes("--headed");
  const session = await getRemamboSession(headed);
  const { page } = session;

  try {
    console.log("Loading orders page...");
    await page.goto("https://www.remambo.jp/office/orders", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Uncheck all, check only "received" (7), submit
    await page.evaluate(() => {
      const ids = ['status_2', 'status_5', 'status_6', 'status_7', 'status_8', 'status_10', 'status_16', 'status_13'];
      for (const id of ids) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.checked = false;
      }
      const received = document.getElementById('status_7') as HTMLInputElement;
      if (received) received.checked = true;
    });

    await page.evaluate(() => {
      const form = document.getElementById('search_status') as HTMLFormElement;
      if (form) form.onsubmit?.call(form, new Event('submit'));
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Set per-page to All
    await page.evaluate(() => {
      const sel = document.querySelector('select[name="ps"]') as HTMLSelectElement | null;
      if (sel) {
        sel.value = "0";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    const text = await page.evaluate(() => document.body.innerText);
    writeFileSync(path.join(__dirname, "logs", "orders-all.txt"), text);

    // Show a sample around the first A- order ID
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/A-\d{7}/)) {
        console.log(`\n--- Sample around line ${i} ---`);
        for (let j = Math.max(0, i - 2); j < Math.min(i + 10, lines.length); j++) {
          console.log(`  ${j}: "${lines[j]}"`);
        }
        break;
      }
    }

    const allOrders = parseOrders(text);
    console.log(`\nTotal orders parsed: ${allOrders.length}`);

    // Show first 5 with dates
    for (const o of allOrders.slice(0, 5)) {
      console.log(`  ${o.id}\t${o.date}\t${o.total}\t${o.title}`);
    }

    // Filter December 2025
    const decemberOrders = allOrders.filter(o => o.date.includes(".12.2025"));
    console.log(`\n=== December 2025 Orders: ${decemberOrders.length} ===\n`);
    for (const o of decemberOrders) {
      console.log(`${o.id}\t${o.date}\t${o.total}\t${o.title}`);
    }

    if (decemberOrders.length > 0) {
      console.log("\nOrder IDs for import:");
      console.log(decemberOrders.map(o => o.id.replace("A-", "")).join(" "));
    }
  } finally {
    await session.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
