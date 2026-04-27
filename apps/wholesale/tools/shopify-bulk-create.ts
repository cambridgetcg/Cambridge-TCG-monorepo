#!/usr/bin/env tsx
/**
 * Bulk create Shopify listings for all One Piece cards missing a product ID.
 * Run from tcg-wholesale directory: npx tsx /tmp/shopify-bulk-create.ts
 */

import { existsSync, readFileSync } from "fs";
import postgres from "postgres";

// Load env
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const DB_URL = process.env.DATABASE_URL!;
const STORE = process.env.SHOPIFY_STORE!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0");
const API_VERSION = "2024-10";
const DELAY_MS = 550; // slightly over 500ms for safety

const sql = postgres(DB_URL, { ssl: "require" });

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

let _token = "";
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 300_000) return _token;
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status} ${await res.text()}`);
  const d = await res.json() as any;
  _token = d.access_token;
  _tokenExpiry = Date.now() + d.expires_in * 1000;
  return _token;
}

async function shopify<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/${path}`, {
    method,
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as T;
}

async function getLocationId(): Promise<string> {
  const d = await shopify<any>("GET", "locations.json");
  const loc = d.locations.find((l: any) => l.active) ?? d.locations[0];
  return String(loc.id);
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // Load missing cards
  const rows = await sql`
    SELECT sku, card_number, name, name_en, set_code, set_name, rarity, price, image_url, stock
    FROM cards
    WHERE game_id = 1
      AND shopify_product_id IS NULL
      AND price > 0
    ORDER BY set_code, card_number
    ${LIMIT > 0 ? sql`LIMIT ${LIMIT}` : sql``}
  `;

  console.log(`Cards to create: ${rows.length}`);
  if (rows.length === 0) { console.log("Nothing to do!"); process.exit(0); }

  const locationId = DRY_RUN ? "dry" : await getLocationId();
  if (!DRY_RUN) await sleep(DELAY_MS);

  let created = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const card = rows[i];
    const title = `${card.card_number} ${card.name_en ?? card.name ?? ""} Japanese`.trim();
    const setName = card.set_name ?? card.set_code ?? "One Piece TCG";
    const tags = ["one-piece", "japanese", card.set_code, card.rarity].filter(Boolean).join(",");

    if (DRY_RUN) {
      console.log(`[${i+1}/${rows.length}] DRY: "${title}" £${card.price} stock=${card.stock}`);
      created++;
      continue;
    }

    try {
      // Create product
      const productBody: any = {
        title,
        body_html: `<p>Japanese One Piece TCG card. Condition: Near Mint.</p><p>Set: ${setName}</p>`,
        vendor: "Cambridge TCG",
        product_type: "Trading Card",
        tags,
        status: card.stock > 0 ? "active" : "draft",
        variants: [{ sku: card.sku, price: Number(card.price).toFixed(2), inventory_management: "shopify", inventory_policy: "deny", fulfillment_service: "manual" }],
      };
      if (card.image_url) productBody.images = [{ src: card.image_url }];

      const { product } = await shopify<any>("POST", "products.json", { product: productBody });
      await sleep(DELAY_MS);

      const variant = product.variants[0];
      const inventoryItemId = String(variant.inventory_item_id);
      const productId = String(product.id);
      const variantId = String(variant.id);

      // Set inventory
      if (card.stock > 0) {
        await shopify("POST", "inventory_levels/set.json", {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available: card.stock,
        });
        await sleep(DELAY_MS);
      }

      // Persist to DB
      await sql`
        UPDATE cards SET
          shopify_product_id = ${productId},
          shopify_variant_id = ${variantId},
          shopify_inventory_item_id = ${inventoryItemId},
          shopify_synced_at = NOW()
        WHERE sku = ${card.sku}
      `;

      created++;
      if (created % 25 === 0 || i < 5) {
        console.log(`[${i+1}/${rows.length}] ✅ Created "${title}" → ${productId} (${created} done, ${errors} errors)`);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${i+1}/${rows.length}] ❌ ${card.sku}: ${msg}`);
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Done: ${created} created, ${errors} errors`);
  console.log(`${"=".repeat(60)}`);
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
