#!/usr/bin/env tsx
// CardRush Scraper — scrapes product-group pages, maps to wholesale, upserts to DB
// Usage: npx tsx tools/scrape-cardrush.ts OP01 [--dry-run] [--discover] [--set-all] [--prices-only]

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";

// Load .env.local (overrides shell env — .env.local is the source of truth)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
import { join } from "path";
import { getSetConfig, getAllSetCodes, getGameConfig, SET_CONFIGS, type GameConfig } from "./lib/config";
import { fetchGbpJpyRate } from "./lib/fx-rate";
import { fetchProductGroupPages, fetchProductListPages, fetchDiscoveryPage } from "./lib/cardrush-client";
import {
  parseProductGroupPage,
  parseDiscoveryPage,
  type RawProduct,
} from "./lib/cardrush-parser";
import { mapToWholesale, mapSealedToWholesale, createSkuState, type WholesaleCard, type GlobalSkuState } from "./lib/cardrush-mapper";
import { uploadImagesToS3, s3ImageUrl } from "./lib/s3-images";
// kingdom-089: layered classification wire — heuristic claims emitted
// on every batch alongside the cards INSERT.
import {
  applyClassificationBatch,
  emptyStats as emptyClassifyStats,
  isSubstrateReady as isClassificationSubstrateReady,
  mapLegacyGameCode,
  mergeStats as mergeClassifyStats,
  type BatchClassificationStats,
} from "./lib/cardrush-classify-batch";

// DB imports — only used when not --dry-run
import postgres from "postgres";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

const dryRun = flags.has("--dry-run");
const discover = flags.has("--discover");
const setAll = flags.has("--set-all");
const skipImages = flags.has("--skip-images");
const pricesOnly = flags.has("--prices-only"); // Skip images, only update prices + price_archive
const sealed = flags.has("--sealed"); // Scrape sealed products from product-list page

// Parse --game=<code> flag (default: onepiece)
const gameFlag = args.find((a) => a.startsWith("--game="));
const gameCode = gameFlag ? gameFlag.split("=")[1] : "onepiece";
const resolvedGameConfig = getGameConfig(gameCode);
if (!resolvedGameConfig) {
  console.error(`Unknown game: ${gameCode}. Known games: onepiece, dragonball, pokemon`);
  process.exit(1);
}
const gameConfig: GameConfig = resolvedGameConfig;

// ---------------------------------------------------------------------------
// Discovery mode
// ---------------------------------------------------------------------------

async function runDiscover(gc: GameConfig) {
  console.log(`\n=== CardRush Product-Group Discovery (${gc.dbGameName}) ===\n`);
  const html = await fetchDiscoveryPage(gc.baseUrl);
  const groups = parseDiscoveryPage(html, gc.baseUrl);

  if (groups.length === 0) {
    console.log("No product-group links found. The page structure may have changed.");
    return;
  }

  console.log("\nDiscovered product groups:\n");
  console.log("  ID  | Name");
  console.log("  ----|-----------------------------");
  for (const g of groups) {
    const known = Object.values(SET_CONFIGS).find(
      (s) => s.productGroupId === g.id
    );
    const tag = known ? ` ✓ (${known.code})` : "";
    console.log(`  ${String(g.id).padStart(3)} | ${g.name}${tag}`);
  }

  // Save cache
  const cachePath = join("data", "cardrush", "product-groups.json");
  mkdirSync(join("data", "cardrush"), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(groups, null, 2));
  console.log(`\nSaved to ${cachePath}`);
}

// ---------------------------------------------------------------------------
// Main scrape pipeline
// ---------------------------------------------------------------------------

