#!/usr/bin/env tsx
/**
 * Scrape the Remambo orders list page to understand the structure.
 * Saves screenshot + text dump for analysis.
 *
 * Usage: npx tsx tools/scrape-remambo-orders.ts [--headed]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { chromium } from "playwright";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const headed = process.argv.includes("--headed");
const REMAMBO_EMAIL = process.env.REMAMBO_EMAIL || "";
const REMAMBO_PASS = process.env.REMAMBO_PASSWORD || process.env.REMAMBO_PASS || "";

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Login
  console.log("Logging in...");
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', REMAMBO_EMAIL);
  await page.fill('input[placeholder="Password"]', REMAMBO_PASS);
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");
  console.log("Logged in.");

  // Navigate to orders list
  console.log("Navigating to /office/orders...");
  await page.goto("https://www.remambo.jp/office/orders", { waitUntil: "networkidle" });

  const dir = path.join(__dirname, "logs");
  mkdirSync(dir, { recursive: true });

  // Save screenshot
  await page.screenshot({ path: path.join(dir, "remambo-orders-list.png"), fullPage: true });

  // Save text dump
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(path.join(dir, "remambo-orders-list.txt"), text);

  // Save HTML for structure analysis
  const html = await page.evaluate(() => document.body.innerHTML);
  writeFileSync(path.join(dir, "remambo-orders-list.html"), html);

  // Extract all links on the page
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map(a => ({
      href: a.href,
      text: a.innerText.trim().slice(0, 80),
    }));
  });
  writeFileSync(path.join(dir, "remambo-orders-links.json"), JSON.stringify(links, null, 2));

  console.log(`\nSaved to tools/logs/:`);
  console.log(`  remambo-orders-list.png`);
  console.log(`  remambo-orders-list.txt`);
  console.log(`  remambo-orders-list.html`);
  console.log(`  remambo-orders-links.json`);

  // Print text dump
  console.log("\n=== TEXT DUMP ===\n");
  console.log(text);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
