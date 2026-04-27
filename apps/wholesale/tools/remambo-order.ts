#!/usr/bin/env tsx
// Remambo Order Pipeline — submits unfulfilled paid-order items to Remambo cart
// Usage: npx tsx tools/remambo-order.ts [--order=<id>] [--all-paid] [--dry-run] [--headed]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { chromium, type Page } from "playwright";
import postgres from "postgres";

// Load .env.local (same pattern as scrape-cardrush.ts)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));
const kvArgs = Object.fromEntries(
  args.filter((a) => a.includes("=")).map((a) => {
    const [k, ...v] = a.split("=");
    return [k, v.join("=")];
  })
);

const dryRun = flags.has("--dry-run");
const headed = flags.has("--headed");
const orderId = kvArgs["--order"] ? Number(kvArgs["--order"]) : null;
const limit = kvArgs["--limit"] ? Number(kvArgs["--limit"]) : null;

const REMAMBO_EMAIL = process.env.REMAMBO_EMAIL || "aaasiadog@gmail.com";
const REMAMBO_PASS = process.env.REMAMBO_PASS || "17171514Alex";
const ITEM_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnfulfilledItem {
  id: number;
  order_id: number;
  quantity: number;
  card_number: string;
  name: string;
  set_code: string;
  cardrush_url: string;
  cardrush_jpy: number;
  unfulfilled_qty: number;
}

// ---------------------------------------------------------------------------
// Helpers: tag + manifest
// ---------------------------------------------------------------------------

function itemTag(item: UnfulfilledItem): string {
  if ((item as any)._mintRemainder) return " [Mint remainder]";
  if ((item as any)._downgraded) {
    const partial = (item as any)._partial ? " partial" : "";
    return ` [A- ↓¥${(item as any)._saving}${partial}]`;
  }
  return "";
}

interface ManifestEntry {
  order_item_id: number;
  order_id: number;
  card_number: string;
  name: string;
  set_code: string;
  qty: number;
  price_jpy: number;
  url: string;
  tag: string;
  status: "submitted" | "failed" | "dry-run";
  error?: string;
}

function writeManifest(entries: ManifestEntry[], meta: {
  runAt: string;
  dryRun: boolean;
  orderFilter: number | null;
  limit: number | null;
  submitted: number;
  failed: number;
}) {
  const dir = path.join(__dirname, "logs");
  mkdirSync(dir, { recursive: true });
  const ts = meta.runAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const file = path.join(dir, `remambo-${ts}.json`);
  writeFileSync(file, JSON.stringify({ ...meta, items: entries }, null, 2));
  console.log(`  Manifest → ${path.relative(process.cwd(), file)}`);
}

// ---------------------------------------------------------------------------
// DB: Query unfulfilled items
// ---------------------------------------------------------------------------

async function queryUnfulfilledItems(sql: postgres.Sql): Promise<UnfulfilledItem[]> {
  const orderFilter = orderId
    ? sql`AND o.id = ${orderId}`
    : sql``;

  const rows = await sql`
    SELECT
      oi.id,
      oi.order_id,
      oi.quantity,
      c.card_number,
      c.name,
      c.set_code,
      c.cardrush_url,
      c.cardrush_jpy,
      oi.quantity - COALESCE(SUM(fe.fulfilled_qty), 0) AS unfulfilled_qty
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN cards c ON oi.card_id = c.id
    LEFT JOIN fulfillment_entries fe ON fe.order_item_id = oi.id
    WHERE o.status = 'paid'
      AND oi.remambo_submitted_at IS NULL
      AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
      ${orderFilter}
    GROUP BY oi.id, c.id
    HAVING oi.quantity - COALESCE(SUM(fe.fulfilled_qty), 0) > 0
    ORDER BY oi.order_id, c.card_number
  `;

  return rows as unknown as UnfulfilledItem[];
}

// ---------------------------------------------------------------------------
// DB: Check for cheaper A- condition variants
// ---------------------------------------------------------------------------

