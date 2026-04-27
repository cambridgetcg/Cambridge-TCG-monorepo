#!/usr/bin/env tsx
// Sync condition price comparison data from raw scrape JSONs to DB
// Reads today's raw JSON files, groups by card variant, writes all condition
// grades (Mint, 状態A-, 状態B, 状態C) with discount vs mint.
//
// Usage: npx tsx tools/sync-condition-prices.ts [--date 2026-02-26]

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const args = process.argv.slice(2);
const dateIdx = args.indexOf("--date");
const today = dateIdx >= 0 && args[dateIdx + 1]
  ? args[dateIdx + 1]
  : new Date().toISOString().slice(0, 10);

const CONDITION_ORDER = ["Mint", "状態A-", "状態B", "状態C"];
const RAW_DIR = join("data", "cardrush", "raw");

interface RawEntry {
  cardNumber: string | null;
  name: string;
  priceJpy: number;
  stock: number;
  condition: string | null;
  rarity: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  isParallel: boolean;
}

// Strip condition markers to get base variant name
function stripCondition(name: string): string {
  return name.replace(/〔[^〕]+〕/g, "").trim();
}

function parseCondition(raw: string | null): string {
  if (!raw) return "Mint";
  if (raw.startsWith("状態")) return raw;
  return raw;
}

// Derive set code from card number
function deriveSetCode(cardNumber: string): string | null {
  if (/^P-\d+$/.test(cardNumber)) return "PROMO";
  // One Piece: OP01-001, ST13-001, EB01-001, PRB01-001
  const opMatch = cardNumber.match(/^((?:OP|ST|EB|PRB)\d{2})-/);
  if (opMatch) return opMatch[1];
  // Dragon Ball: FB01-001, FS01-001, SB01-001
  const dbMatch = cardNumber.match(/^((?:FB|FS|SB)\d{2})-/);
  if (dbMatch) return dbMatch[1];
  // Pokemon: NNN/NNN — set code must come from the filename, not the card number
  if (/^\d{3}\/\d{3}$/.test(cardNumber)) return null;
  return null;
}

// Extract rarity from display name
function extractRarity(name: string): string | null {
  const m = name.match(/【([^】]+)】/);
  return m ? m[1] : null;
}

// Clean display name
function cleanName(raw: string): string {
  return raw
    .replace(/\{[^}]+\}/g, "")
    .replace(/【[^】]+】/g, "")
    .replace(/〔[^〕]+〕/g, "")
    .replace(/パラレル/g, "")
    .replace(/\([^)]*alternate[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Skip graded products (PSA, BGS, etc.)
function isGraded(name: string): boolean {
  return /\b(PSA|BGS|CGC|ARS)\b/i.test(name);
}

interface ConditionRow {
  card_number: string;
  name: string;
  set_code: string | null;
  rarity: string | null;
  condition: string;
  price_jpy: number;
  stock: number;
  cardrush_url: string | null;
  image_url: string | null;
  snapshot_date: string;
  discount_pct: number | null;
}

async function main() {
  console.log(`\n=== Syncing Condition Prices (${today}) ===\n`);

  // Find today's raw JSON files
  let files: string[];
  try {
    files = readdirSync(RAW_DIR)
      .filter((f) => f.endsWith(`-${today}.json`))
      .map((f) => join(RAW_DIR, f));
  } catch {
    console.log("No raw data directory found. Skipping condition price sync.");
    return;
  }

  if (files.length === 0) {
    console.log(`No raw files for ${today}. Skipping.`);
    return;
  }

  console.log(`Found ${files.length} raw file(s) for ${today}`);

  // Load and merge all raw products
  const allRaw: RawEntry[] = [];
  for (const file of files) {
    const data: RawEntry[] = JSON.parse(readFileSync(file, "utf-8"));
    allRaw.push(...data);
  }
  console.log(`Loaded ${allRaw.length} total raw listings`);

  // Group by (card_number, base_name) → condition listings
  const groups = new Map<string, RawEntry[]>();
  for (const r of allRaw) {
    let cn = r.cardNumber;
    if (!cn) {
      if (r.name.includes("ドン!!")) cn = "DON";
      else continue; // skip unrecognised
    }
    if (isGraded(r.name)) continue;

    const base = stripCondition(r.name);
    const key = `${cn}||${base}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  // Build condition rows
  const rows: ConditionRow[] = [];

  for (const [key, listings] of groups) {
    const [cardNumber] = key.split("||");
    const setCode = deriveSetCode(cardNumber);
    const rarity = extractRarity(listings[0].name);
    const displayName = cleanName(listings[0].name);

    // Build condition → best entry (cheapest per condition)
    const condMap = new Map<string, RawEntry>();
    for (const r of listings) {
      const cond = parseCondition(r.condition);
      if (!CONDITION_ORDER.includes(cond)) continue;
      const existing = condMap.get(cond);
      if (!existing || r.priceJpy < existing.priceJpy) {
        condMap.set(cond, r);
      }
    }

    if (condMap.size === 0) continue;

    const mintPrice = condMap.get("Mint")?.priceJpy ?? null;

    for (const cond of CONDITION_ORDER) {
      const entry = condMap.get(cond);
      if (!entry) continue;

      let discountPct: number | null = null;
      if (mintPrice && cond !== "Mint" && mintPrice > 0) {
        discountPct = Math.round((1 - entry.priceJpy / mintPrice) * 1000) / 10;
      }

      rows.push({
        card_number: cardNumber,
        name: displayName,
        set_code: setCode,
        rarity,
        condition: cond,
        price_jpy: entry.priceJpy,
        stock: entry.stock,
        cardrush_url: entry.productUrl ?? null,
        image_url: entry.imageUrl ?? null,
        snapshot_date: today,
        discount_pct: discountPct,
      });
    }
  }

  console.log(`Prepared ${rows.length} condition rows from ${groups.size} card variants`);

  if (rows.length === 0) return;

  // Upsert to DB
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required. Use --dry-run on the scraper to skip DB.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1, ssl: "require" });

  try {
    // Delete existing rows for today (full replace)
    const deleted = await sql`DELETE FROM condition_prices WHERE snapshot_date = ${today}`;
    if (deleted.count > 0) {
      console.log(`  Cleared ${deleted.count} existing rows for ${today}`);
    }

    // Batch insert
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await sql`
        INSERT INTO condition_prices ${sql(batch,
          "card_number", "name", "set_code", "rarity", "condition",
          "price_jpy", "stock", "cardrush_url", "image_url",
          "snapshot_date", "discount_pct"
        )}
      `;
    }

    console.log(`  Inserted ${rows.length} condition price rows`);

    // Stats
    const [{ cnt }] = await sql`SELECT COUNT(DISTINCT card_number || name) as cnt FROM condition_prices WHERE snapshot_date = ${today}`;
    const [{ multi }] = await sql`
      SELECT COUNT(*) as multi FROM (
        SELECT card_number, name FROM condition_prices WHERE snapshot_date = ${today}
        GROUP BY card_number, name HAVING COUNT(DISTINCT condition) > 1
      ) sub
    `;
    console.log(`  Card variants: ${cnt}, with multiple conditions: ${multi}`);
  } finally {
    await sql.end();
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
