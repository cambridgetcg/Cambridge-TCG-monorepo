#!/usr/bin/env tsx
import { readFileSync } from "fs";
import { chromium } from "playwright";

if (require("fs").existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', process.env.REMAMBO_EMAIL || "");
  await page.fill('input[placeholder="Password"]', process.env.REMAMBO_PASS || process.env.REMAMBO_PASSWORD || "");
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");

  await page.goto("https://www.remambo.jp/office/orders?onPage=50", { waitUntil: "networkidle" });

  const orders = await page.evaluate(() => {
    const rows = document.querySelectorAll("tr");
    const results: { id: string; title: string; status: string; date: string }[] = [];
    for (const row of rows) {
      const link = row.querySelector('a[href*="orderId="]');
      if (!link) continue;
      const href = (link as HTMLAnchorElement).href;
      const idMatch = href.match(/orderId=(\d+)/);
      if (!idMatch) continue;
      const id = "A-" + idMatch[1];
      const cells = row.querySelectorAll("td");
      const title = cells[2]?.textContent?.trim().split("\n")[0]?.trim() || "";
      const status = cells[3]?.textContent?.trim() || "";
      const date = cells[4]?.textContent?.trim() || "";
      results.push({ id, title, status, date });
    }
    return results;
  });

  const seen = new Set<string>();
  for (const o of orders) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    console.log(`${o.id}\t${o.status}\t${o.date}\t${o.title}`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