async function applyAMinusDowngrades(
  sql: postgres.Sql,
  items: UnfulfilledItem[]
): Promise<{ downgrades: number; partials: number; extras: UnfulfilledItem[] }> {
  if (items.length === 0) return { downgrades: 0, partials: 0, extras: [] };

  const mintUrls = items.map((i) => i.cardrush_url);

  // Match via Mint URL → find the (card_number, name) group → get A- from same group.
  // This avoids cross-variant mismatches (e.g. standard vs compass-background parallel).
  const aMinusRows = await sql`
    SELECT DISTINCT ON (mint.card_number, mint.name)
      mint.card_number,
      mint.name,
      mint.cardrush_url AS mint_url,
      aminus.cardrush_url AS aminus_url,
      aminus.price_jpy,
      aminus.stock
    FROM condition_prices mint
    JOIN condition_prices aminus
      ON aminus.card_number = mint.card_number
      AND aminus.name = mint.name
      AND aminus.snapshot_date = mint.snapshot_date
      AND aminus.condition = '状態A-'
      AND aminus.stock > 0
      AND aminus.cardrush_url IS NOT NULL AND aminus.cardrush_url != ''
    WHERE mint.condition = 'Mint'
      AND mint.cardrush_url = ANY(${mintUrls})
    ORDER BY mint.card_number, mint.name, mint.snapshot_date DESC
  `;

  // Key by Mint URL so we match the exact variant the order item points to
  const aMinusMap = new Map<string, { price: number; stock: number; url: string }>(
    aMinusRows.map((r: any) => [r.mint_url, { price: r.price_jpy, stock: r.stock, url: r.aminus_url }])
  );

  let downgrades = 0;
  let partials = 0;
  const extras: UnfulfilledItem[] = [];

  for (const item of items) {
    const aMinus = aMinusMap.get(item.cardrush_url);
    if (!aMinus) continue;

    const saving = item.cardrush_jpy - aMinus.price;
    if (saving <= 100) continue;

    if (aMinus.stock >= item.unfulfilled_qty) {
      // Full downgrade — enough A- stock for entire qty
      item.cardrush_url = aMinus.url;
      item.cardrush_jpy = aMinus.price;
      (item as any)._downgraded = true;
      (item as any)._saving = saving;
      downgrades++;
    } else {
      // Partial — split into A- portion + Mint remainder
      const aMinusQty = aMinus.stock;
      const mintQty = item.unfulfilled_qty - aMinusQty;

      // Clone original as Mint remainder (keeps original URL/price)
      const mintRemainder: UnfulfilledItem = {
        ...item,
        unfulfilled_qty: mintQty,
      };
      (mintRemainder as any)._mintRemainder = true;

      // Downgrade original item to A- with reduced qty
      item.unfulfilled_qty = aMinusQty;
      item.cardrush_url = aMinus.url;
      item.cardrush_jpy = aMinus.price;
      (item as any)._downgraded = true;
      (item as any)._partial = true;
      (item as any)._saving = saving;

      extras.push(mintRemainder);
      partials++;
    }
  }

  return { downgrades, partials, extras };
}

// ---------------------------------------------------------------------------
// Playwright: Login
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', REMAMBO_EMAIL);
  await page.fill('input[placeholder="Password"]', REMAMBO_PASS);
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");

  // Verify login succeeded — should redirect away from /login
  if (page.url().includes("/login")) {
    throw new Error("Login failed — still on login page. Check REMAMBO_EMAIL / REMAMBO_PASS.");
  }
}

// ---------------------------------------------------------------------------
// Playwright: Submit one item
// ---------------------------------------------------------------------------

