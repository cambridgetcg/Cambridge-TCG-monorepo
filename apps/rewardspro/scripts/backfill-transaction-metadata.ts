/**
 * Metadata Backfill Script for StoreCreditLedger Entries
 *
 * This script backfills missing metadata fields in StoreCreditLedger entries
 * to support the new comprehensive proxy handler.
 *
 * Missing metadata fields:
 * - orderName (e.g., "#1234")
 * - orderTotal / orderAmount
 * - description
 *
 * Usage:
 *   # Backfill all shops
 *   npx tsx scripts/backfill-transaction-metadata.ts
 *
 *   # Backfill specific shop
 *   npx tsx scripts/backfill-transaction-metadata.ts store.myshopify.com
 *
 *   # Dry run (preview changes)
 *   npx tsx scripts/backfill-transaction-metadata.ts --dry-run
 *
 * IMPORTANT: Run on staging first!
 */

import db from "../app/db.server";

interface BackfillStats {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
}

async function backfillTransactionMetadata(
  targetShop?: string,
  dryRun: boolean = false
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log("\n========== METADATA BACKFILL START ==========");
  console.log(`Target shop: ${targetShop || "ALL SHOPS"}`);
  console.log(`Dry run: ${dryRun ? "YES (no changes will be made)" : "NO"}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Find all ledger entries that need backfilling
    // Criteria: Missing orderName in metadata OR metadata is null
    const entries = await db.storeCreditLedger.findMany({
      where: {
        ...(targetShop && { shop: targetShop }),
        OR: [
          { metadata: null },
          {
            // Check if orderName is missing for cashback/refund entries
            AND: [
              {
                type: {
                  in: ["CASHBACK_EARNED", "REFUND_CREDIT", "ORDER_PAYMENT"],
                },
              },
              {
                // Note: This is a simplified check
                // In practice, you may need to fetch and inspect each record
                shopifyOrderId: { not: null },
              },
            ],
          },
        ],
      },
      take: 5000, // Process in batches of 5000
    });

    stats.total = entries.length;
    console.log(`Found ${stats.total} entries to process\n`);

    // Process each entry
    for (const entry of entries) {
      try {
        const currentMetadata = (entry.metadata as any) || {};

        // Skip if already has orderName (already backfilled)
        if (currentMetadata.orderName && currentMetadata.orderTotal) {
          console.log(`✓ Skipping entry ${entry.id} - already has metadata`);
          stats.skipped++;
          continue;
        }

        // Fetch related order data if available
        let orderData = null;
        if (entry.shopifyOrderId) {
          orderData = await db.order.findFirst({
            where: {
              shopifyOrderId: entry.shopifyOrderId,
              shop: entry.shop,
            },
            select: {
              shopifyOrderName: true,
              totalAmount: true,
            },
          });
        }

        // Build updated metadata
        const updatedMetadata = {
          ...currentMetadata,

          // Add orderName
          orderName: currentMetadata.orderName ||
            orderData?.shopifyOrderName ||
            (entry.shopifyOrderId
              ? `Order ${entry.shopifyOrderId}`
              : undefined),

          // Add orderTotal
          orderTotal: currentMetadata.orderTotal ||
            currentMetadata.orderAmount ||
            orderData?.totalAmount?.toString() ||
            undefined,

          // Add/preserve description
          description: currentMetadata.description ||
            generateDescription(entry.type, {
              orderName:
                currentMetadata.orderName ||
                orderData?.shopifyOrderName ||
                entry.shopifyOrderId,
              ...currentMetadata,
            }),
        };

        // Preview or apply changes
        if (dryRun) {
          console.log(`[DRY RUN] Would update entry ${entry.id}:`);
          console.log(`  Type: ${entry.type}`);
          console.log(`  Old metadata:`, currentMetadata);
          console.log(`  New metadata:`, updatedMetadata);
          console.log("");
          stats.updated++;
        } else {
          await db.storeCreditLedger.update({
            where: { id: entry.id },
            data: { metadata: updatedMetadata },
          });

          console.log(`✓ Updated entry ${entry.id} (${entry.type})`);
          stats.updated++;
        }
      } catch (error) {
        console.error(`✗ Error processing entry ${entry.id}:`, error);
        stats.errors++;
      }

      // Progress update every 100 entries
      if ((stats.updated + stats.skipped + stats.errors) % 100 === 0) {
        console.log(
          `\n Progress: ${stats.updated + stats.skipped + stats.errors}/${stats.total} entries processed\n`
        );
      }
    }

    console.log("\n========== BACKFILL COMPLETE ==========");
    console.log(`Total entries processed: ${stats.total}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(
      `Success rate: ${((stats.updated / stats.total) * 100).toFixed(1)}%\n`
    );

    return stats;
  } catch (error) {
    console.error("\n❌ FATAL ERROR:", error);
    throw error;
  }
}

function generateDescription(type: string, metadata: any): string {
  switch (type) {
    case "CASHBACK_EARNED":
      return metadata?.orderName
        ? `Cashback earned on order ${metadata.orderName}`
        : "Cashback earned";

    case "ORDER_PAYMENT":
      return metadata?.orderName
        ? `Store credit used for order ${metadata.orderName}`
        : "Store credit used";

    case "REFUND_CREDIT":
      return metadata?.orderName
        ? `Refund for order ${metadata.orderName}`
        : "Store credit refund";

    case "MANUAL_ADJUSTMENT":
      return (
        metadata?.reason ||
        metadata?.note ||
        metadata?.description ||
        "Manual credit adjustment"
      );

    case "SHOPIFY_SYNC":
      return "Balance sync";

    default:
      return type.replace(/_/g, " ").toLowerCase();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const targetShop = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");

// Run backfill
backfillTransactionMetadata(targetShop, dryRun)
  .then((stats) => {
    console.log("✅ Backfill script completed successfully");
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error("❌ Backfill script failed:", error);
    process.exit(1);
  });
