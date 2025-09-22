import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { v4 as uuidv4 } from "uuid";
import db from "../../db.server";

/**
 * Modern GraphQL-based billing service for Shopify subscriptions
 * Replaces legacy billing.require() with direct GraphQL API calls
 *
 * @security All subscription operations must verify shop authenticity
 * @see https://shopify.dev/docs/api/admin-graphql/latest/objects/AppSubscription
 */

export interface BillingPlan {
  name: string;
  amount: number;
  currencyCode: string;
  interval: "EVERY_30_DAYS" | "ANNUAL";
  usageCapAmount?: number;
  usageTerms?: string;
  trialDays?: number;
  test?: boolean;
}

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscription?: {
    id: string;
    name: string;
    status: string;
    test: boolean;
    currentPeriodEnd?: string;
    trialDays?: number;
  };
  isDevStore?: boolean;
}

export class BillingGraphQLService {
  private admin: AdminApiContext;
  private shop: string;
  private returnUrl: string;

  constructor(admin: AdminApiContext, shop: string, appUrl: string) {
    this.admin = admin;
    this.shop = shop;
    this.returnUrl = `${appUrl}/app/billing/callback`;
  }

  /**
   * Check if shop is a development store
   * Dev stores should always use test: true for billing
   */
  async checkIfDevStore(): Promise<boolean> {
    const query = `
      query getShopPlan {
        shop {
          plan {
            partnerDevelopment
            displayName
          }
        }
      }
    `;

    try {
      const response = await this.admin.graphql(query);
      const data = await response.json();

      const isDevStore = data?.data?.shop?.plan?.partnerDevelopment === true ||
                        data?.data?.shop?.plan?.displayName === "Development";

      console.log(`[BillingGraphQL] Shop ${this.shop} is dev store: ${isDevStore}`);
      return isDevStore;
    } catch (error) {
      console.error("[BillingGraphQL] Error checking dev store status:", error);
      return false;
    }
  }

