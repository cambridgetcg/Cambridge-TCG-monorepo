#!/usr/bin/env tsx
// eBay CSV Generator — queries DB, generates File Exchange CSV for bulk upload
// Usage: npx tsx tools/ebay-sync.ts [--dry-run] [--game=op] [--set=OP01] [--limit=50]
// --game takes the kingdom GameCode (games.code post-migration-0022): op | pkm | dbf

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

// Load .env.local (overrides shell env — .env.local is the source of truth)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

import postgres from "postgres";
import { calculateEbayPrice } from "./lib/ebay-pricing";

// ---------------------------------------------------------------------------
// English card name lookups (downloaded from community APIs)
// ---------------------------------------------------------------------------

function loadEnglishNames(): Map<string, string> {
  const names = new Map<string, string>();

  // One Piece TCG — punk-records dataset
  try {
    const optcg = JSON.parse(readFileSync("data/optcg-names-en.json", "utf-8"));
    for (const [id, card] of Object.entries(optcg)) {
      names.set(id, (card as any).name);
    }
  } catch { }

  // Dragon Ball Fusion World — apitcg dataset
  try {
    const dbfw = JSON.parse(readFileSync("data/dbfw-names-en.json", "utf-8"));
    for (const [id, name] of Object.entries(dbfw)) {
      names.set(id, name as string);
    }
  } catch { }

  return names;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));

const dryRun = flags.has("--dry-run");

const gameFlag = args.find((a) => a.startsWith("--game="));
const gameCode = gameFlag ? gameFlag.split("=")[1] : undefined;

const setFlag = args.find((a) => a.startsWith("--set="));
const setCode = setFlag ? setFlag.split("=")[1] : undefined;

const limitFlag = args.find((a) => a.startsWith("--limit="));
const limit = limitFlag ? parseInt(limitFlag.split("=")[1], 10) : undefined;

console.log(`\n=== eBay CSV Generator ===`);
console.log(`  Mode: ${dryRun ? "DRY RUN" : "GENERATE"}`);
if (gameCode) console.log(`  Game filter: ${gameCode}`);
if (setCode) console.log(`  Set filter: ${setCode}`);
if (limit) console.log(`  Limit: ${limit}`);

// ---------------------------------------------------------------------------
// eBay CSV config
// ---------------------------------------------------------------------------

const EBAY_CATEGORY_SINGLES = process.env.EBAY_CATEGORY_ID_SINGLES || "183454";
const EBAY_LOCATION = process.env.EBAY_LOCATION || "Cambridge, United Kingdom";

// S3 bucket per game for high-res images
const S3_BUCKETS: Record<string, string> = {
  "One Piece": "jp-op-photos",
  "Dragon Ball Fusion World": "jp-db-photos",
  "Pokémon": "jp-pk-photos",
};
const S3_REGION = "us-east-1";

function s3ImageUrl(card: CardRow): string {
  const bucket = S3_BUCKETS[card.game_name] || "jp-op-photos";
  return `https://${bucket}.s3.${S3_REGION}.amazonaws.com/${card.set_code}/${card.sku}.jpeg`;
}

// ---------------------------------------------------------------------------
// Title + description generation
// ---------------------------------------------------------------------------

interface CardRow {
  id: number;
  sku: string;
  name: string;
  card_number: string;
  set_code: string;
  set_name: string;
  category: string;
  rarity: string | null;
  image_url: string | null;
  price: number;
  stock: number;
  ebay_item_number: string | null;
  game_name: string;
}

function buildTitle(card: CardRow, englishName: string | undefined): string {
  // "One Piece TCG - Kouzuki Oden EB01-001 L/P [Memorial Collection] Japanese"
  const parts = [card.game_name, "TCG -"];
  if (englishName) parts.push(englishName);
  parts.push(card.card_number);
  if (card.rarity) parts.push(card.rarity);
  if (card.set_name) parts.push(`[${card.set_name}]`);
  parts.push("Japanese");

  let title = parts.join(" ");
  if (title.length > 80) {
    // Drop set name to shorten
    title = [card.game_name, "TCG -", englishName, card.card_number, card.rarity, "Japanese"]
      .filter(Boolean)
      .join(" ");
  }
  if (title.length > 80) {
    // Drop English name too
    title = [card.game_name, "TCG -", card.card_number, card.rarity, "Japanese"]
      .filter(Boolean)
      .join(" ");
  }
  if (title.length > 80) {
    title = title.slice(0, 77) + "...";
  }
  return title;
}

