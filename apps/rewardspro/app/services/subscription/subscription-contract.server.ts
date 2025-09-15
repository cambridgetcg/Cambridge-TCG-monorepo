/**
 * Subscription Contract Service
 * Manages the creation and lifecycle of subscription contracts
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "~/db.server";
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { SUBSCRIPTION_CONFIG, getNextBillingDate, type BillingInterval } from "./config.server";
import type { Customer, Tier } from "@prisma/client";

interface CreateSubscriptionInput {
  shop: string;
  admin: AdminApiContext;
  customer: Customer;
  tier: Tier;
  sellingPlanId: string;
  variantId: string;
  billingInterval: BillingInterval;
  paymentMethodId?: string; // Optional, Shopify will use default if not provided
}

interface SubscriptionContract {
  id: string;
  status: string;
  nextBillingDate: string;
  customerPaymentMethod?: {
    id: string;
    instrument: any;
  };
}

export class SubscriptionContractService {
  /**
   * Create a new subscription contract
   */
  static async createSubscription({
    shop,
    admin,
    customer,
    tier,
    sellingPlanId,
    variantId,
    billingInterval,
    paymentMethodId,
  }: CreateSubscriptionInput): Promise<string> {
    console.log(`Creating subscription for customer ${customer.email} on tier ${tier.name}`);

    // Calculate pricing
    const intervalDetails = SUBSCRIPTION_CONFIG.BILLING_INTERVALS[billingInterval];
    const basePrice = tier.monthlyPrice || 0;
    const discountedPrice = basePrice * (1 - intervalDetails.discountPercentage / 100);
    const nextBillingDate = getNextBillingDate(new Date(), billingInterval);

    // Create subscription contract in Shopify
    const mutation = `
      mutation CreateSubscriptionContract($input: SubscriptionContractCreateInput!) {
        subscriptionContractCreate(input: $input) {
          draft {
            id
            status
            nextBillingDate
            customer {
              id
            }
            lines(first: 1) {
              edges {
                node {
                  id
                  variantId
                  quantity
                  currentPrice {
                    amount
                    currencyCode
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

    try {
      const shopifyCurrency = await this.getShopCurrency(admin);
      
      const input = {
        customerId: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
        nextBillingDate: nextBillingDate.toISOString(),
        currencyCode: shopifyCurrency,
        contract: {
          status: 'ACTIVE',
          billingPolicy: {
            interval: intervalDetails.interval,
            intervalCount: intervalDetails.intervalCount,
          },
          deliveryPolicy: {
            interval: intervalDetails.interval,
            intervalCount: intervalDetails.intervalCount,
          },
          lines: [
            {
              productVariantId: variantId,
              quantity: 1,
              currentPrice: discountedPrice.toFixed(2),
              sellingPlanId: sellingPlanId,
              pricingPolicy: {
                basePrice: basePrice.toFixed(2),
                cycleDiscounts: intervalDetails.discountPercentage > 0 
                  ? [{
                      adjustmentType: 'PERCENTAGE',
                      adjustmentValue: {
                        percentage: intervalDetails.discountPercentage,
                      },
                      afterCycle: 0, // Apply from first cycle
                    }]
                  : [],
              },
            },
          ],
        },
      };

      // Add payment method if provided
      if (paymentMethodId) {
        (input as any).paymentMethodId = paymentMethodId;
      }

      const response = await admin.graphql(mutation, {
        variables: { input },
      });

      const data = await response.json();
      
      if (data.data?.subscriptionContractCreate?.userErrors?.length > 0) {
        const errors = data.data.subscriptionContractCreate.userErrors;
        console.error('Subscription creation errors:', errors);
        throw new Error(`Failed to create subscription: ${errors.map((e: any) => e.message).join(', ')}`);
      }

      const draft = data.data?.subscriptionContractCreate?.draft;
      if (!draft) {
        throw new Error('No subscription draft returned');
      }

      // Commit the draft to activate it
      const subscriptionId = await this.commitSubscriptionDraft(admin, draft.id);

      // Store in our database
      const dbSubscription = await db.tierSubscription.create({
        data: {
          id: uuidv4(),
          shop,
          customerId: customer.id,
          tierId: tier.id,
          subscriptionContractId: subscriptionId,
          sellingPlanId,
          status: 'ACTIVE',
          billingInterval: billingInterval as any,
          nextBillingDate,
          currentPeriodStart: new Date(),
          currentPeriodEnd: nextBillingDate,
          discountPercentage: intervalDetails.discountPercentage,
          monthlyPrice: basePrice,
          lastBillingAmount: discountedPrice,
          activatedAt: new Date(),
          metadata: {
            shopifyCustomerId: customer.shopifyCustomerId,
            variantId,
            currency: shopifyCurrency,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update customer with current subscription
      await db.customer.update({
        where: { id: customer.id },
        data: {
          currentSubscriptionId: dbSubscription.id,
          updatedAt: new Date(),
        },
      });

      // Log tier change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: customer.id,
          shop,
          fromTierId: customer.currentTierId,
          toTierId: tier.id,
          changeType: 'UPGRADE',
          triggerType: 'SUBSCRIPTION_CREATED',
          subscriptionId: dbSubscription.id,
          metadata: {
            billingInterval,
            discountPercentage: intervalDetails.discountPercentage,
            monthlyPrice: basePrice,
          },
          createdAt: new Date(),
        },
      });

      console.log(`Subscription created successfully: ${subscriptionId}`);
      return subscriptionId;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Commit a subscription draft to activate it
   */
  private static async commitSubscriptionDraft(
    admin: AdminApiContext,
    draftId: string
  ): Promise<string> {
    const mutation = `
      mutation CommitSubscriptionDraft($draftId: ID!) {
        subscriptionDraftCommit(draftId: $draftId) {
          contract {
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

    const response = await admin.graphql(mutation, {
      variables: { draftId },
    });

    const data = await response.json();
    
    if (data.data?.subscriptionDraftCommit?.userErrors?.length > 0) {
      throw new Error(
        `Failed to commit subscription draft: ${data.data.subscriptionDraftCommit.userErrors
          .map((e: any) => e.message)
          .join(', ')}`
      );
    }

    return data.data?.subscriptionDraftCommit?.contract?.id;
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription({
    shop,
    admin,
    subscriptionId,
    reason = 'Customer requested cancellation',
  }: {
    shop: string;
    admin: AdminApiContext;
    subscriptionId: string;
    reason?: string;
  }): Promise<void> {
    console.log(`Cancelling subscription: ${subscriptionId}`);

    const dbSubscription = await db.tierSubscription.findFirst({
      where: { shop, subscriptionContractId: subscriptionId },
    });

    if (!dbSubscription) {
      throw new Error('Subscription not found in database');
    }

    const mutation = `
      mutation CancelSubscription($subscriptionContractId: ID!) {
        subscriptionContractUpdate(
          subscriptionContractId: $subscriptionContractId
        ) {
          draft {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      // First create a draft
      const draftResponse = await admin.graphql(mutation, {
        variables: { subscriptionContractId: subscriptionId },
      });

      const draftData = await draftResponse.json();
      const draftId = draftData.data?.subscriptionContractUpdate?.draft?.id;

      if (!draftId) {
        throw new Error('Failed to create cancellation draft');
      }

      // Update the draft to cancel
      const cancelMutation = `
        mutation UpdateDraftToCancel($draftId: ID!, $input: SubscriptionDraftInput!) {
          subscriptionDraftUpdate(draftId: $draftId, input: $input) {
            draft {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      await admin.graphql(cancelMutation, {
        variables: {
          draftId,
          input: {
            status: 'CANCELLED',
          },
        },
      });

      // Commit the cancellation
      await this.commitSubscriptionDraft(admin, draftId);

      // Update database
      await db.tierSubscription.update({
        where: { id: dbSubscription.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        },
      });

      // Remove from customer
      await db.customer.update({
        where: { id: dbSubscription.customerId },
        data: {
          currentSubscriptionId: null,
          updatedAt: new Date(),
        },
      });

      // Log the change
      await db.tierChangeLog.create({
        data: {
          id: uuidv4(),
          customerId: dbSubscription.customerId,
          shop,
          fromTierId: dbSubscription.tierId,
          toTierId: null,
          changeType: 'DOWNGRADE',
          triggerType: 'SUBSCRIPTION_CANCELLED',
          subscriptionId: dbSubscription.id,
          metadata: { reason },
          createdAt: new Date(),
        },
      });

      console.log(`Subscription cancelled successfully: ${subscriptionId}`);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Pause a subscription
   */
  static async pauseSubscription({
    shop,
    admin,
    subscriptionId,
  }: {
    shop: string;
    admin: AdminApiContext;
    subscriptionId: string;
  }): Promise<void> {
    console.log(`Pausing subscription: ${subscriptionId}`);

    const dbSubscription = await db.tierSubscription.findFirst({
      where: { shop, subscriptionContractId: subscriptionId },
    });

    if (!dbSubscription) {
      throw new Error('Subscription not found in database');
    }

    // Similar to cancel, but set status to PAUSED
    // Implementation would follow same pattern as cancelSubscription
    // but with PAUSED status instead

    await db.tierSubscription.update({
      where: { id: dbSubscription.id },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`Subscription paused successfully: ${subscriptionId}`);
  }

  /**
   * Resume a paused subscription
   */
  static async resumeSubscription({
    shop,
    admin,
    subscriptionId,
  }: {
    shop: string;
    admin: AdminApiContext;
    subscriptionId: string;
  }): Promise<void> {
    console.log(`Resuming subscription: ${subscriptionId}`);

    const dbSubscription = await db.tierSubscription.findFirst({
      where: { shop, subscriptionContractId: subscriptionId, status: 'PAUSED' },
    });

    if (!dbSubscription) {
      throw new Error('Paused subscription not found');
    }

    // Resume in Shopify (similar pattern to pause/cancel)
    // ...

    await db.tierSubscription.update({
      where: { id: dbSubscription.id },
      data: {
        status: 'ACTIVE',
        pausedAt: null,
        updatedAt: new Date(),
      },
    });

    console.log(`Subscription resumed successfully: ${subscriptionId}`);
  }

  /**
   * Get shop currency from Shopify
   */
  private static async getShopCurrency(admin: AdminApiContext): Promise<string> {
    const query = `
      query GetShopCurrency {
        shop {
          currencyCode
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();
    return data.data?.shop?.currencyCode || 'USD';
  }

  /**
   * Get customer payment methods
   */
  static async getCustomerPaymentMethods({
    admin,
    customerId,
  }: {
    admin: AdminApiContext;
    customerId: string;
  }): Promise<any[]> {
    const query = `
      query GetCustomerPaymentMethods($customerId: ID!) {
        customer(id: $customerId) {
          paymentMethods(first: 10) {
            edges {
              node {
                id
                instrument {
                  ... on CustomerCreditCard {
                    brand
                    lastDigits
                    expiryMonth
                    expiryYear
                  }
                  ... on CustomerPaypalBillingAgreement {
                    paypalAccountEmail
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, {
        variables: { customerId: `gid://shopify/Customer/${customerId}` },
      });

      const data = await response.json();
      return data.data?.customer?.paymentMethods?.edges?.map((e: any) => e.node) || [];
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      return [];
    }
  }
}