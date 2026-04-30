#!/usr/bin/env tsx
// Backfill name_en on cards table from community API data
// Usage: npx tsx tools/backfill-english-names.ts

import { existsSync, readFileSync } from "fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

import postgres from "postgres";

// Source JSON files were scraped from HTML pages where `&` was entity-
// encoded as `&amp;`. Decode common HTML entities before writing — last
// time this ran without decoding it left 28 rows with literal `&amp;`
// in card names that surfaced in the storefront UI.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function main() {
  // Load English names
  const names = new Map<string, string>();

  try {
    const optcg = JSON.parse(readFileSync("data/optcg-names-en.json", "utf-8"));
    for (const [id, card] of Object.entries(optcg)) {
      names.set(id, (card as any).name);
    }
  } catch {}

  try {
    const dbfw = JSON.parse(readFileSync("data/dbfw-names-en.json", "utf-8"));
    for (const [id, name] of Object.entries(dbfw)) {
      names.set(id, name as string);
    }
  } catch {}

  console.log(`English names loaded: ${names.size}`);

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  try {
    // Get all card numbers that need updating
    const cards = await sql`SELECT id, card_number FROM cards WHERE name_en IS NULL`;
    console.log(`Cards without name_en: ${cards.length}`);

    let updated = 0;
    let missing = 0;
    const BATCH = 500;

    for (let i = 0; i < cards.length; i += BATCH) {
      const batch = cards.slice(i, i + BATCH);
      const pairs: { id: number; name_en: string }[] = [];

      for (const card of batch) {
        const en = names.get(card.card_number);
        if (en) {
          pairs.push({ id: card.id, name_en: decodeHtmlEntities(en) });
        } else {
          missing++;
        }
      }

      if (pairs.length > 0) {
        // Batch update using unnest
        const ids = pairs.map((p) => p.id);
        const nameEns = pairs.map((p) => p.name_en);

        await sql`
          UPDATE cards SET name_en = bulk.name_en
          FROM (SELECT unnest(${ids}::int[]) AS id, unnest(${nameEns}::text[]) AS name_en) AS bulk
          WHERE cards.id = bulk.id
        `;
        updated += pairs.length;
      }

      const batchNum = Math.floor(i / BATCH) + 1;
      const totalBatches = Math.ceil(cards.length / BATCH);
      console.log(`  Batch ${batchNum}/${totalBatches}: +${pairs.length} updated`);
    }

    console.log(`\nDone: ${updated} updated, ${missing} missing English name`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