function buildDescription(card: CardRow, englishName: string | undefined): string {
  const displayName = englishName || card.name;
  return `<div style="font-family:sans-serif;max-width:600px"><h2>${escapeHtml(card.game_name)} TCG</h2><table style="border-collapse:collapse"><tr><td style="padding:4px 12px 4px 0;font-weight:bold">Card</td><td>${escapeHtml(displayName)}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:bold">Number</td><td>${escapeHtml(card.card_number)}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:bold">Set</td><td>${escapeHtml(card.set_name)} (${escapeHtml(card.set_code)})</td></tr>${card.rarity ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Rarity</td><td>${escapeHtml(card.rarity)}</td></tr>` : ""}<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Language</td><td>Japanese</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:bold">Condition</td><td>${card.category === "sealed" ? "Brand New / Sealed" : "Near Mint"}</td></tr></table><p style="margin-top:12px;color:#666">Shipped from the UK. Part of our Japanese TCG wholesale range.</p></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsvRow(fields: string[]): string {
  return fields.map(csvEscape).join(",");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  // -------------------------------------------------------------------------
  // [1/4] Query DB
  // -------------------------------------------------------------------------
  console.log(`\n[1/4] Querying database...`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !dryRun) {
    console.error("DATABASE_URL is required. Use --dry-run to skip.");
    process.exit(1);
  }

  if (dryRun && !connectionString) {
    console.log("  --dry-run without DATABASE_URL — nothing to do.");
    return;
  }

  const sql = postgres(connectionString!, { max: 1, ssl: "require" });

  try {
    const gameFilter = gameCode ? sql`AND g.code = ${gameCode}` : sql``;
    const setFilter = setCode ? sql`AND c.set_code = ${setCode}` : sql``;
    const limitClause = limit ? sql`LIMIT ${limit}` : sql``;

    const inStock: CardRow[] = await sql`
      SELECT
        c.id, c.sku, c.name, c.card_number, c.set_code, c.set_name,
        c.category, c.rarity, c.image_url, c.price, c.stock,
        c.ebay_item_number, g.name as game_name
      FROM cards c
      JOIN games g ON g.id = c.game_id
      WHERE c.stock > 0 AND c.price >= 3 AND c.price <= 30
        ${gameFilter} ${setFilter}
      ORDER BY c.set_code, c.card_number
      ${limitClause}
    `;

    console.log(`  In-stock cards: ${inStock.length}`);

    if (dryRun) {
      console.log("\n[DRY RUN] Showing pricing for first 10 cards:");
      for (const card of inStock.slice(0, 10)) {
        const ebayPrice = calculateEbayPrice(card.price);
        console.log(
          `  ${card.sku} — ${card.name} — wholesale £${card.price} → eBay £${ebayPrice} (stock: ${card.stock})`
        );
      }
      await sql.end();
      return;
    }

    // -----------------------------------------------------------------------
    // [2/4] Build CSV
    // -----------------------------------------------------------------------
    console.log(`\n[2/4] Building CSV...`);
    const englishNames = loadEnglishNames();
    console.log(`  English name lookup: ${englishNames.size} cards loaded`);

    // File Exchange header — eBay UK
    const ACTION_HEADER = "*Action(SiteID=UK|Country=GB|Currency=GBP|Version=1193|CC=UTF-8)";

    const headers = [
      ACTION_HEADER,
      "CustomLabel",
      "*Category",
      "*Title",
      "*ConditionID",
      "CD:40001",
      "*StartPrice",
      "*Quantity",
      "*Format",
      "*Duration",
      "PicURL",
      "*Description",
      "*Location",
      "*DispatchTimeMax",
      // Shipping
      "*ShippingType",
      "ShippingService-1:Option",
      "ShippingService-1:Cost",
      "ShippingService-1:FreeShipping",
      // International shipping
      "IntlShippingService-1:Option",
      "IntlShippingService-1:Cost",
      "IntlShippingService-1:Locations",
      // Returns
      "*ReturnsAcceptedOption",
      "ReturnsWithinOption",
      "RefundOption",
      "ShippingCostPaidByOption",
      // Payment
      "ImmediatePayRequired",
      // Item specifics
      "C:Game",
      "C:Card Name",
      "C:Card Number",
      "C:Set",
      "C:Rarity",
      "C:Language",
      "C:Graded",
    ];

    const rows: string[] = [buildCsvRow(headers)];

    let namesFound = 0;
    let namesMissing = 0;

    for (const card of inStock) {
      const ebayPrice = calculateEbayPrice(card.price);
      const enName = englishNames.get(card.card_number);
      if (enName) namesFound++; else namesMissing++;

      const row = [
        "Add",                                         // Action
        card.sku,                                      // CustomLabel (SKU)
        EBAY_CATEGORY_SINGLES,                         // Category
        buildTitle(card, enName),                      // Title
        "4000",                                        // ConditionID: Ungraded
        "400010",                                      // CD:40001 — Near Mint or Better
        ebayPrice.toFixed(2),                          // StartPrice
        card.stock.toString(),                         // Quantity
        "FixedPrice",                                  // Format
        "GTC",                                         // Duration: Good 'Til Cancelled
        card.image_url || s3ImageUrl(card),               // PicURL (CardRush or S3 fallback)
        buildDescription(card, enName),                // Description
        EBAY_LOCATION,                                 // Location
        "3",                                           // DispatchTimeMax (days)
        // Shipping
        "Flat",                                        // ShippingType
        "UK_RoyalMailSecondClassStandard",             // UK domestic service
        "0.00",                                        // Cost (free)
        "true",                                        // FreeShipping
        // International
        "UK_RoyalMailAirmailInternational",            // International service
        "2.99",                                        // International cost
        "Worldwide",                                   // Ship to locations
        // Returns
        "ReturnsAccepted",                             // ReturnsAcceptedOption
        "Days_30",                                     // ReturnsWithinOption
        "MoneyBack",                                   // RefundOption
        "Buyer",                                       // ShippingCostPaidByOption
        // Payment
        "1",                                           // ImmediatePayRequired
        // Item specifics
        card.game_name,                                // C:Game
        enName || card.name,                           // C:Card Name
        card.card_number,                              // C:Card Number
        card.set_name || card.set_code,                // C:Set
        card.rarity || "",                             // C:Rarity
        "Japanese",                                    // C:Language
        "No",                                          // C:Graded
      ];

      rows.push(buildCsvRow(row));
    }

    const csv = rows.join("\n");

    // -----------------------------------------------------------------------
    // [3/4] Write CSV
    // -----------------------------------------------------------------------
    console.log(`\n[3/4] Writing CSV...`);
    const today = new Date().toISOString().slice(0, 10);
    const logDir = "data/ebay";
    mkdirSync(logDir, { recursive: true });

    const suffix = [gameCode, setCode].filter(Boolean).join("-");
    const filename = `ebay-upload-${today}${suffix ? `-${suffix}` : ""}.csv`;
    const csvPath = `${logDir}/${filename}`;
    writeFileSync(csvPath, csv, "utf-8");
    console.log(`  Written to ${csvPath}`);
    console.log(`  Total rows: ${inStock.length}`);
    console.log(`  English names: ${namesFound} found, ${namesMissing} missing`);

    // -----------------------------------------------------------------------
    // [4/4] Summary
    // -----------------------------------------------------------------------
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[4/4] Summary`);
    console.log(`  Cards in CSV:  ${inStock.length}`);
    console.log(`  Duration:      ${elapsed}s`);
    console.log(`\n  Upload this file at: https://www.ebay.co.uk/sh/reports/uploads`);
    console.log(`  Or: Seller Hub → Reports → Upload\n`);

    await sql.end();
  } catch (err) {
    await sql.end();
    throw err;
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