async function submitItem(page: Page, item: UnfulfilledItem): Promise<void> {
  // Step 1: Navigate to new order form and submit Cardrush URL
  await page.goto("https://www.remambo.jp/neworder", { waitUntil: "networkidle" });
  await page.fill('input[name="url"]', item.cardrush_url);
  await page.click("button.button");
  await page.waitForLoadState("networkidle");

  // Read Remambo's auto-detected price (live from the site)
  const priceInput = page.locator('input[name="price"]');
  const autoPrice = await priceInput.inputValue();
  const livePrice = autoPrice ? Number(autoPrice) : null;

  // Use the lower of DB price vs live price (never overpay)
  const finalPrice = livePrice && livePrice > 0
    ? Math.min(item.cardrush_jpy, livePrice)
    : item.cardrush_jpy;

  if (livePrice && livePrice < item.cardrush_jpy) {
    process.stdout.write(`[live ¥${livePrice} < DB ¥${item.cardrush_jpy}] `);
  }

  // Step 2: Fill order details
  const title = `${item.card_number} ${item.name}`;
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="price"]', String(finalPrice));
  await page.fill('input[name="qty"]', String(item.unfulfilled_qty));
  await page.fill('input[name="shipping"]', "0");
  await page.fill(
    'input[name="comments"]',
    `Order #${item.order_id} — ${item.card_number} ${item.set_code}`
  );

  // Uncheck buyer protection if checked
  const protection = page.locator('input[name="protection"]');
  if (await protection.isChecked()) {
    await protection.uncheck();
  }

  // Submit form (step 2 uses the same button class)
  await page.click("button.button");
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== Remambo Order Pipeline ===");
  if (orderId) {
    console.log(`  Target: Order #${orderId}`);
  } else {
    console.log("  Target: All paid orders");
  }
  if (dryRun) console.log("  Mode: DRY RUN (no browser, no DB updates)");
  if (headed) console.log("  Browser: headed (visible)");
  console.log();

  // Connect to DB
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required. Set it in .env.local.");
    process.exit(1);
  }
  const sql = postgres(connectionString, { max: 1, ssl: "require" });

  let browser;
  try {
    // Step 1: Query unfulfilled items
    console.log("[1/3] Querying unfulfilled items...");
    const items = await queryUnfulfilledItems(sql);

    if (items.length === 0) {
      console.log("  No unfulfilled items found. Nothing to do.");
      return;
    }

    const orderIds = [...new Set(items.map((i) => i.order_id))];
    console.log(`  Found ${items.length} items across ${orderIds.length} order(s)`);

    // Double quantity for cheap items (< ¥2,000) to build stock
    // Must run BEFORE A- check so stock comparison sees actual qty
    let doubled = 0;
    for (const item of items) {
      if (item.cardrush_jpy < 2000) {
        item.unfulfilled_qty *= 2;
        doubled++;
      }
    }
    if (doubled > 0) {
      console.log(`  Doubled qty for ${doubled} item(s) under ¥2,000`);
    }

    // Check for cheaper A- condition variants (>100 JPY saving)
    const { downgrades, partials, extras } = await applyAMinusDowngrades(sql, items);
    if (downgrades > 0 || partials > 0) {
      console.log(`  A- downgrades: ${downgrades} full, ${partials} partial (>¥100 saving)`);
    }
    if (extras.length > 0) {
      items.push(...extras);
      // Re-sort so Mint remainders sit next to their A- counterpart
      items.sort((a, b) => a.order_id - b.order_id || a.card_number.localeCompare(b.card_number));
    }

    // Apply --limit if specified
    if (limit && items.length > limit) {
      items.splice(limit);
      console.log(`  Limited to first ${limit} item(s)`);
    }

    if (dryRun) {
      console.log("\n  Items that would be submitted:\n");
      const manifest: ManifestEntry[] = [];
      for (const item of items) {
        const tag = itemTag(item);
        console.log(
          `  Order #${item.order_id} | ${item.card_number} ${item.name} (x${item.unfulfilled_qty}) @ ¥${item.cardrush_jpy.toLocaleString()}${tag}`
        );
        manifest.push({
          order_item_id: item.id,
          order_id: item.order_id,
          card_number: item.card_number,
          name: item.name,
          set_code: item.set_code,
          qty: item.unfulfilled_qty,
          price_jpy: item.cardrush_jpy,
          url: item.cardrush_url,
          tag: tag.trim(),
          status: "dry-run",
        });
      }
      console.log("\n  Dry run complete — no items submitted.");
      writeManifest(manifest, {
        runAt: new Date().toISOString(),
        dryRun: true,
        orderFilter: orderId,
        limit,
        submitted: 0,
        failed: 0,
      });
      return;
    }

    // Step 2: Login to Remambo
    console.log("\n[2/3] Logging in to Remambo...");
    browser = await chromium.launch({ headless: !headed });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    console.log(`  Logged in as ${REMAMBO_EMAIL}`);

    // Step 3: Submit each item
    console.log("\n[3/3] Submitting to Remambo cart...");
    let submitted = 0;
    let failed = 0;
    const manifest: ManifestEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const label = `${item.card_number} ${item.name}`;
      const tag = itemTag(item);
      process.stdout.write(
        `  [${i + 1}/${items.length}] ${label} (x${item.unfulfilled_qty}) @ ¥${item.cardrush_jpy.toLocaleString()}${tag} ... `
      );

      const entry: ManifestEntry = {
        order_item_id: item.id,
        order_id: item.order_id,
        card_number: item.card_number,
        name: item.name,
        set_code: item.set_code,
        qty: item.unfulfilled_qty,
        price_jpy: item.cardrush_jpy,
        url: item.cardrush_url,
        tag: tag.trim(),
        status: "submitted",
      };

      try {
        await submitItem(page, item);

        // Mark as submitted in DB
        await sql`
          UPDATE order_items
          SET remambo_submitted_at = NOW()
          WHERE id = ${item.id}
        `;

        submitted++;
        console.log("OK");
      } catch (err) {
        failed++;
        entry.status = "failed";
        entry.error = err instanceof Error ? err.message : String(err);
        console.log("FAILED");
        console.error(`    Error: ${entry.error}`);
      }

      manifest.push(entry);

      // Delay between items
      if (i < items.length - 1) {
        await sleep(ITEM_DELAY_MS);
      }
    }

    // Summary
    console.log("\n=== Summary ===");
    console.log(`  Submitted: ${submitted} | Failed: ${failed}`);
    console.log("  Review cart → https://www.remambo.jp/cart");
    writeManifest(manifest, {
      runAt: new Date().toISOString(),
      dryRun: false,
      orderFilter: orderId,
      limit,
      submitted,
      failed,
    });
  } finally {
    if (browser) await browser.close();
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