  /**
   * Get current subscription status for the shop
   */
  async getCurrentSubscription(): Promise<SubscriptionStatus> {
    const query = `
      query getCurrentSubscription {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            currentPeriodEnd
            trialDays
            lineItems {
              id
              plan {
                pricingDetails {
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

    try {
      const response = await this.admin.graphql(query);
      const data = await response.json();

      const subscriptions = data?.data?.currentAppInstallation?.activeSubscriptions || [];
      const activeSubscription = subscriptions.find((sub: any) =>
        sub.status === "ACTIVE" || sub.status === "PENDING"
      );

      const isDevStore = await this.checkIfDevStore();

      return {
        hasActiveSubscription: !!activeSubscription,
        subscription: activeSubscription ? {
          id: activeSubscription.id,
          name: activeSubscription.name,
          status: activeSubscription.status,
          test: activeSubscription.test,
          currentPeriodEnd: activeSubscription.currentPeriodEnd,
          trialDays: activeSubscription.trialDays,
        } : undefined,
        isDevStore,
      };
    } catch (error) {
      console.error("[BillingGraphQL] Error fetching subscription:", error);
      return { hasActiveSubscription: false };
    }
  }

  /**
   * Create a new subscription with recurring and/or usage-based pricing
   */
  async createSubscription(plan: BillingPlan): Promise<{ confirmationUrl?: string; error?: string }> {
    // Check if dev store to set test mode
    const isDevStore = await this.checkIfDevStore();
    const isTest = plan.test ?? isDevStore;

    // Build line items based on plan configuration
    const lineItems = [];

    // Add recurring charge if amount > 0
    if (plan.amount > 0) {
      lineItems.push(`{
        plan: {
          appRecurringPricingDetails: {
            price: { amount: ${plan.amount}, currencyCode: ${plan.currencyCode} }
            interval: ${plan.interval}
          }
        }
      }`);
    }

    // Add usage-based charge if configured
    if (plan.usageCapAmount && plan.usageCapAmount > 0) {
      lineItems.push(`{
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: ${plan.usageCapAmount}, currencyCode: ${plan.currencyCode} }
            terms: "${plan.usageTerms || 'Usage charges'}"
          }
        }
      }`);
    }

    if (lineItems.length === 0) {
      return { error: "Invalid plan configuration: no pricing details" };
    }

    const mutation = `
      mutation createAppSubscription(
        $name: String!
        $returnUrl: URL!
        $test: Boolean!
        $trialDays: Int
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          trialDays: $trialDays
          lineItems: [${lineItems.join(',')}]
        ) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      name: plan.name,
      returnUrl: this.returnUrl,
      test: isTest,
      trialDays: plan.trialDays || null,
    };

    try {
      console.log(`[BillingGraphQL] Creating subscription for ${this.shop}:`, {
        plan: plan.name,
        test: isTest,
        recurring: plan.amount,
        usage: plan.usageCapAmount,
      });

      const response = await this.admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data?.data?.appSubscriptionCreate?.userErrors?.length > 0) {
        const errors = data.data.appSubscriptionCreate.userErrors;
        console.error("[BillingGraphQL] Subscription creation errors:", errors);
        return { error: errors.map((e: any) => e.message).join(", ") };
      }

      const confirmationUrl = data?.data?.appSubscriptionCreate?.confirmationUrl;
      if (!confirmationUrl) {
        return { error: "No confirmation URL returned" };
      }

      // Store pending subscription in database
      try {
        await db.billingSubscription.upsert({
          where: { shop: this.shop },
          create: {
            id: uuidv4(),
            shop: this.shop,
            subscriptionId: data?.data?.appSubscriptionCreate?.appSubscription?.id || "",
            planName: plan.name,
            status: "PENDING",
            isTest,
            cappedAmount: plan.usageCapAmount || null,
            balanceUsed: 0,
            balanceRemaining: plan.usageCapAmount || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            subscriptionId: data?.data?.appSubscriptionCreate?.appSubscription?.id || "",
            planName: plan.name,
            status: "PENDING",
            isTest,
            cappedAmount: plan.usageCapAmount || null,
            updatedAt: new Date(),
          }
        });
      } catch (dbError: any) {
        console.log("[BillingGraphQL] Could not store subscription (table may not exist yet)");
      }

      console.log(`[BillingGraphQL] Subscription created, confirmation URL: ${confirmationUrl}`);
      return { confirmationUrl };

    } catch (error) {
      console.error("[BillingGraphQL] Error creating subscription:", error);
      return { error: "Failed to create subscription" };
    }
  }

  /**
   * Cancel the current subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<{ success: boolean; error?: string }> {
    const mutation = `
      mutation cancelAppSubscription($id: ID!) {
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

    try {
      const response = await this.admin.graphql(mutation, {
        variables: { id: subscriptionId }
      });
      const data = await response.json();

      if (data?.data?.appSubscriptionCancel?.userErrors?.length > 0) {
        const errors = data.data.appSubscriptionCancel.userErrors;
        return {
          success: false,
          error: errors.map((e: any) => e.message).join(", ")
        };
      }

      // Update database
      try {
        await db.billingSubscription.update({
          where: { shop: this.shop },
          data: {
            status: "CANCELLED",
            updatedAt: new Date(),
          }
        });
      } catch (dbError) {
        console.log("[BillingGraphQL] Could not update cancelled subscription in DB");
      }

      return { success: true };

    } catch (error) {
      console.error("[BillingGraphQL] Error cancelling subscription:", error);
      return { success: false, error: "Failed to cancel subscription" };
    }
  }

  /**
   * Register webhook for subscription updates
   */
  async registerSubscriptionWebhook(appUrl: string): Promise<boolean> {
    const mutation = `
      mutation registerWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: {
            callbackUrl: $callbackUrl
            format: JSON
          }
        ) {
          webhookSubscription {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      topic: "APP_SUBSCRIPTIONS_UPDATE",
      callbackUrl: `${appUrl}/webhooks/app-subscriptions-update`
    };

    try {
      const response = await this.admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data?.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
        console.error("[BillingGraphQL] Webhook registration errors:",
          data.data.webhookSubscriptionCreate.userErrors);
        return false;
      }

      console.log("[BillingGraphQL] Subscription webhook registered successfully");
      return true;

    } catch (error) {
      console.error("[BillingGraphQL] Error registering webhook:", error);
      return false;
    }
  }
}