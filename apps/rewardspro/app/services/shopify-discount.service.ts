/**
 * Shopify Discount Service
 *
 * Centralized service for creating discount codes via Shopify GraphQL API.
 * Replaces inline GraphQL mutations in raffle-prize-delivery, mystery-box-delivery,
 * points-redemption, and challenge-claim services.
 */

import { createLogger } from '~/services/logger.server';

const logger = createLogger('ShopifyDiscountService');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DiscountCodeParams {
  /** Display title in Shopify admin (e.g., "Raffle Win: Summer Giveaway") */
  title: string;
  /** The discount code string customers enter at checkout */
  code: string;
  /** Discount type */
  type: "percentage" | "fixed_amount";
  /** Discount value: percentage (0-100) or fixed dollar amount */
  value: number;
  /** Maximum number of times this code can be used (default: 1) */
  usageLimit?: number;
  /** When the discount expires (default: 30 days from now) */
  expiresAt?: Date;
  /** Minimum purchase subtotal required (optional) */
  minimumSubtotal?: number;
}

export interface DiscountResult {
  success: boolean;
  /** Shopify discount node GID */
  discountId?: string;
  /** The discount code */
  code?: string;
  error?: string;
}

// ============================================================================
// GRAPHQL MUTATION
// ============================================================================

const DISCOUNT_CODE_CREATE_MUTATION = `#graphql
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) {
              nodes {
                code
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

// ============================================================================
// SHOPIFY DISCOUNT SERVICE CLASS
// ============================================================================

export class ShopifyDiscountService {
  private admin: any;
  private shop: string;

  constructor(admin: any, shop: string) {
    this.admin = admin;
    this.shop = shop;
  }

  /**
   * Create a discount code in Shopify
   */
  async createDiscountCode(params: DiscountCodeParams): Promise<DiscountResult> {
    const {
      title,
      code,
      type,
      value,
      usageLimit = 1,
      expiresAt,
      minimumSubtotal,
    } = params;

    const expirationDate = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    logger.info('Creating discount code', { code, type, value, title });

    try {
      const variables = {
        basicCodeDiscount: {
          title,
          code,
          startsAt: new Date().toISOString(),
          endsAt: expirationDate.toISOString(),
          usageLimit,
          customerSelection: {
            all: true,
          },
          customerGets: {
            value:
              type === "percentage"
                ? { percentage: value / 100 }
                : { discountAmount: { amount: value, appliesOnEachItem: false } },
            items: { all: true },
          },
          ...(minimumSubtotal
            ? {
                minimumRequirement: {
                  subtotal: {
                    greaterThanOrEqualToSubtotal: minimumSubtotal,
                  },
                },
              }
            : {}),
        },
      };

      const response = await this.admin.graphql(DISCOUNT_CODE_CREATE_MUTATION, { variables });
      const data = await response.json();

      // Check for GraphQL errors
      if (data.errors) {
        logger.error('GraphQL errors', { errors: data.errors });
        return {
          success: false,
          error: data.errors[0]?.message || 'GraphQL error',
        };
      }

      // Check for user errors
      const userErrors = data.data?.discountCodeBasicCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => e.message).join(', ');
        logger.error('User errors', { userErrors });
        return {
          success: false,
          error: errorMessages,
        };
      }

      // Extract discount ID
      const discountNode = data.data?.discountCodeBasicCreate?.codeDiscountNode;
      if (!discountNode) {
        return {
          success: false,
          error: 'No discount node returned from Shopify',
        };
      }

      logger.info('Discount code created', { discountId: discountNode.id, code });

      return {
        success: true,
        discountId: discountNode.id,
        code,
      };
    } catch (error) {
      logger.error('API error creating discount', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ShopifyDiscountService instance
 */
export function createDiscountService(admin: any, shop: string): ShopifyDiscountService {
  return new ShopifyDiscountService(admin, shop);
}
