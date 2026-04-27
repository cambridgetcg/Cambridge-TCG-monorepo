#!/usr/bin/env tsx
// Stock-buy pipeline for promo cards — submits to Remambo cart.
// Quantities are driven by price tiers, not customer orders.
//
// Price tiers:
//   < ¥600   → 6 copies
//   < ¥1,500 → 4 copies
//   < ¥3,000 → 2 copies
//   < ¥4,000 → 1 copy
//   ≥ ¥4,000 → skip
//
// Usage:
//   npx tsx tools/order-promos.ts --dry-run                              # preview
//   npx tsx tools/order-promos.ts --headed                               # submit, pause every 39 for checkout
//   npx tsx tools/order-promos.ts --headed --batch-size=20               # pause every 20 instead
//   npx tsx tools/order-promos.ts --headed --resume=tools/logs/xxx.json  # retry failed items

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { chromium, type Page } from "playwright";
import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));
const kvArgs = Object.fromEntries(
  args.filter((a) => a.includes("=")).map((a) => {
    const [k, ...v] = a.split("=");
    return [k, v.join("=")];
  })
);

const dryRun    = flags.has("--dry-run");
const headed    = flags.has("--headed");
const limit     = kvArgs["--limit"]      ? Number(kvArgs["--limit"])      : null;
const fromCard  = kvArgs["--from"]       ? Number(kvArgs["--from"])       : 1;   // 1-indexed, skip first N-1 cards
const batchSize = kvArgs["--batch-size"] ? Number(kvArgs["--batch-size"]) : 39;  // Remambo cart max
const resume    = kvArgs["--resume"] ?? null; // path to previous manifest JSON — retry failed items only
const setCode   = kvArgs["--set"]        ?? null; // e.g. --set=OP14; if omitted, defaults to P-% promos
const source    = kvArgs["--source"]    ?? "tiers"; // "tiers" (price-tier qty) or "targets" (stock target shortfall)
const minPrice  = kvArgs["--min-price"] ? Number(kvArgs["--min-price"]) : null; // GBP minimum price filter
const maxPrice  = kvArgs["--max-price"] ? Number(kvArgs["--max-price"]) : null; // GBP maximum price filter

if (!dryRun && !headed) {
  console.error("Safety: pass --dry-run to preview, or --headed to run with a visible browser.");
  console.error("  npx tsx tools/order-promos.ts --dry-run");
  console.error("  npx tsx tools/order-promos.ts --headed");
  process.exit(1);
}

const REMAMBO_EMAIL = process.env.REMAMBO_EMAIL || "aaasiadog@gmail.com";
const REMAMBO_PASS  = process.env.REMAMBO_PASS  || "17171514Alex";
const ITEM_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromoCard {
  card_id: number;
  card_number: string;
  name: string;
  set_code: string;
  cardrush_url: string;
  cardrush_jpy: number;
  stock: number;
  qty: number; // computed from price tier
}

// ---------------------------------------------------------------------------
// Price tier logic
// ---------------------------------------------------------------------------

function tierQty(priceJpy: number): number {
  if (priceJpy < 600)  return 6;
  if (priceJpy < 1500) return 4;
  if (priceJpy < 3000) return 2;
  if (priceJpy < 4000) return 1;
  return 0; // skip
}

// ---------------------------------------------------------------------------
// DB query
// ---------------------------------------------------------------------------

