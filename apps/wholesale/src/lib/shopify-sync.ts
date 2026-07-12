/**
 * Shopify sync engine.
 *
 * Modes:
 *  - 'create-missing': Create Shopify listings for cards that have no shopify_product_id
 *  - 'prices': Update prices for cards that already have Shopify listings
 *  - 'stock': Update inventory levels for cards with Shopify listings
 *  - 'full': prices + stock (does NOT create missing listings)
 *
 * Rate limit: 2 req/s enforced via 500ms sleep between calls.
 */

import { db } from "@/lib/db";
import { cards } from "@/lib/db/schema";
import { eq, isNull, inArray, isNotNull, and } from "drizzle-orm";
import { ShopifyClient, type CardForShopify } from "@/lib/shopify-client";
import { priceForChannel } from "@/lib/channel-pricing";
import {
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED,
  LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON,
} from "@/lib/source-publication-policy";

export interface SyncOptions {
  mode: "full" | "prices" | "stock" | "create-missing";
  skus?: string[]; // specific SKUs to sync, or all if omitted
  dryRun?: boolean;
}

export interface SyncResult {
  created: number;
  pricesUpdated: number;
  stockUpdated: number;
  deactivated: number;
  errors: number;
  durationMs: number;
}

const REQUEST_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runShopifySync(options: SyncOptions): Promise<SyncResult> {
  if (!LEGACY_CATALOG_EXTERNAL_PUBLICATION_ENABLED) {
    throw new Error(`Shopify catalog sync is blocked. ${LEGACY_CATALOG_EXTERNAL_PUBLICATION_REASON}`);
  }
  const startedAt = Date.now();
  const { mode, skus, dryRun = false } = options;

  const result: SyncResult = {
    created: 0,
    pricesUpdated: 0,
    stockUpdated: 0,
    deactivated: 0,
    errors: 0,
    durationMs: 0,
  };

  console.log(`[shopify-sync] Starting sync: mode=${mode} dryRun=${dryRun}${skus ? ` skus=${skus.length}` : ""}`);

  const client = new ShopifyClient();

  // ── Load cards from DB ──────────────────────────────────────────────────────

  let query = db
    .select({
      id: cards.id,
      sku: cards.sku,
      cardNumber: cards.cardNumber,
      name: cards.name,
      nameEn: cards.nameEn,
      setCode: cards.setCode,
      setName: cards.setName,
      rarity: cards.rarity,
      price: cards.price,
      cardrushJpy: cards.cardrushJpy,
      gbpJpyRate: cards.gbpJpyRate,
      category: cards.category,
      imageUrl: cards.imageUrl,
      stock: cards.stock,
      shopifyProductId: cards.shopifyProductId,
      shopifyVariantId: cards.shopifyVariantId,
      shopifyInventoryItemId: cards.shopifyInventoryItemId,
    })
    .from(cards);

  // Apply SKU filter if specified
  if (skus && skus.length > 0) {
    // @ts-expect-error drizzle type inference
    query = query.where(inArray(cards.sku, skus));
  }

  const allCards = await query;
  console.log(`[shopify-sync] Loaded ${allCards.length} cards from DB`);

  // ── create-missing mode ─────────────────────────────────────────────────────

  if (mode === "create-missing") {
    const missing = allCards.filter((c) => !c.shopifyProductId);
    console.log(`[shopify-sync] Cards without Shopify listing: ${missing.length}`);

    // Get location ID for inventory (needed after creation)
    const locationId = dryRun ? "dry-run" : await client.getLocationId();
    await sleep(REQUEST_DELAY_MS);

    for (const card of missing) {
      // Compute Shopify channel price from JPY source data
      let shopifyPrice: number;
      if (card.cardrushJpy && card.gbpJpyRate) {
        const breakdown = await priceForChannel(card.cardrushJpy, card.gbpJpyRate, "shopify", card.category);
        shopifyPrice = breakdown.price;
      } else if (card.price && card.price > 0) {
        shopifyPrice = card.price; // fallback to stored wholesale price
      } else {
        console.log(`[shopify-sync] Skipping ${card.sku}: no price data`);
        continue;
      }

      const cardForShopify: CardForShopify = {
        sku: card.sku,
        cardNumber: card.cardNumber,
        name: card.name ?? "",
        nameEn: card.nameEn,
        setCode: card.setCode,
        setName: card.setName,
        rarity: card.rarity,
        price: shopifyPrice,
        imageUrl: card.imageUrl,
        stock: card.stock,
      };

      try {
        if (dryRun) {
          console.log(`[shopify-sync] [dry-run] Would create: ${card.sku} "${card.nameEn ?? card.name}"`);
          result.created++;
          continue;
        }

        const shopifyProduct = await client.createProduct(cardForShopify);
        await sleep(REQUEST_DELAY_MS);

        // Set inventory level after creation
        if (card.stock > 0) {
          await client.updateInventory(shopifyProduct.inventoryItemId, locationId, card.stock);
          await sleep(REQUEST_DELAY_MS);
        }

        // Persist IDs to DB
        await db
          .update(cards)
          .set({
            shopifyProductId: shopifyProduct.productId,
            shopifyVariantId: shopifyProduct.variantId,
            shopifyInventoryItemId: shopifyProduct.inventoryItemId,
            shopifySyncedAt: new Date(),
          })
          .where(eq(cards.id, card.id));

        result.created++;
        console.log(`[shopify-sync] Created ${card.sku} → product ${shopifyProduct.productId}`);
      } catch (err) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[shopify-sync] Error creating ${card.sku}: ${msg}`);
      }
    }
  }

  // ── prices / full mode ──────────────────────────────────────────────────────

  if (mode === "prices" || mode === "full") {
    const withListing = allCards.filter(
      (c) => c.shopifyVariantId && c.price !== null && c.price !== undefined
    );
    console.log(`[shopify-sync] Updating prices for ${withListing.length} cards with listings`);

    // Fetch current Shopify prices to compare
    const shopifyBySku = dryRun
      ? new Map<string, { price: number }>()
      : await fetchCurrentPrices(client, withListing.map((c) => c.shopifyVariantId!));

    for (const card of withListing) {
      if (!card.shopifyVariantId || card.price === null) continue;

      try {
        // Compute Shopify channel price from JPY source data
        let targetPrice: number;
        if (card.cardrushJpy && card.gbpJpyRate) {
          const breakdown = await priceForChannel(card.cardrushJpy, card.gbpJpyRate, "shopify", card.category);
          targetPrice = breakdown.price;
        } else {
          targetPrice = card.price; // fallback to stored wholesale price
        }

        const currentShopifyPrice = shopifyBySku.get(card.shopifyVariantId)?.price;

        const priceDiff =
          currentShopifyPrice !== undefined
            ? Math.abs(targetPrice - currentShopifyPrice)
            : Infinity;

        if (priceDiff <= 0.01 && currentShopifyPrice !== undefined) {
          // Price hasn't changed meaningfully — skip
          continue;
        }

        if (dryRun) {
          console.log(
            `[shopify-sync] [dry-run] Would update price ${card.sku}: ${currentShopifyPrice?.toFixed(2) ?? "?"} → £${targetPrice.toFixed(2)}`
          );
          result.pricesUpdated++;
          continue;
        }

        await client.updatePrice(card.shopifyVariantId, targetPrice);
        await sleep(REQUEST_DELAY_MS);

        await db
          .update(cards)
          .set({ shopifySyncedAt: new Date() })
          .where(eq(cards.id, card.id));

        result.pricesUpdated++;
        console.log(`[shopify-sync] Updated price ${card.sku} → £${targetPrice.toFixed(2)}`);
      } catch (err) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[shopify-sync] Error updating price ${card.sku}: ${msg}`);
      }
    }
  }

  // ── stock / full mode ───────────────────────────────────────────────────────

  if (mode === "stock" || mode === "full") {
    const withListing = allCards.filter((c) => c.shopifyProductId && c.shopifyInventoryItemId);
    console.log(`[shopify-sync] Updating stock for ${withListing.length} cards with listings`);

    const locationId = dryRun ? "dry-run" : await client.getLocationId();
    if (!dryRun) await sleep(REQUEST_DELAY_MS);

    for (const card of withListing) {
      if (!card.shopifyProductId || !card.shopifyInventoryItemId) continue;

      try {
        const newStock = Math.max(0, card.stock);

        if (dryRun) {
          if (newStock === 0) {
            console.log(`[shopify-sync] [dry-run] Would deactivate ${card.sku} (stock=0)`);
            result.deactivated++;
          } else {
            console.log(`[shopify-sync] [dry-run] Would set stock ${card.sku} → ${newStock}`);
            result.stockUpdated++;
          }
          continue;
        }

        // Update inventory quantity
        await client.updateInventory(card.shopifyInventoryItemId, locationId, newStock);
        await sleep(REQUEST_DELAY_MS);

        // Deactivate / reactivate product based on stock
        if (newStock === 0) {
          await client.setProductStatus(card.shopifyProductId, "draft");
          await sleep(REQUEST_DELAY_MS);
          result.deactivated++;
          console.log(`[shopify-sync] Deactivated ${card.sku} (stock=0)`);
        } else {
          // Always ensure active when stock > 0
          await client.setProductStatus(card.shopifyProductId, "active");
          await sleep(REQUEST_DELAY_MS);
          result.stockUpdated++;
          console.log(`[shopify-sync] Stock updated ${card.sku} → ${newStock}`);
        }

        await db
          .update(cards)
          .set({ shopifySyncedAt: new Date() })
          .where(eq(cards.id, card.id));
      } catch (err) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[shopify-sync] Error updating stock ${card.sku}: ${msg}`);
      }
    }
  }

  result.durationMs = Date.now() - startedAt;

  console.log(`[shopify-sync] Completed in ${result.durationMs}ms:`, result);
  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fetch current Shopify prices for a list of variant IDs.
 * Returns a map of variantId → { price }.
 *
 * We use the variants endpoint in batches of 100 (Shopify limit for ?ids=).
 */
async function fetchCurrentPrices(
  client: ShopifyClient,
  variantIds: string[]
): Promise<Map<string, { price: number }>> {
  const priceMap = new Map<string, { price: number }>();

  // Skip if no variants
  if (variantIds.length === 0) return priceMap;

  const BATCH_SIZE = 100;
  for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
    const batch = variantIds.slice(i, i + BATCH_SIZE);
    const ids = batch.join(",");

    try {
      // Access the underlying store URL directly
      const store = process.env.SHOPIFY_STORE!;
      const token = process.env.SHOPIFY_ACCESS_TOKEN!;
      const url = `https://${store}/admin/api/2024-10/variants.json?ids=${ids}&fields=id,price&limit=100`;

      const res = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": token,
          Accept: "application/json",
        },
      });

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const data = (await res.json()) as {
        variants: Array<{ id: number; price: string }>;
      };

      for (const variant of data.variants) {
        priceMap.set(String(variant.id), { price: parseFloat(variant.price) });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[shopify-sync] Error fetching variant prices: ${msg}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return priceMap;
}
