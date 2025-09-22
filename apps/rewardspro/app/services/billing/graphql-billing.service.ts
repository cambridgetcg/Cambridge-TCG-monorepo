/**
 * GraphQL Billing Service
 * Handles all GraphQL billing operations for the app
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import db from "../../db.server";
import {
  BillingConfig,
  formatMoneyInput,
  getCurrencyCode,
  getPlanConfig,
  isDevelopmentStore
} from "../../utils/billing-config";
import crypto from "crypto";

// GraphQL Mutations
const CREATE_SUBSCRIPTION_MUTATION = `#graphql
  mutation CreateSubscription(
    $name: String!
    $returnUrl: URL!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $trialDays: Int
    $replacementBehavior: AppSubscriptionReplacementBehavior
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      trialDays: $trialDays
      replacementBehavior: $replacementBehavior
      test: $test
    ) {
      confirmationUrl
      appSubscription {
        id
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
              ... on AppUsagePricing {
                cappedAmount {
                  amount
                  currencyCode
                }
                terms
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

const GET_SUBSCRIPTION_QUERY = `#graphql
  query GetSubscription($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
              ... on AppUsagePricing {
                cappedAmount {
                  amount
                  currencyCode
                }
                terms
              }
            }
          }
        }
      }
    }
  }
`;

const CANCEL_SUBSCRIPTION_MUTATION = `#graphql
  mutation CancelSubscription($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_USAGE_RECORD_MUTATION = `#graphql
  mutation CreateUsageRecord(
    $subscriptionLineItemId: ID!
    $price: MoneyInput!
    $description: String!
    $idempotencyKey: String!
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
      idempotencyKey: $idempotencyKey
    ) {
      userErrors {
        field
        message
      }
      appUsageRecord {
        id
        idempotencyKey
        createdAt
      }
    }
  }
`;

const GET_ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query GetActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
            }
          }
        }
      }
    }
  }
`;

export interface CreateSubscriptionOptions {
  shop: string;
  planType: 'starter' | 'growth' | 'enterprise';
  isUpgrade: boolean;
  returnUrl?: string;
}

export interface SubscriptionResult {
  success: boolean;
  confirmationUrl?: string;
  subscriptionId?: string;
  error?: string;
  userErrors?: Array<{ field: string[]; message: string }>;
}

export interface UsageRecordResult {
  success: boolean;
  recordId?: string;
  error?: string;
  idempotent?: boolean;
}

export class GraphQLBillingService {
  constructor(private admin: AdminApiContext) {}

  /**
   * Create a new subscription
   */
  async createSubscription(options: CreateSubscriptionOptions): Promise<SubscriptionResult> {
    const { shop, planType, isUpgrade } = options;
    const planConfig = getPlanConfig(planType);

    if (!planConfig) {
      return {
        success: false,
        error: `Invalid plan type: ${planType}`
      };
    }

    try {
      // Build return URL with shop parameter
      const returnUrl = options.returnUrl ||
        `${process.env.SHOPIFY_APP_URL}/app/billing/callback?shop=${shop}`;

      // Build line items array
      const lineItems: any[] = [
        {
          plan: {
            appRecurringPricingDetails: {
              interval: "EVERY_30_DAYS",
              price: {
                amount: formatMoneyInput(planConfig.price),
                currencyCode: getCurrencyCode(shop)
              }
            }
          }
        }
      ];

      // Add usage pricing if configured
      if (planConfig.usageRate && planConfig.usageCap) {
        lineItems.push({
          plan: {
            appUsagePricingDetails: {
              terms: `$${planConfig.usageRate} per order over ${planConfig.orderLimit} orders`,
              cappedAmount: {
                amount: formatMoneyInput(planConfig.usageCap),
                currencyCode: getCurrencyCode(shop)
              }
            }
          }
        });
      }

      const variables = {
        name: planConfig.name,
        returnUrl,
        lineItems,
        trialDays: planConfig.trialDays || BillingConfig.trialDays,
        replacementBehavior: isUpgrade
          ? BillingConfig.replacementBehavior.upgrade
          : BillingConfig.replacementBehavior.downgrade,
        test: isDevelopmentStore(shop)
      };

      const response = await this.admin.graphql(CREATE_SUBSCRIPTION_MUTATION, {
        variables
      });

      const result = await response.json();

      if (result.data?.appSubscriptionCreate?.userErrors?.length > 0) {
        return {
          success: false,
          error: result.data.appSubscriptionCreate.userErrors[0].message,
          userErrors: result.data.appSubscriptionCreate.userErrors
        };
      }

      const subscription = result.data?.appSubscriptionCreate?.appSubscription;
      const confirmationUrl = result.data?.appSubscriptionCreate?.confirmationUrl;

      if (!confirmationUrl || !subscription) {
        return {
          success: false,
          error: "Failed to create subscription"
        };
      }

      // Store pending charge info
      await this.storePendingCharge(shop, subscription.id, confirmationUrl);

      return {
        success: true,
        confirmationUrl,
        subscriptionId: subscription.id
      };

    } catch (error: any) {
      console.error("[GraphQLBilling] Create subscription error:", error);
      return {
        success: false,
        error: error.message || "Failed to create subscription"
      };
    }
  }

  /**
   * Verify subscription after callback
   */
  async verifySubscription(shop: string, chargeId: string): Promise<SubscriptionResult> {
    try {
      const gid = `gid://shopify/AppSubscription/${chargeId}`;

      const response = await this.admin.graphql(GET_SUBSCRIPTION_QUERY, {
        variables: { id: gid }
      });

      const result = await response.json();
      const subscription = result.data?.node;

      if (!subscription) {
        return {
          success: false,
          error: "Subscription not found"
        };
      }

      if (subscription.status === 'ACTIVE') {
        // Extract line item IDs
        const recurringLineItem = subscription.lineItems.find(
          (item: any) => item.plan.pricingDetails.__typename === 'AppRecurringPricing'
        );
        const usageLineItem = subscription.lineItems.find(
          (item: any) => item.plan.pricingDetails.__typename === 'AppUsagePricing'
        );

        // Update billing subscription in database
        await db.billingSubscription.upsert({
          where: { shop },
          create: {
            shop,
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.currentPeriodEnd),
            recurringLineItemId: recurringLineItem?.id,
            usageLineItemId: usageLineItem?.id,
            billingVersion: 'graphql'
          },
          update: {
            subscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.currentPeriodEnd),
            recurringLineItemId: recurringLineItem?.id,
            usageLineItemId: usageLineItem?.id,
            pendingChargeId: null,
            pendingChargeCreatedAt: null,
            confirmationUrl: null,
            billingVersion: 'graphql'
          }
        });

        return {
          success: true,
          subscriptionId: subscription.id
        };
      }

      return {
        success: false,
        error: `Subscription status is ${subscription.status}`
      };

    } catch (error: any) {
      console.error("[GraphQLBilling] Verify subscription error:", error);
      return {
        success: false,
        error: error.message || "Failed to verify subscription"
      };
    }
  }

  /**
   * Create usage record for overage charges
   */
  async createUsageRecord(
    shop: string,
    amount: number,
    description: string
  ): Promise<UsageRecordResult> {
    try {
      // Get subscription line item ID
      const billingSubscription = await db.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription?.usageLineItemId) {
        return {
          success: false,
          error: "No usage line item found for this subscription"
        };
      }

      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(shop, amount, description);

      const variables = {
        subscriptionLineItemId: billingSubscription.usageLineItemId,
        price: {
          amount: formatMoneyInput(amount),
          currencyCode: getCurrencyCode(shop)
        },
        description,
        idempotencyKey
      };

      const response = await this.admin.graphql(CREATE_USAGE_RECORD_MUTATION, {
        variables
      });

      const result = await response.json();

      if (result.data?.appUsageRecordCreate?.userErrors?.length > 0) {
        const error = result.data.appUsageRecordCreate.userErrors[0];

        // Check if it's a duplicate (idempotent)
        if (error.message.includes('already exists')) {
          return {
            success: true,
            idempotent: true
          };
        }

        // Check if cap exceeded
        if (error.message.includes('exceeds balance') || error.message.includes('capped amount')) {
          return {
            success: false,
            error: "Usage cap reached for this billing period"
          };
        }

        return {
          success: false,
          error: error.message
        };
      }

      const usageRecord = result.data?.appUsageRecordCreate?.appUsageRecord;

      if (!usageRecord) {
        return {
          success: false,
          error: "Failed to create usage record"
        };
      }

      // Update current period usage fee
      await db.billingSubscription.update({
        where: { shop },
        data: {
          currentPeriodUsageFee: {
            increment: amount
          }
        }
      });

      return {
        success: true,
        recordId: usageRecord.id
      };

    } catch (error: any) {
      console.error("[GraphQLBilling] Create usage record error:", error);
      return {
        success: false,
        error: error.message || "Failed to create usage record"
      };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(shop: string): Promise<SubscriptionResult> {
    try {
      const billingSubscription = await db.billingSubscription.findUnique({
        where: { shop }
      });

      if (!billingSubscription?.subscriptionId) {
        return {
          success: false,
          error: "No active subscription found"
        };
      }

      const response = await this.admin.graphql(CANCEL_SUBSCRIPTION_MUTATION, {
        variables: { id: billingSubscription.subscriptionId }
      });

      const result = await response.json();

      if (result.data?.appSubscriptionCancel?.userErrors?.length > 0) {
        return {
          success: false,
          error: result.data.appSubscriptionCancel.userErrors[0].message,
          userErrors: result.data.appSubscriptionCancel.userErrors
        };
      }

      // Update database
      await db.billingSubscription.update({
        where: { shop },
        data: {
          subscriptionStatus: 'CANCELLED'
        }
      });

      return {
        success: true
      };

    } catch (error: any) {
      console.error("[GraphQLBilling] Cancel subscription error:", error);
      return {
        success: false,
        error: error.message || "Failed to cancel subscription"
      };
    }
  }

  /**
   * Check subscription status (for polling)
   */
  async checkSubscriptionStatus(shop: string): Promise<SubscriptionResult> {
    try {
      const response = await this.admin.graphql(GET_ACTIVE_SUBSCRIPTIONS_QUERY);
      const result = await response.json();

      const activeSubscriptions = result.data?.currentAppInstallation?.activeSubscriptions || [];

      if (activeSubscriptions.length === 0) {
        // No active subscription
        await db.billingSubscription.update({
          where: { shop },
          data: {
            subscriptionStatus: 'INACTIVE'
          }
        });

        return {
          success: false,
          error: "No active subscription"
        };
      }

      const subscription = activeSubscriptions[0];

      // Update database with current status
      await db.billingSubscription.update({
        where: { shop },
        data: {
          subscriptionStatus: subscription.status,
          currentPeriodEnd: new Date(subscription.currentPeriodEnd)
        }
      });

      return {
        success: true,
        subscriptionId: subscription.id
      };

    } catch (error: any) {
      console.error("[GraphQLBilling] Check subscription status error:", error);
      return {
        success: false,
        error: error.message || "Failed to check subscription status"
      };
    }
  }

  /**
   * Store pending charge info
   */
  private async storePendingCharge(shop: string, chargeId: string, confirmationUrl: string) {
    await db.billingSubscription.upsert({
      where: { shop },
      create: {
        shop,
        pendingChargeId: chargeId,
        pendingChargeCreatedAt: new Date(),
        confirmationUrl,
        billingVersion: 'graphql'
      },
      update: {
        pendingChargeId: chargeId,
        pendingChargeCreatedAt: new Date(),
        confirmationUrl
      }
    });
  }

  /**
   * Generate idempotency key for usage records
   */
  private generateIdempotencyKey(shop: string, amount: number, description: string): string {
    const components = [
      'usage',
      shop,
      formatMoneyInput(amount),
      description,
      Math.floor(Date.now() / 60000), // Minute precision
      crypto.randomBytes(4).toString('hex')
    ];

    const key = components.join('-');

    // Ensure within 255 character limit
    if (key.length > 255) {
      const hash = crypto.createHash('sha256').update(key).digest('hex');
      return `usage-hash-${hash.substring(0, 32)}`;
    }

    return key;
  }

  /**
   * Check if pending charge has expired
   */
  async checkExpiredCharge(shop: string): Promise<{ expired: boolean; reminder?: boolean }> {
    const billingSubscription = await db.billingSubscription.findUnique({
      where: { shop }
    });

    if (billingSubscription?.pendingChargeCreatedAt) {
      const hoursSinceCreation =
        (Date.now() - billingSubscription.pendingChargeCreatedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceCreation > 48) {
        // Charge expired, clear it
        await db.billingSubscription.update({
          where: { shop },
          data: {
            pendingChargeId: null,
            pendingChargeCreatedAt: null,
            confirmationUrl: null
          }
        });

        return { expired: true };
      }

      if (hoursSinceCreation > 24) {
        // Send reminder
        return { expired: false, reminder: true };
      }
    }

    return { expired: false };
  }
}