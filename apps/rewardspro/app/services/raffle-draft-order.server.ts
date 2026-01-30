/**
 * Raffle Draft Order Service
 *
 * Creates Shopify draft orders for PRODUCT prize winners.
 * Draft orders allow admin review before fulfillment.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getFirstVariantId } from "./product-search.server";

// ============================================
// TYPES
// ============================================

export interface DraftOrderInput {
  /** Shopify customer GID (gid://shopify/Customer/123) */
  customerId: string;
  /** Shopify product GID */
  productId: string;
  /** Shopify variant GID (optional - uses first variant if not provided) */
  variantId?: string;
  /** Quantity of product to include */
  quantity: number;
  /** Raffle name for notes and tags */
  raffleName: string;
  /** Internal winner ID for reference */
  winnerId: string;
  /** Customer email for notification */
  customerEmail?: string;
}

export interface DraftOrderResult {
  success: boolean;
  /** Shopify draft order GID */
  draftOrderId?: string;
  /** Draft order name (e.g., #D123) */
  draftOrderName?: string;
  /** Admin URL to view/complete the draft order */
  draftOrderAdminUrl?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================
// GRAPHQL MUTATIONS
// ============================================

const DRAFT_ORDER_CREATE_MUTATION = `#graphql
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        status
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          email
        }
        lineItems(first: 5) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Create a draft order for a raffle prize winner
 *
 * The draft order is created with a 100% discount, making the product free.
 * Admin must review and complete the draft order to fulfill.
 *
 * @param admin - Shopify admin API context
 * @param input - Draft order configuration
 * @returns Result with draft order details or error
 */
export async function createRaffleDraftOrder(
  admin: AdminApiContext,
  input: DraftOrderInput
): Promise<DraftOrderResult> {
  const LOG_PREFIX = "[RaffleDraftOrder]";

  console.log(
    `${LOG_PREFIX} Creating draft order for winner ${input.winnerId}, product ${input.productId}`
  );

  try {
    // Resolve variant ID if not provided
    let variantId = input.variantId;
    if (!variantId) {
      console.log(`${LOG_PREFIX} No variant specified, fetching first variant`);
      variantId = await getFirstVariantId(admin, input.productId);

      if (!variantId) {
        return {
          success: false,
          error: "Could not determine product variant",
        };
      }
    }

    // Build draft order input
    const draftOrderInput = {
      customerId: input.customerId,
      note: `Raffle Prize Winner\nRaffle: ${input.raffleName}\nWinner ID: ${input.winnerId}`,
      tags: ["raffle-prize", `raffle:${sanitizeTag(input.raffleName)}`],
      lineItems: [
        {
          variantId,
          quantity: input.quantity,
          appliedDiscount: {
            description: `Raffle Prize: ${input.raffleName}`,
            valueType: "PERCENTAGE",
            value: 100, // 100% discount = free
            title: "Raffle Prize",
          },
        },
      ],
      // Don't require payment
      useCustomerDefaultAddress: true,
    };

    console.log(`${LOG_PREFIX} Calling draftOrderCreate mutation`);

    const response = await admin.graphql(DRAFT_ORDER_CREATE_MUTATION, {
      variables: { input: draftOrderInput },
    });

    const data = await response.json();

    // Check for user errors
    if (data.data?.draftOrderCreate?.userErrors?.length > 0) {
      const errors = data.data.draftOrderCreate.userErrors;
      console.error(`${LOG_PREFIX} Draft order user errors:`, errors);
      return {
        success: false,
        error: errors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    // Check for GraphQL errors
    if (data.errors) {
      console.error(`${LOG_PREFIX} GraphQL errors:`, data.errors);
      return {
        success: false,
        error: data.errors[0]?.message || "GraphQL mutation failed",
      };
    }

    const draftOrder = data.data?.draftOrderCreate?.draftOrder;
    if (!draftOrder) {
      return {
        success: false,
        error: "Draft order creation returned no data",
      };
    }

    // Build admin URL
    const adminUrl = buildDraftOrderAdminUrl(admin, draftOrder.id);

    console.log(
      `${LOG_PREFIX} Created draft order: ${draftOrder.name} (${draftOrder.id})`
    );

    return {
      success: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      draftOrderAdminUrl: adminUrl,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating draft order:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build the admin URL for a draft order
 */
function buildDraftOrderAdminUrl(
  admin: AdminApiContext,
  draftOrderGid: string
): string {
  // Extract numeric ID from GID
  const numericId = draftOrderGid.replace("gid://shopify/DraftOrder/", "");

  // Get shop domain from admin context
  // The shop domain should be available from the session
  // Using a placeholder pattern that will work in Shopify admin
  // Format: https://admin.shopify.com/store/{shop}/draft_orders/{id}

  // Note: In production, you'd get the shop from session
  // For now, return a relative path that works from within Shopify admin
  return `/draft_orders/${numericId}`;
}

/**
 * Sanitize a string for use as a Shopify tag
 */
function sanitizeTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ============================================
// BATCH OPERATIONS
// ============================================

export interface BatchDraftOrderResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    winnerId: string;
    result: DraftOrderResult;
  }>;
}

/**
 * Create draft orders for multiple winners
 *
 * Processes sequentially to avoid rate limits.
 *
 * @param admin - Shopify admin API context
 * @param winners - Array of winner configurations
 * @returns Batch result summary
 */
export async function createBatchDraftOrders(
  admin: AdminApiContext,
  winners: DraftOrderInput[]
): Promise<BatchDraftOrderResult> {
  const LOG_PREFIX = "[RaffleDraftOrder.batch]";
  console.log(`${LOG_PREFIX} Creating ${winners.length} draft orders`);

  const results: BatchDraftOrderResult["results"] = [];
  let successful = 0;
  let failed = 0;

  for (const winner of winners) {
    const result = await createRaffleDraftOrder(admin, winner);
    results.push({ winnerId: winner.winnerId, result });

    if (result.success) {
      successful++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `${LOG_PREFIX} Batch complete: ${successful} successful, ${failed} failed`
  );

  return {
    total: winners.length,
    successful,
    failed,
    results,
  };
}
