/**
 * Customer Metafield Service
 * Handles setting the RewardsPro customer ID metafield on Shopify customers
 * for storefront widget authentication
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";

export interface SetCustomerMetafieldResult {
  success: boolean;
  metafieldId?: string;
  error?: string;
}

/**
 * Set the RewardsPro customer ID metafield on a Shopify customer
 *
 * @param admin - Shopify Admin API context
 * @param customerId - RewardsPro internal customer ID
 * @param shopifyCustomerId - Shopify customer GID (gid://shopify/Customer/123)
 * @returns Result with metafield ID or error
 */
export async function setCustomerMetafield(
  admin: AdminApiContext,
  customerId: string,
  shopifyCustomerId: string
): Promise<SetCustomerMetafieldResult> {
  try {
    const mutation = `
      mutation SetCustomerMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        metafields: [
          {
            ownerId: shopifyCustomerId,
            namespace: "rewardspro",
            key: "customer_id",
            value: customerId,
            type: "single_line_text_field"
          }
        ]
      }
    });

    const data = await response.json();

    if (data.data?.metafieldsSet?.userErrors?.length > 0) {
      const errors = data.data.metafieldsSet.userErrors;
      console.error("Error setting customer metafield:", errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(", ")
      };
    }

    const metafieldId = data.data?.metafieldsSet?.metafields?.[0]?.id;

    if (!metafieldId) {
      return {
        success: false,
        error: "No metafield ID returned"
      };
    }

    return {
      success: true,
      metafieldId
    };

  } catch (error) {
    console.error("Exception setting customer metafield:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Set metafield and update database record
 *
 * @param admin - Shopify Admin API context
 * @param shop - Shop domain
 * @param customerId - RewardsPro internal customer ID
 * @param shopifyCustomerId - Shopify customer GID
 * @returns Result with metafield ID or error
 */
export async function setCustomerMetafieldAndUpdateDb(
  admin: AdminApiContext,
  shop: string,
  customerId: string,
  shopifyCustomerId: string
): Promise<SetCustomerMetafieldResult> {
  const result = await setCustomerMetafield(admin, customerId, shopifyCustomerId);

  if (result.success && result.metafieldId) {
    try {
      // Update customer record with metafield ID
      await prisma.customer.update({
        where: {
          id: customerId,
          shop
        },
        data: {
          shopifyCustomerMetafieldId: result.metafieldId
        }
      });
    } catch (dbError) {
      console.error("Error updating customer record with metafield ID:", dbError);
      // Don't fail the whole operation if DB update fails
      // Metafield is already set in Shopify
    }
  }

  return result;
}

/**
 * Batch set metafields for multiple customers
 *
 * @param admin - Shopify Admin API context
 * @param shop - Shop domain
 * @param customers - Array of customer IDs to process
 * @returns Stats about the batch operation
 */
export async function batchSetCustomerMetafields(
  admin: AdminApiContext,
  shop: string,
  customers: Array<{ id: string; shopifyCustomerId: string }>
): Promise<{
  total: number;
  success: number;
  failed: number;
  errors: Array<{ customerId: string; error: string }>;
}> {
  const stats = {
    total: customers.length,
    success: 0,
    failed: 0,
    errors: [] as Array<{ customerId: string; error: string }>
  };

  for (const customer of customers) {
    const result = await setCustomerMetafieldAndUpdateDb(
      admin,
      shop,
      customer.id,
      customer.shopifyCustomerId
    );

    if (result.success) {
      stats.success++;
    } else {
      stats.failed++;
      stats.errors.push({
        customerId: customer.id,
        error: result.error || "Unknown error"
      });
    }

    // Rate limiting: wait 200ms between requests (max 5 requests/second)
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return stats;
}
