/**
 * Products/Update Webhook Handler
 *
 * This webhook triggers when a product is updated in Shopify.
 * It syncs TierProduct prices when the underlying Shopify product price changes.
 *
 * Prevents stale data where TierProduct.price doesn't match the actual
 * Shopify product price if a merchant changes it outside of our app.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ProductVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string | null;
  position: number;
  inventory_policy: string;
  compare_at_price: string | null;
  fulfillment_service: string;
  inventory_management: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string | null;
  grams: number;
  image_id: number | null;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
}

interface ProductWebhook {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  handle: string;
  status: string;
  published_at: string | null;
  template_suffix: string | null;
  tags: string;
  variants: ProductVariant[];
  options: Array<{
    id: number;
    product_id: number;
    name: string;
    position: number;
    values: string[];
  }>;
  images: Array<{
    id: number;
    product_id: number;
    position: number;
    src: string;
    width: number;
    height: number;
    alt: string | null;
  }>;
  image: {
    id: number;
    product_id: number;
    position: number;
    src: string;
    width: number;
    height: number;
    alt: string | null;
  } | null;
}

export async function action({ request }: ActionFunctionArgs) {
  console.log("\n" + "=".repeat(60));
  console.log("WEBHOOK: PRODUCTS/UPDATE");
  console.log("=".repeat(60));

  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    if (topic !== "PRODUCTS_UPDATE") {
      console.log(`[ProductsUpdate] Unexpected topic: ${topic}`);
      return json({ success: false, error: "Invalid topic" }, { status: 400 });
    }

    const product = payload as ProductWebhook;
    const shopifyProductId = String(product.id);

    console.log(`[ProductsUpdate] Processing product update for ${product.title} (${shopifyProductId}) from ${shop}`);
    console.log(`[ProductsUpdate] Variants count: ${product.variants?.length || 0}`);

    // Find all TierProducts that use this Shopify product
    const tierProducts = await prisma.tierProduct.findMany({
      where: {
        shop,
        shopifyProductId,
        deletedAt: null, // Only active tier products
      },
      select: {
        id: true,
        shopifyVariantId: true,
        price: true,
        tierId: true,
        name: true,
      },
    });

    if (tierProducts.length === 0) {
      console.log(`[ProductsUpdate] No TierProducts found for product ${shopifyProductId}, skipping`);
      return json({
        success: true,
        message: "No TierProducts linked to this product",
      });
    }

    console.log(`[ProductsUpdate] Found ${tierProducts.length} TierProduct(s) to check`);

    const results: Array<{
      tierProductId: string;
      name: string;
      previousPrice: number;
      newPrice: number;
      updated: boolean;
    }> = [];

    for (const tierProduct of tierProducts) {
      // Find the matching variant in the webhook payload
      const matchingVariant = product.variants?.find(
        (v) => String(v.id) === tierProduct.shopifyVariantId
      );

      if (!matchingVariant) {
        console.log(`[ProductsUpdate] Variant ${tierProduct.shopifyVariantId} not found in payload for TierProduct ${tierProduct.id}`);
        continue;
      }

      const shopifyPrice = parseFloat(matchingVariant.price);
      const currentPrice = Number(tierProduct.price);

      // Check if price has changed (with tolerance for floating point)
      const priceChanged = Math.abs(shopifyPrice - currentPrice) > 0.01;

      if (priceChanged) {
        console.log(`[ProductsUpdate] Price change detected for TierProduct ${tierProduct.name || tierProduct.id}:`);
        console.log(`[ProductsUpdate]   Current DB price: ${currentPrice}`);
        console.log(`[ProductsUpdate]   New Shopify price: ${shopifyPrice}`);

        // Update the TierProduct price
        await prisma.tierProduct.update({
          where: { id: tierProduct.id },
          data: {
            price: shopifyPrice,
            updatedAt: new Date(),
          },
        });

        // Create audit log entry for price change
        try {
          await prisma.tierProductAuditLog.create({
            data: {
              tierProductId: tierProduct.id,
              shop,
              action: "PRICE_UPDATED",
              changes: {
                field: "price",
                previousValue: currentPrice.toString(),
                newValue: shopifyPrice.toString(),
                source: "products/update webhook",
              },
              performedBy: "Shopify Webhook",
              performedAt: new Date(),
            },
          });
        } catch (auditError) {
          // Log but don't fail if audit log fails
          console.error(`[ProductsUpdate] Failed to create audit log:`, auditError);
        }

        results.push({
          tierProductId: tierProduct.id,
          name: tierProduct.name || "Unnamed",
          previousPrice: currentPrice,
          newPrice: shopifyPrice,
          updated: true,
        });

        console.log(`[ProductsUpdate] Updated TierProduct ${tierProduct.id} price to ${shopifyPrice}`);
      } else {
        results.push({
          tierProductId: tierProduct.id,
          name: tierProduct.name || "Unnamed",
          previousPrice: currentPrice,
          newPrice: shopifyPrice,
          updated: false,
        });
      }
    }

    const updatedCount = results.filter((r) => r.updated).length;

    console.log(`[ProductsUpdate] Summary: ${updatedCount}/${tierProducts.length} TierProducts updated`);
    console.log("=".repeat(60) + "\n");

    return json({
      success: true,
      message: `Processed ${tierProducts.length} TierProducts, updated ${updatedCount}`,
      results,
    });
  } catch (error) {
    console.error("[ProductsUpdate] Error processing webhook:", error);

    // Return 200 to prevent Shopify from retrying
    return json({
      success: true,
      warning: "Error processing webhook",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// No GET method - webhooks are POST only
export async function loader() {
  return json({ message: "Webhook endpoint - POST only" }, { status: 405 });
}