async function scrapeSet(setCode: string, gc: GameConfig, skuState?: GlobalSkuState) {
  const startTime = Date.now();
  const config = getSetConfig(setCode);
  if (!config) {
    console.error(
      `Unknown set: ${setCode}. Known sets: ${getAllSetCodes().join(", ")}`
    );
    console.error("Run with --discover to find product-group IDs.");
    process.exit(1);
  }

  console.log(`\n=== Scraping ${config.code} (${config.name}) ===`);
  console.log(`  Product group: ${config.productGroupId}`);
  const mode = dryRun ? "DRY RUN (no DB)" : pricesOnly ? "PRICES ONLY (skip images)" : "FULL (with DB upsert)";
  console.log(`  Mode: ${mode}\n`);

  // Step 1: Fetch exchange rate
  console.log("[1/7] Fetching GBP/JPY rate...");
  const gbpJpyRate = await fetchGbpJpyRate();

  // Step 2: Fetch all pages
  console.log("[2/7] Fetching product pages...");
  const htmlPages = await fetchProductGroupPages(config.productGroupId, config.maxPages, gc.baseUrl);

  // Step 3: Parse HTML → raw products
  console.log("[3/7] Parsing HTML...");
  const rawProducts: RawProduct[] = [];
  for (const html of htmlPages) {
    const parsed = parseProductGroupPage(html, gc.baseUrl, gc.parse);
    rawProducts.push(...parsed);
  }
  console.log(`  Parsed ${rawProducts.length} raw product listings`);

  // Step 4: Save raw JSON
  console.log("[4/7] Saving raw data...");
  const today = new Date().toISOString().slice(0, 10);
  const rawDir = join("data", "cardrush", "raw");
  mkdirSync(rawDir, { recursive: true });
  const rawPath = join(rawDir, `${setCode}-${today}.json`);
  writeFileSync(rawPath, JSON.stringify(rawProducts, null, 2));
  console.log(`  Saved ${rawProducts.length} products → ${rawPath}`);

  // Step 5: Map to wholesale
  console.log("[5/7] Mapping to wholesale...");
  const wholesale = mapToWholesale(rawProducts, setCode, gbpJpyRate, skuState, gc.map);

  // Save wholesale JSON
  const wsDir = join("data", "cardrush", "wholesale");
  mkdirSync(wsDir, { recursive: true });
  const wsPath = join(wsDir, `${setCode}-${today}.json`);
  writeFileSync(wsPath, JSON.stringify(wholesale, null, 2));
  console.log(`  Mapped ${wholesale.length} wholesale cards → ${wsPath}`);

  // Print summary
  printSummary(rawProducts, wholesale, setCode);

  // Step 6: Upload images to S3
  if (skipImages || pricesOnly) {
    console.log(`\n[6/7] Skipping image upload (${pricesOnly ? "--prices-only" : "--skip-images"})`);
  } else {
    console.log("\n[6/7] Uploading images to S3...");
    const imgResult = await uploadImagesToS3(wholesale, gc.s3Bucket);
    console.log(`  Uploaded: ${imgResult.uploaded}, Skipped: ${imgResult.skipped}, Failed: ${imgResult.failed}`);

    // Set S3 URLs on wholesale cards for DB upsert
    for (const card of wholesale) {
      if (card.imageUrl) {
        card.imageUrl = s3ImageUrl(card, gc.s3Bucket);
      }
    }

    // Re-save wholesale JSON with S3 URLs
    writeFileSync(wsPath, JSON.stringify(wholesale, null, 2));
  }

  // Step 7: DB upsert
  if (dryRun) {
    console.log("\n[7/7] Skipping DB upsert (--dry-run)");
  } else {
    console.log("\n[7/7] Upserting to database...");
    await upsertToDb(wholesale, gc, setCode, gbpJpyRate, today);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(
  raw: RawProduct[],
  wholesale: WholesaleCard[],
  setCode: string
) {
  console.log(`\n--- Summary for ${setCode} ---`);
  console.log(`  Total raw listings:   ${raw.length}`);
  console.log(`  Wholesale cards:      ${wholesale.length}`);

  if (wholesale.length > 0) {
    const prices = wholesale.map((w) => w.cardrushJpy);
    const minJpy = Math.min(...prices);
    const maxJpy = Math.max(...prices);
    const gbpPrices = wholesale.map((w) => w.pricing.price);
    const minGbp = Math.min(...gbpPrices).toFixed(2);
    const maxGbp = Math.max(...gbpPrices).toFixed(2);
    const parallels = wholesale.filter((w) => w.isParallel).length;
    const standards = wholesale.length - parallels;

    console.log(`  Price range (JPY):    ¥${minJpy.toLocaleString()} – ¥${maxJpy.toLocaleString()}`);
    console.log(`  Price range (GBP):    £${minGbp} – £${maxGbp}`);
    console.log(`  Standard cards:       ${standards}`);
    console.log(`  Parallel cards:       ${parallels}`);
  }

  // Estimate for multi-set runs
  const totalSets = Object.keys(SET_CONFIGS).length;
  if (totalSets > 1) {
    const estMinutes = ((totalSets * 6 * 1.5) / 60).toFixed(1);
    console.log(`  Est. all ${totalSets} sets:     ~${estMinutes} min`);
  }
}

// ---------------------------------------------------------------------------
// Database upsert
// ---------------------------------------------------------------------------

async function upsertToDb(
  wholesale: WholesaleCard[],
  gc: GameConfig,
  setCode: string,
  gbpJpyRate: number,
  today: string
) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required for DB upsert. Use --dry-run to skip.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1, ssl: "require" });

  try {
    // Get-or-create game
    let [game] = await sql`SELECT id FROM games WHERE code = ${gc.dbGameCode}`;
    if (!game) {
      [game] = await sql`
        INSERT INTO games (code, name, slug, active, sort_order)
        VALUES (${gc.dbGameCode}, ${gc.dbGameName}, ${gc.dbGameSlug}, true, 0)
        RETURNING id`;
    }

    // Resolve set for this batch
    let [set] = await sql`SELECT id, name FROM sets WHERE code = ${setCode} AND game_id = ${game.id}`;
    if (!set) {
      const config = getSetConfig(setCode);
      const setName = config?.name ?? setCode;
      [set] = await sql`
        INSERT INTO sets (game_id, code, name, sort_order)
        VALUES (${game.id}, ${setCode}, ${setName}, 0)
        RETURNING id, name`;
    }

    const now = new Date();
    const BATCH_SIZE = 100;

    // kingdom-089: probe classification substrate once per upsert run.
    // Gates the per-batch classifier call below. When false, the tool
    // runs cleanly against pre-migration databases (substrate-honest).
    const classifyReady = await isClassificationSubstrateReady(
      sql as unknown as Parameters<typeof isClassificationSubstrateReady>[0],
    );
    const classifyGameCode = mapLegacyGameCode(gc.dbGameCode);
    let classifyStats: BatchClassificationStats = emptyClassifyStats();
    if (classifyReady && !classifyGameCode) {
      console.log(
        `  classify: skipping — no GameCode mapping for "${gc.dbGameCode}" (extend mapLegacyGameCode in tools/lib/cardrush-classify-batch.ts)`,
      );
    } else if (!classifyReady) {
      console.log(
        "  classify: skipping — classification substrate not applied (drafts/0018 pending)",
      );
    }

    for (let i = 0; i < wholesale.length; i += BATCH_SIZE) {
      const batch = wholesale.slice(i, i + BATCH_SIZE);

      const cardRows = batch.map((card) => ({
        card_number: card.cardNumber,
        sku: card.sku,
        name: card.name,
        set_code: setCode,
        set_name: set.name,
        cardrush_url: card.cardrushUrl,
        cardrush_jpy: card.cardrushJpy,
        gbp_jpy_rate: gbpJpyRate,
        base_gbp: card.pricing.baseGbp,
        price: card.pricing.price,
        last_synced_at: now,
        game_id: game.id,
        set_id: set.id,
        category: "singles",
        rarity: card.rarity ?? null,
        image_url: card.imageUrl ?? null,
      }));

      // Batch upsert cards (stock is derived from UK purchases, not scraped)
      await sql`
        INSERT INTO cards ${sql(cardRows,
          "card_number", "sku", "name", "set_code", "set_name",
          "cardrush_url", "cardrush_jpy", "gbp_jpy_rate", "base_gbp", "price",
          "last_synced_at", "game_id", "set_id", "category", "rarity", "image_url"
        )}
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          set_code = EXCLUDED.set_code,
          set_name = EXCLUDED.set_name,
          cardrush_url = EXCLUDED.cardrush_url,
          cardrush_jpy = EXCLUDED.cardrush_jpy,
          gbp_jpy_rate = EXCLUDED.gbp_jpy_rate,
          base_gbp = EXCLUDED.base_gbp,
          price = EXCLUDED.price,
          last_synced_at = EXCLUDED.last_synced_at,
          game_id = EXCLUDED.game_id,
          set_id = EXCLUDED.set_id,
          rarity = EXCLUDED.rarity,
          image_url = CASE
            WHEN EXCLUDED.image_url LIKE '%/hires/%' THEN EXCLUDED.image_url
            WHEN cards.image_url LIKE '%/hires/%' THEN cards.image_url
            ELSE EXCLUDED.image_url
          END`;

      // Batch select card IDs by SKU
      const skus = batch.map((c) => c.sku);
      const dbCards = await sql`SELECT id, sku FROM cards WHERE sku = ANY(${skus})`;
      const skuToId = new Map(dbCards.map((r: any) => [r.sku, r.id]));

      // (The old `price_history` insert lived here. The table was dropped
      // in kingdom-049 Phase 4 — migration 0011 — with price_archive as
      // the canonical history; the write survived only because this
      // tool's schedule was already a fossil. Removed 2026-07-07, the
      // honest ground §3.)

      // Price archive — full pricing snapshot per card per day
      const archiveRows = batch
        .filter((card) => skuToId.has(card.sku))
        .map((card) => ({
          card_id: skuToId.get(card.sku),
          snapshot_date: today,
          sku: card.sku,
          set_code: setCode,
          category: "singles",
          cardrush_jpy: card.cardrushJpy,
          gbp_jpy_rate: gbpJpyRate,
          base_gbp: card.pricing.baseGbp,
          price: card.pricing.price,
        }));

      if (archiveRows.length > 0) {
        await sql`
          INSERT INTO price_archive ${sql(archiveRows,
            "card_id", "snapshot_date", "sku", "set_code", "category",
            "cardrush_jpy", "gbp_jpy_rate", "base_gbp", "price"
          )}
          ON CONFLICT (card_id, snapshot_date) DO UPDATE SET
            cardrush_jpy = EXCLUDED.cardrush_jpy,
            gbp_jpy_rate = EXCLUDED.gbp_jpy_rate,
            base_gbp = EXCLUDED.base_gbp,
            price = EXCLUDED.price`;
      }

      // kingdom-089: layered classification — emits heuristic claims for
      // any card whose name / rarity / card-number triggers a rule.
      // Idempotent re-application; substrate-honestly skipped when
      // the migration isn't applied or the game isn't mapped.
      if (classifyReady && classifyGameCode) {
        const batchStats = await applyClassificationBatch(
          sql as unknown as Parameters<typeof applyClassificationBatch>[0],
          batch,
          skuToId as ReadonlyMap<string, number>,
          classifyGameCode,
        );
        classifyStats = mergeClassifyStats(classifyStats, batchStats);
      }
    }

    // Verification
    console.log(`  Upserted ${wholesale.length} cards (batch mode)`);
    if (classifyReady && classifyGameCode && classifyStats.cardsScanned > 0) {
      const ruleSummary = Object.entries(classifyStats.ruleHits)
        .sort((a, b) => b[1] - a[1])
        .map(([rule, count]) => `${rule}=${count}`)
        .join(", ");
      console.log(
        `  Classified ${classifyStats.cardsScanned} cards → ${classifyStats.claimsEmitted} claim(s) ` +
          `(${classifyStats.claimsPromoted} promoted, ${classifyStats.claimsShadowed} shadowed, ` +
          `${classifyStats.cardsErrored} errored)` +
          (ruleSummary ? ` · ${ruleSummary}` : ""),
      );
    }
    const [count] = await sql`SELECT COUNT(*) as cnt FROM cards WHERE set_code = ${setCode}`;
    console.log(`  Total ${setCode} cards in DB: ${count.cnt}`);
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// Sealed product scraping
// ---------------------------------------------------------------------------

async function scrapeSealed(gc: GameConfig) {
  const startTime = Date.now();
  console.log(`\n=== Scraping Sealed Products (${gc.dbGameName}) ===`);
  console.log(`  Product list: ${gc.sealedListId}`);
  const mode = dryRun ? "DRY RUN (no DB)" : "FULL (with DB upsert)";
  console.log(`  Mode: ${mode}\n`);

  // Step 1: Fetch exchange rate
  console.log("[1/6] Fetching GBP/JPY rate...");
  const gbpJpyRate = await fetchGbpJpyRate();

  // Step 2: Fetch all pages
  console.log("[2/6] Fetching product-list pages...");
  const htmlPages = await fetchProductListPages(gc.sealedListId, 20, gc.baseUrl);

  // Step 3: Parse HTML → raw products
  console.log("[3/6] Parsing HTML...");
  const rawProducts: RawProduct[] = [];
  for (const html of htmlPages) {
    const parsed = parseProductGroupPage(html, gc.baseUrl, gc.parse); // same HTML structure
    rawProducts.push(...parsed);
  }
  console.log(`  Parsed ${rawProducts.length} raw product listings`);

  // Step 4: Save raw JSON
  console.log("[4/6] Saving raw data...");
  const today = new Date().toISOString().slice(0, 10);
  const rawDir = join("data", "cardrush", "raw");
  mkdirSync(rawDir, { recursive: true });
  const rawPath = join(rawDir, `SEALED-${today}.json`);
  writeFileSync(rawPath, JSON.stringify(rawProducts, null, 2));
  console.log(`  Saved ${rawProducts.length} products → ${rawPath}`);

  // Step 5: Map to wholesale
  console.log("[5/6] Mapping to wholesale...");
  const wholesale = mapSealedToWholesale(rawProducts, gbpJpyRate);

  // Save wholesale JSON
  const wsDir = join("data", "cardrush", "wholesale");
  mkdirSync(wsDir, { recursive: true });
  const wsPath = join(wsDir, `SEALED-${today}.json`);
  writeFileSync(wsPath, JSON.stringify(wholesale, null, 2));
  console.log(`  Mapped ${wholesale.length} sealed products → ${wsPath}`);

  // Summary
  if (wholesale.length > 0) {
    const prices = wholesale.map((w) => w.cardrushJpy);
    const minJpy = Math.min(...prices);
    const maxJpy = Math.max(...prices);
    const gbpPrices = wholesale.map((w) => w.pricing.price);
    const minGbp = Math.min(...gbpPrices).toFixed(2);
    const maxGbp = Math.max(...gbpPrices).toFixed(2);

    console.log(`\n--- Summary ---`);
    console.log(`  Total raw listings:   ${rawProducts.length}`);
    console.log(`  Sealed products:      ${wholesale.length}`);
    console.log(`  Price range (JPY):    ¥${minJpy.toLocaleString()} – ¥${maxJpy.toLocaleString()}`);
    console.log(`  Price range (GBP):    £${minGbp} – £${maxGbp}`);
  }

  // Step 6: DB upsert
  if (dryRun) {
    console.log("\n[6/6] Skipping DB upsert (--dry-run)");
  } else {
    console.log("\n[6/6] Upserting to database...");
    await upsertSealedToDb(wholesale, gc, gbpJpyRate, today);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
}

async function upsertSealedToDb(
  wholesale: WholesaleCard[],
  gc: GameConfig,
  gbpJpyRate: number,
  today: string
) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required for DB upsert. Use --dry-run to skip.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1, ssl: "require" });

  try {
    // Get-or-create game
    let [game] = await sql`SELECT id FROM games WHERE code = ${gc.dbGameCode}`;
    if (!game) {
      [game] = await sql`
        INSERT INTO games (code, name, slug, active, sort_order)
        VALUES (${gc.dbGameCode}, ${gc.dbGameName}, ${gc.dbGameSlug}, true, 0)
        RETURNING id`;
    }

    // Get-or-create "SEALED" set
    let [set] = await sql`SELECT id, name FROM sets WHERE code = ${"SEALED"} AND game_id = ${game.id}`;
    if (!set) {
      [set] = await sql`
        INSERT INTO sets (game_id, code, name, sort_order)
        VALUES (${game.id}, 'SEALED', 'Sealed Products', 999)
        RETURNING id, name`;
    }

    const now = new Date();
    const BATCH_SIZE = 100;

    for (let i = 0; i < wholesale.length; i += BATCH_SIZE) {
      const batch = wholesale.slice(i, i + BATCH_SIZE);

      const cardRows = batch.map((card) => ({
        card_number: card.cardNumber,
        sku: card.sku,
        name: card.name,
        set_code: "SEALED",
        set_name: "Sealed Products",
        cardrush_url: card.cardrushUrl,
        cardrush_jpy: card.cardrushJpy,
        gbp_jpy_rate: gbpJpyRate,
        base_gbp: card.pricing.baseGbp,
        price: card.pricing.price,
        last_synced_at: now,
        game_id: game.id,
        set_id: set.id,
        category: "sealed",
        rarity: null,
        image_url: card.imageUrl ?? null,
      }));

      await sql`
        INSERT INTO cards ${sql(cardRows,
          "card_number", "sku", "name", "set_code", "set_name",
          "cardrush_url", "cardrush_jpy", "gbp_jpy_rate", "base_gbp", "price",
          "last_synced_at", "game_id", "set_id", "category", "rarity", "image_url"
        )}
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          cardrush_url = EXCLUDED.cardrush_url,
          cardrush_jpy = EXCLUDED.cardrush_jpy,
          gbp_jpy_rate = EXCLUDED.gbp_jpy_rate,
          base_gbp = EXCLUDED.base_gbp,
          price = EXCLUDED.price,
          last_synced_at = EXCLUDED.last_synced_at,
          game_id = EXCLUDED.game_id,
          set_id = EXCLUDED.set_id,
          image_url = CASE
            WHEN EXCLUDED.image_url LIKE '%/hires/%' THEN EXCLUDED.image_url
            WHEN cards.image_url LIKE '%/hires/%' THEN cards.image_url
            ELSE EXCLUDED.image_url
          END`;

      const skus = batch.map((c) => c.sku);
      const dbCards = await sql`SELECT id, sku FROM cards WHERE sku = ANY(${skus})`;
      const skuToId = new Map(dbCards.map((r: any) => [r.sku, r.id]));

      // (Second `price_history` insert removed 2026-07-07 — table dropped
      // in kingdom-049 Phase 4, migration 0011. The honest ground §3.)

      // Price archive
      const archiveRows = batch
        .filter((card) => skuToId.has(card.sku))
        .map((card) => ({
          card_id: skuToId.get(card.sku),
          snapshot_date: today,
          sku: card.sku,
          set_code: "SEALED",
          category: "sealed",
          cardrush_jpy: card.cardrushJpy,
          gbp_jpy_rate: gbpJpyRate,
          base_gbp: card.pricing.baseGbp,
          price: card.pricing.price,
        }));

      if (archiveRows.length > 0) {
        await sql`
          INSERT INTO price_archive ${sql(archiveRows,
            "card_id", "snapshot_date", "sku", "set_code", "category",
            "cardrush_jpy", "gbp_jpy_rate", "base_gbp", "price"
          )}
          ON CONFLICT (card_id, snapshot_date) DO UPDATE SET
            cardrush_jpy = EXCLUDED.cardrush_jpy,
            gbp_jpy_rate = EXCLUDED.gbp_jpy_rate,
            base_gbp = EXCLUDED.base_gbp,
            price = EXCLUDED.price`;
      }
    }

    const [count] = await sql`SELECT COUNT(*) as cnt FROM cards WHERE category = 'sealed'`;
    console.log(`  Upserted ${wholesale.length} sealed products (batch mode)`);
    console.log(`  Total sealed products in DB: ${count.cnt}`);
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (discover) {
    await runDiscover(gameConfig);
    return;
  }

  if (sealed) {
    await scrapeSealed(gameConfig);
    return;
  }

  if (setAll) {
    const codes = getAllSetCodes(gameCode); // sorted by product-group ID ascending, filtered by game
    console.log(`\n=== Scraping all ${codes.length} ${gameConfig.dbGameName} sets (by product-group order) ===\n`);
    const scrapeStartDate = new Date().toISOString().slice(0, 10); // capture before scraping
    const totalStart = Date.now();
    const globalSkuState = createSkuState();
    for (let i = 0; i < codes.length; i++) {
      console.log(`\n[${ i + 1}/${codes.length}]`);
      await scrapeSet(codes[i], gameConfig, globalSkuState);
    }
    const totalElapsed = ((Date.now() - totalStart) / 1000 / 60).toFixed(1);
    console.log(`\n=== All ${codes.length} sets complete in ${totalElapsed} min ===`);

    // Clean up stale cards that weren't updated in this run (skip those referenced by orders)
    if (!dryRun) {
      const connectionString = process.env.DATABASE_URL;
      if (connectionString) {
        const sql = postgres(connectionString, { max: 1, ssl: "require" });
        const [game] = await sql`SELECT id FROM games WHERE code = ${gameConfig.dbGameCode}`;
        const gameId = game?.id;
        const staleIds = await sql`
          SELECT id FROM cards
          WHERE category = 'singles'
            AND (last_synced_at IS NULL OR last_synced_at::date < ${scrapeStartDate}::date)
            AND id NOT IN (SELECT DISTINCT card_id FROM order_items)
            AND id NOT IN (SELECT DISTINCT card_id FROM purchase_items)
            AND id NOT IN (SELECT DISTINCT card_id FROM cart_items)
            ${gameId ? sql`AND game_id = ${gameId}` : sql``}`;
        if (staleIds.length > 0) {
          const ids = staleIds.map((r: any) => r.id);
          await sql`DELETE FROM price_archive WHERE card_id = ANY(${ids})`;
          await sql`DELETE FROM cards WHERE id = ANY(${ids})`;
          console.log(`\nCleaned up ${ids.length} stale cards not updated today`);
        }
        await sql.end();
      }
    }
    return;
  }

  const setCode = positional[0]?.toUpperCase();
  if (!setCode) {
    console.error("Usage: npx tsx tools/scrape-cardrush.ts <SET_CODE> [--game=onepiece|dragonball|pokemon] [--dry-run] [--skip-images] [--prices-only]");
    console.error("       npx tsx tools/scrape-cardrush.ts --sealed [--game=onepiece|dragonball|pokemon] [--dry-run]");
    console.error("       npx tsx tools/scrape-cardrush.ts --discover [--game=onepiece|dragonball|pokemon]");
    console.error(`\nKnown sets (${gameCode}): ${getAllSetCodes(gameCode).join(", ")}`);
    process.exit(1);
  }

  await scrapeSet(setCode, gameConfig);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