async function queryPromoCards(sql: postgres.Sql): Promise<PromoCard[]> {
  // Stock-targets source: qty = target_qty - stock - pending_stock
  if (source === "targets") {
    const minP = minPrice ?? 0;
    const maxP = maxPrice ?? 999999;
    const rows = setCode
      ? await sql`
          SELECT
            c.id        AS card_id,
            c.card_number,
            c.name,
            c.set_code,
            c.cardrush_url,
            c.cardrush_jpy,
            c.stock,
            c.price::float AS price_gbp,
            GREATEST(COALESCE(st.target_qty, 0) - c.stock - c.pending_stock, 0) AS to_order_qty
          FROM cards c
          LEFT JOIN stock_targets st
            ON c.price >= st.price_min AND c.price < st.price_max
          WHERE c.category = 'singles'
            AND c.price IS NOT NULL AND c.price > 0
            AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
            AND c.cardrush_jpy > 0
            AND c.set_code = ${setCode}
            AND c.price >= ${minP}
            AND c.price <= ${maxP}
            AND COALESCE(st.target_qty, 0) - c.stock - c.pending_stock > 0
          ORDER BY c.cardrush_jpy ASC, c.card_number ASC
        `
      : await sql`
          SELECT
            c.id        AS card_id,
            c.card_number,
            c.name,
            c.set_code,
            c.cardrush_url,
            c.cardrush_jpy,
            c.stock,
            c.price::float AS price_gbp,
            GREATEST(COALESCE(st.target_qty, 0) - c.stock - c.pending_stock, 0) AS to_order_qty
          FROM cards c
          LEFT JOIN stock_targets st
            ON c.price >= st.price_min AND c.price < st.price_max
          WHERE c.category = 'singles'
            AND c.price IS NOT NULL AND c.price > 0
            AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
            AND c.cardrush_jpy > 0
            AND c.price >= ${minP}
            AND c.price <= ${maxP}
            AND COALESCE(st.target_qty, 0) - c.stock - c.pending_stock > 0
          ORDER BY c.cardrush_jpy ASC, c.card_number ASC
        `;
    return (rows as any[]).map((r) => ({
      ...r,
      cardrush_jpy: Number(r.cardrush_jpy),
      qty: Number(r.to_order_qty),
    }));
  }

  // Default: price-tier source
  const rows = setCode
    ? await sql`
        SELECT
          c.id        AS card_id,
          c.card_number,
          c.name,
          c.set_code,
          c.cardrush_url,
          c.cardrush_jpy,
          c.stock
        FROM cards c
        WHERE c.set_code = ${setCode}
          AND c.category = 'singles'
          AND c.stock > 0
          AND c.cardrush_jpy >= 200
          AND c.cardrush_jpy < 4000
          AND c.cardrush_url IS NOT NULL
        ORDER BY c.cardrush_jpy ASC, c.card_number ASC
      `
    : await sql`
        SELECT
          c.id        AS card_id,
          c.card_number,
          c.name,
          c.set_code,
          c.cardrush_url,
          c.cardrush_jpy,
          c.stock
        FROM cards c
        WHERE c.card_number LIKE 'P-%'
          AND c.category = 'singles'
          AND c.stock > 0
          AND c.cardrush_jpy >= 200
          AND c.cardrush_jpy < 4000
          AND c.cardrush_url IS NOT NULL
        ORDER BY c.cardrush_jpy ASC, c.card_number ASC
      `;

  return (rows as any[]).map((r) => ({
    ...r,
    cardrush_jpy: Number(r.cardrush_jpy),
    qty: Math.min(tierQty(Number(r.cardrush_jpy)), r.stock), // never order more than in stock
  }));
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

interface ManifestEntry {
  card_id: number;
  card_number: string;
  name: string;
  set_code: string;
  qty: number;
  price_jpy: number;
  line_total_jpy: number;
  url: string;
  status: "submitted" | "failed" | "dry-run";
  error?: string;
}

function writeManifest(
  entries: ManifestEntry[],
  meta: {
    runAt: string;
    dryRun: boolean;
    limit: number | null;
    submitted: number;
    failed: number;
    totalJpy: number;
  }
) {
  mkdirSync(path.join(__dirname, "logs"), { recursive: true });
  const ts = meta.runAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const file = path.join(__dirname, "logs", `promos-${ts}.json`);
  writeFileSync(file, JSON.stringify({ ...meta, items: entries }, null, 2));
  console.log(`  Manifest → ${path.relative(process.cwd(), file)}`);
}

// ---------------------------------------------------------------------------
// Playwright: login + submit
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', REMAMBO_EMAIL);
  await page.fill('input[placeholder="Password"]', REMAMBO_PASS);
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) {
    throw new Error("Login failed — still on login page. Check REMAMBO_EMAIL / REMAMBO_PASS.");
  }
}

async function submitCard(page: Page, card: PromoCard): Promise<{ livePrice: number | null }> {
  await page.goto("https://www.remambo.jp/neworder", { waitUntil: "networkidle" });
  await page.fill('input[name="url"]', card.cardrush_url);
  await page.click("button.button");
  await page.waitForLoadState("networkidle");

  // Read Remambo's auto-detected price (live from the site)
  const priceInput = page.locator('input[name="price"]');
  const autoPrice = await priceInput.inputValue();
  const livePrice = autoPrice ? Number(autoPrice) : null;

  // Use the lower of DB price vs live price (never overpay)
  const finalPrice = livePrice && livePrice > 0
    ? Math.min(card.cardrush_jpy, livePrice)
    : card.cardrush_jpy;

  await page.fill('input[name="title"]', `${card.card_number} ${card.name}`);
  await page.fill('input[name="price"]',    String(finalPrice));
  await page.fill('input[name="qty"]',      String(card.qty));
  await page.fill('input[name="shipping"]', "0");
  await page.fill(
    'input[name="comments"]',
    `Stock buy — ${card.card_number} ${card.set_code}`
  );

  const protection = page.locator('input[name="protection"]');
  if (await protection.isChecked()) await protection.uncheck();

  await page.click("button.button");
  await page.waitForLoadState("networkidle");

  return { livePrice };
}

