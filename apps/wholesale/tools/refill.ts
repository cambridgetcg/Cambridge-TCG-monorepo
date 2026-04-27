#!/usr/bin/env tsx
// Refill Pipeline — reorders from CardRush via Remambo to maintain stock targets.
// Queries shortfalls (target_qty - stock - pending_stock), submits to Remambo cart,
// updates pending_stock after submission.
//
// Usage:
//   npx tsx tools/refill.ts --dry-run                                    # preview shortfalls
//   npx tsx tools/refill.ts --headed                                     # submit with visible browser
//   npx tsx tools/refill.ts --headed --set=OP13 --tier=low              # low-value EMS order (£3–£20)
//   npx tsx tools/refill.ts --headed --set=OP13 --tier=high             # high-value DHL order (£20–£100)
//   npx tsx tools/refill.ts --headed --min-price=2 --max-price=10       # custom price range
//   npx tsx tools/refill.ts --headed --batch-size=20                     # pause every 20

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import postgres from "postgres";
import { getRemamboSession } from "./lib/remambo-session";
import { submitToRemambo } from "./lib/remambo-submit";

// Load .env.local
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
const batchSize = kvArgs["--batch-size"] ? Number(kvArgs["--batch-size"]) : 39;
const setCode   = kvArgs["--set"]        ?? null;
const tier      = kvArgs["--tier"]       ?? null; // "low" (£3–£20, EMS) or "high" (£20–£100, DHL)
const limit     = kvArgs["--limit"]      ? Number(kvArgs["--limit"])      : null;

// Tier presets override manual min/max
const TIER_RANGES: Record<string, { min: number; max: number; label: string }> = {
  low:  { min: 5,  max: 20,  label: "Low-value (£5–£20) — EMS shipping" },
  high: { min: 20, max: 100, label: "High-value (£20–£100) — DHL shipping" },
};

if (tier && !TIER_RANGES[tier]) {
  console.error(`Unknown tier "${tier}". Use --tier=low or --tier=high.`);
  process.exit(1);
}

const minPrice = tier ? TIER_RANGES[tier].min : (kvArgs["--min-price"] ? Number(kvArgs["--min-price"]) : null);
const maxPrice = tier ? TIER_RANGES[tier].max : (kvArgs["--max-price"] ? Number(kvArgs["--max-price"]) : null);

if (!dryRun && !headed) {
  console.error("Safety: pass --dry-run to preview, or --headed to run with a visible browser.");
  console.error("  npx tsx tools/refill.ts --dry-run");
  console.error("  npx tsx tools/refill.ts --headed");
  process.exit(1);
}

const ITEM_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefillCard {
  id: number;
  card_number: string;
  name: string;
  set_code: string;
  cardrush_url: string;
  cardrush_jpy: number;
  price_gbp: number;
  stock: number;
  pending_stock: number;
  target_qty: number;
  refill_qty: number;
}

// ---------------------------------------------------------------------------
// DB: Query shortfalls
// ---------------------------------------------------------------------------