// Re-create a fresh browser page — used on reconnect after session drop
async function newPage(browser: ReturnType<typeof chromium.launch> extends Promise<infer B> ? B : never) {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  return page;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== Promo Stock-Buy Pipeline ===");
  console.log(dryRun ? "  Mode: DRY RUN\n" : "  Mode: LIVE (headed browser)\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required. Set it in .env.local.");
    process.exit(1);
  }
  const sql = postgres(connectionString, { max: 1, ssl: "require" });

  let browser;
  try {
    // Step 1: Query promo cards
    console.log("[1/3] Querying in-stock promo cards...");
    let cards = await queryPromoCards(sql);

    if (cards.length === 0) {
      console.log("  No in-stock promo cards found. Nothing to do.");
      return;
    }

    // Tier summary
    const tierCounts: Record<string, { cards: number; units: number; jpy: number }> = {};
    for (const c of cards) {
      const tier =
        c.cardrush_jpy < 600  ? "<600 (x6)"  :
        c.cardrush_jpy < 1500 ? "<1500 (x4)" :
        c.cardrush_jpy < 3000 ? "<3000 (x2)" :
                                "<4000 (x1)";
      tierCounts[tier] ??= { cards: 0, units: 0, jpy: 0 };
      tierCounts[tier].cards++;
      tierCounts[tier].units += c.qty;
      tierCounts[tier].jpy   += c.qty * c.cardrush_jpy;
    }
    const totalUnits = cards.reduce((s, c) => s + c.qty, 0);
    const totalJpy   = cards.reduce((s, c) => s + c.qty * c.cardrush_jpy, 0);

    console.log(`  ${cards.length} unique promo cards, ${totalUnits} total units, ¥${totalJpy.toLocaleString()}`);
    for (const [tier, t] of Object.entries(tierCounts)) {
      console.log(`    ${tier.padEnd(12)}  ${String(t.cards).padStart(3)} cards  ${String(t.units).padStart(4)} units  ¥${t.jpy.toLocaleString()}`);
    }

    // --from: skip the first N-1 cards (jump to batch 3 etc.)
    if (fromCard > 1) {
      const skipped = fromCard - 1;
      cards = cards.slice(skipped);
      console.log(`  Starting from card ${fromCard} (skipping first ${skipped})`);
    }

    // --resume: filter to only cards that failed in a previous run
    if (resume) {
      const prev = JSON.parse(readFileSync(resume, "utf-8"));
      const failedUrls = new Set<string>(
        (prev.items as ManifestEntry[])
          .filter((e) => e.status === "failed")
          .map((e) => e.url)
      );
      const before = cards.length;
      cards = cards.filter((c) => failedUrls.has(c.cardrush_url));
      console.log(`  Resuming from ${resume}: ${cards.length} failed items (skipped ${before - cards.length} already submitted)`);
    }

    // Apply limit
    if (limit && cards.length > limit) {
      cards = cards.slice(0, limit);
      const limitJpy = cards.reduce((s, c) => s + c.qty * c.cardrush_jpy, 0);
      console.log(`\n  Limited to first ${limit} cards (¥${limitJpy.toLocaleString()})`);
    }

    if (dryRun) {
      console.log("\n  [DRY RUN] Items that would be submitted:\n");
      const manifest: ManifestEntry[] = [];
      for (const c of cards) {
        console.log(
          `  ${c.card_number.padEnd(14)} ${c.name.substring(0, 28).padEnd(29)} x${c.qty}  @¥${c.cardrush_jpy.toLocaleString().padStart(6)}  =¥${(c.qty * c.cardrush_jpy).toLocaleString()}${(c as any).price_gbp ? `  £${(c as any).price_gbp.toFixed(2)}` : ""}`
        );
        manifest.push({
          card_id: c.card_id, card_number: c.card_number, name: c.name,
          set_code: c.set_code, qty: c.qty, price_jpy: c.cardrush_jpy,
          line_total_jpy: c.qty * c.cardrush_jpy, url: c.cardrush_url, status: "dry-run",
        });
      }
      console.log(`\n  Total: ${cards.reduce((s,c)=>s+c.qty,0)} units  ¥${cards.reduce((s,c)=>s+c.qty*c.cardrush_jpy,0).toLocaleString()}`);
      console.log("  Dry run complete — nothing submitted.\n");
      writeManifest(manifest, {
        runAt: new Date().toISOString(), dryRun: true, limit,
        submitted: 0, failed: 0, totalJpy: cards.reduce((s,c)=>s+c.qty*c.cardrush_jpy,0),
      });
      return;
    }

    // Step 2: Login
    console.log("\n[2/3] Logging in to Remambo...");
    browser = await chromium.launch({ headless: false });
    let page = await newPage(browser);
    console.log(`  Logged in as ${REMAMBO_EMAIL}`);

    // Step 3: Submit
    console.log(`\n[3/3] Submitting ${cards.length} cards to Remambo cart...`);
    let submitted = 0;
    let failed    = 0;
    const manifest: ManifestEntry[] = [];

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      process.stdout.write(
        `  [${i + 1}/${cards.length}] ${c.card_number} ${c.name.substring(0, 30)} x${c.qty} @¥${c.cardrush_jpy.toLocaleString()} ... `
      );

      const entry: ManifestEntry = {
        card_id: c.card_id, card_number: c.card_number, name: c.name,
        set_code: c.set_code, qty: c.qty, price_jpy: c.cardrush_jpy,
        line_total_jpy: c.qty * c.cardrush_jpy, url: c.cardrush_url, status: "submitted",
      };

      try {
        const { livePrice } = await submitCard(page, c);
        submitted++;
        if (livePrice && livePrice < c.cardrush_jpy) {
          console.log(`OK (live ¥${livePrice.toLocaleString()} < DB ¥${c.cardrush_jpy.toLocaleString()}, used lower)`);
        } else {
          console.log("OK");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Browser/context dropped — reconnect and retry once
        if (msg.includes("closed") || msg.includes("ERR_ABORTED") || msg.includes("crashed")) {
          console.log("(reconnecting...)");
          try {
            page = await newPage(browser);
            const { livePrice } = await submitCard(page, c);
            submitted++;
            if (livePrice && livePrice < c.cardrush_jpy) {
              console.log(`OK after reconnect (live ¥${livePrice.toLocaleString()} < DB ¥${c.cardrush_jpy.toLocaleString()}, used lower)`);
            } else {
              console.log("OK (after reconnect)");
            }
          } catch (retryErr) {
            failed++;
            entry.status = "failed";
            entry.error  = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.log(`FAILED — ${entry.error}`);
          }
        } else {
          failed++;
          entry.status = "failed";
          entry.error  = msg;
          console.log(`FAILED — ${msg}`);
        }
      }

      manifest.push(entry);

      // Batch pause — stop at every batchSize items so user can checkout on Remambo
      const batchPos = (i + 1) % batchSize;
      const isLast   = i === cards.length - 1;
      if (batchPos === 0 && !isLast) {
        const batchNum  = Math.floor((i + 1) / batchSize);
        const remaining = cards.length - (i + 1);
        console.log(`\n--- Batch ${batchNum} complete (${i + 1} submitted so far) ---`);
        console.log(`  → Go to https://www.remambo.jp/cart and place this order now.`);
        console.log(`  → ${remaining} cards remaining in the next batch.`);
        console.log("  Press Enter when ready to continue...");
        await new Promise<void>((resolve) => {
          process.stdin.resume();
          process.stdin.setEncoding("utf-8");
          process.stdin.once("data", () => { process.stdin.pause(); resolve(); });
        });
        console.log("  Continuing...\n");
      } else if (!isLast) {
        await sleep(ITEM_DELAY_MS);
      }
    }

    const submittedJpy = manifest
      .filter((e) => e.status === "submitted")
      .reduce((s, e) => s + e.line_total_jpy, 0);

    console.log("\n=== Summary ===");
    console.log(`  Submitted: ${submitted}  |  Failed: ${failed}`);
    console.log(`  Cart value: ¥${submittedJpy.toLocaleString()}`);
    console.log("  Review cart → https://www.remambo.jp/cart");
    console.log("  After placing the Remambo order, run:");
    console.log("    npx tsx tools/import-remambo-order.ts --order=<remambo-order-id>");

    writeManifest(manifest, {
      runAt: new Date().toISOString(), dryRun: false, limit,
      submitted, failed, totalJpy: submittedJpy,
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