async function queryShortfalls(sql: postgres.Sql): Promise<RefillCard[]> {
  const minP = minPrice ?? 0;
  const maxP = maxPrice ?? 999999;

  const rows = setCode
    ? await sql`
        SELECT
          c.id,
          c.card_number,
          c.name,
          c.set_code,
          c.cardrush_url,
          c.cardrush_jpy,
          c.price::float AS price_gbp,
          c.stock,
          c.pending_stock,
          st.target_qty,
          GREATEST(st.target_qty - c.stock - c.pending_stock, 0) AS refill_qty
        FROM cards c
        JOIN stock_targets st
          ON c.price >= st.price_min AND c.price < st.price_max
        WHERE c.category = 'singles'
          AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
          AND c.cardrush_jpy > 0
          AND c.set_code = ${setCode}
          AND c.price >= ${minP}
          AND c.price < ${maxP}
          AND st.target_qty - c.stock - c.pending_stock > 0
        ORDER BY (c.stock::float / NULLIF(st.target_qty, 0)) ASC, c.cardrush_jpy DESC
      `
    : await sql`
        SELECT
          c.id,
          c.card_number,
          c.name,
          c.set_code,
          c.cardrush_url,
          c.cardrush_jpy,
          c.price::float AS price_gbp,
          c.stock,
          c.pending_stock,
          st.target_qty,
          GREATEST(st.target_qty - c.stock - c.pending_stock, 0) AS refill_qty
        FROM cards c
        JOIN stock_targets st
          ON c.price >= st.price_min AND c.price < st.price_max
        WHERE c.category = 'singles'
          AND c.cardrush_url IS NOT NULL AND c.cardrush_url != ''
          AND c.cardrush_jpy > 0
          AND c.price >= ${minP}
          AND c.price < ${maxP}
          AND st.target_qty - c.stock - c.pending_stock > 0
        ORDER BY (c.stock::float / NULLIF(st.target_qty, 0)) ASC, c.cardrush_jpy DESC
      `;

  return (rows as any[]).map((r) => ({
    ...r,
    cardrush_jpy: Number(r.cardrush_jpy),
    price_gbp: Number(r.price_gbp),
    stock: Number(r.stock),
    pending_stock: Number(r.pending_stock),
    target_qty: Number(r.target_qty),
    refill_qty: Number(r.refill_qty),
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
  stock_before: number;
  pending_before: number;
  target: number;
  status: "submitted" | "failed" | "dry-run";
  error?: string;
}

function writeManifest(
  entries: ManifestEntry[],
  meta: {
    runAt: string;
    dryRun: boolean;
    submitted: number;
    failed: number;
    totalJpy: number;
    filters: { set: string | null; minPrice: number | null; maxPrice: number | null };
  }
) {
  mkdirSync(path.join(__dirname, "logs"), { recursive: true });
  const ts = meta.runAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const file = path.join(__dirname, "logs", `refill-${ts}.json`);
  writeFileSync(file, JSON.stringify({ ...meta, items: entries }, null, 2));
  console.log(`  Manifest → ${path.relative(process.cwd(), file)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== Refill Pipeline ===");
  console.log(dryRun ? "  Mode: DRY RUN" : "  Mode: LIVE (headed browser)");
  if (setCode) console.log(`  Filter: set=${setCode}`);
  if (tier) {
    console.log(`  Tier: ${TIER_RANGES[tier].label}`);
  } else if (minPrice !== null || maxPrice !== null) {
    console.log(`  Filter: price £${minPrice ?? 0} – £${maxPrice ?? "∞"}`);
  }
  console.log();

  // Connect to DB
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required. Set it in .env.local.");
    process.exit(1);
  }
  const sql = postgres(connectionString, { max: 1, ssl: "require" });

  let session: Awaited<ReturnType<typeof getRemamboSession>> | null = null;
  try {
    // Step 1: Query shortfalls
    console.log("[1/3] Querying stock shortfalls...");
    let cards = await queryShortfalls(sql);

    if (cards.length === 0) {
      console.log("  No shortfalls found. Stock levels are on target.");
      return;
    }

    const totalUnits = cards.reduce((s, c) => s + c.refill_qty, 0);
    const totalJpy = cards.reduce((s, c) => s + c.refill_qty * c.cardrush_jpy, 0);
    console.log(`  ${cards.length} cards need refill, ${totalUnits} total units, ¥${totalJpy.toLocaleString()}`);

    // Apply limit
    if (limit && cards.length > limit) {
      cards = cards.slice(0, limit);
      console.log(`  Limited to first ${limit} cards`);
    }

    if (dryRun) {
      console.log("\n  [DRY RUN] Shortfalls:\n");
      console.log(
        "  " +
        "Card".padEnd(14) +
        "Name".padEnd(29) +
        "Stock".padStart(6) +
        "Pend".padStart(6) +
        "Tgt".padStart(5) +
        "Refill".padStart(7) +
        "  @JPY".padStart(9) +
        "  £GBP"
      );
      console.log("  " + "-".repeat(90));

      const manifest: ManifestEntry[] = [];
      for (const c of cards) {
        console.log(
          `  ${c.card_number.padEnd(14)}${c.name.substring(0, 28).padEnd(29)}${String(c.stock).padStart(6)}${String(c.pending_stock).padStart(6)}${String(c.target_qty).padStart(5)}${("x" + c.refill_qty).padStart(7)}  ¥${c.cardrush_jpy.toLocaleString().padStart(6)}  £${c.price_gbp.toFixed(2)}`
        );
        manifest.push({
          card_id: c.id,
          card_number: c.card_number,
          name: c.name,
          set_code: c.set_code,
          qty: c.refill_qty,
          price_jpy: c.cardrush_jpy,
          line_total_jpy: c.refill_qty * c.cardrush_jpy,
          url: c.cardrush_url,
          stock_before: c.stock,
          pending_before: c.pending_stock,
          target: c.target_qty,
          status: "dry-run",
        });
      }
      const dryTotal = cards.reduce((s, c) => s + c.refill_qty * c.cardrush_jpy, 0);
      console.log(`\n  Total: ${cards.reduce((s, c) => s + c.refill_qty, 0)} units  ¥${dryTotal.toLocaleString()}`);
      console.log("  Dry run complete — nothing submitted.\n");
      writeManifest(manifest, {
        runAt: new Date().toISOString(),
        dryRun: true,
        submitted: 0,
        failed: 0,
        totalJpy: dryTotal,
        filters: { set: setCode, minPrice, maxPrice },
      });
      return;
    }

    // Step 2: Get Remambo session
    console.log("\n[2/3] Connecting to Remambo...");
    session = await getRemamboSession(headed);

    // Step 3: Submit
    console.log(`\n[3/3] Submitting ${cards.length} cards to Remambo cart...`);
    let submitted = 0;
    let failed = 0;
    const manifest: ManifestEntry[] = [];

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      process.stdout.write(
        `  [${i + 1}/${cards.length}] ${c.card_number} ${c.name.substring(0, 30)} x${c.refill_qty} @¥${c.cardrush_jpy.toLocaleString()} ... `
      );

      const entry: ManifestEntry = {
        card_id: c.id,
        card_number: c.card_number,
        name: c.name,
        set_code: c.set_code,
        qty: c.refill_qty,
        price_jpy: c.cardrush_jpy,
        line_total_jpy: c.refill_qty * c.cardrush_jpy,
        url: c.cardrush_url,
        stock_before: c.stock,
        pending_before: c.pending_stock,
        target: c.target_qty,
        status: "submitted",
      };

      const submitItem = {
        url: c.cardrush_url,
        price: c.cardrush_jpy,
        qty: c.refill_qty,
        comment: `Stock refill — ${c.card_number} ${c.set_code}`,
      };

      const handleSuccess = async (livePrice: number | null, finalPrice: number) => {
        await sql`
          UPDATE cards
          SET pending_stock = pending_stock + ${c.refill_qty}
          WHERE id = ${c.id}
        `;
        entry.price_jpy = finalPrice;
        entry.line_total_jpy = c.refill_qty * finalPrice;
        submitted++;
        if (livePrice && livePrice < c.cardrush_jpy) {
          console.log(`OK (live ¥${livePrice.toLocaleString()} < DB ¥${c.cardrush_jpy.toLocaleString()}, used lower)`);
        } else {
          console.log("OK");
        }
      };

      try {
        const { livePrice, finalPrice } = await submitToRemambo(session.page, submitItem);
        await handleSuccess(livePrice, finalPrice);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Browser/context dropped — reconnect and retry once
        if (msg.includes("closed") || msg.includes("ERR_ABORTED") || msg.includes("crashed")) {
          process.stdout.write("(reconnecting...) ");
          try {
            session.page = await session.reconnect();
            const { livePrice, finalPrice } = await submitToRemambo(session.page, submitItem);
            await handleSuccess(livePrice, finalPrice);
          } catch (retryErr) {
            failed++;
            entry.status = "failed";
            entry.error = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.log(`FAILED — ${entry.error}`);
          }
        } else {
          failed++;
          entry.status = "failed";
          entry.error = msg;
          console.log(`FAILED — ${msg}`);
        }
      }

      manifest.push(entry);

      // Batch pause — stop at every batchSize items so user can checkout on Remambo
      const batchPos = (i + 1) % batchSize;
      const isLast = i === cards.length - 1;
      if (batchPos === 0 && !isLast) {
        const batchNum = Math.floor((i + 1) / batchSize);
        const remaining = cards.length - (i + 1);
        console.log(`\n--- Batch ${batchNum} complete (${i + 1} submitted so far) ---`);
        console.log(`  → Go to https://www.remambo.jp/cart and place this order now.`);
        console.log(`  → ${remaining} cards remaining in the next batch.`);
        console.log("  Press Enter when ready to continue...");
        await new Promise<void>((resolve) => {
          process.stdin.resume();
          process.stdin.setEncoding("utf-8");
          process.stdin.once("data", () => {
            process.stdin.pause();
            resolve();
          });
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
      runAt: new Date().toISOString(),
      dryRun: false,
      submitted,
      failed,
      totalJpy: submittedJpy,
      filters: { set: setCode, minPrice, maxPrice },
    });
  } finally {
    if (session) await session.close();
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
