/**
 * Subscription Contract Service
 *
 * Handles creation and management of Shopify subscription contracts.
 * Implements the draft/commit pattern with payment method validation.
 */

import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import type { Currency } from '@prisma/client';
import db from '~/db.server';
import { getSubscriptionPaymentMethod, validatePaymentMethodForSubscription } from './payment-method-validation.server';
import { roundToCurrencyPrecision } from './currency-formatter.server';

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionPlan {
  id: string;
  name: string;
  interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  intervalCount: number;
  amount: number;
  currency: Currency;
  trialDays?: number;
  features: string[];
}

export interface SubscriptionContract {
  id: string;
  customerId: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'FAILED' | 'EXPIRED';
  nextBillingDate: Date;
  amount: number;
  currency: Currency;
  interval: string;
  createdAt: Date;
}

export interface CreateSubscriptionResult {
  success: boolean;
  contract?: SubscriptionContract;
  errors: string[];
  draftId?: string;
}

// ============================================================================
// GRAPHQL MUTATIONS
// ============================================================================

const CREATE_SUBSCRIPTION_DRAFT = `#graphql
  mutation CreateSubscriptionDraft($input: SubscriptionContractCreateInput!) {
    subscriptionContractCreate(input: $input) {
      draft {
        id
        status
        nextBillingDate
        customer {
          id
          email
        }
        deliveryPolicy {
          interval
          intervalCount
        }
        billingPolicy {
          interval
          intervalCount
        }
        lines {
          edges {
            node {
              id
              title
              quantity
              productVariant {
                id
                price
              }
              pricingPolicy {
                basePrice {
                  amount
                  currencyCode
                }
                cycleDiscounts {
                  adjustmentType
                  adjustmentValue {
                    __typename
                    ... on MoneyV2 {
                      amount
                      currencyCode
                    }
                    ... on SellingPlanPricingPolicyPercentageValue {
                      percentage
                    }
                  }
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

const COMMIT_SUBSCRIPTION_DRAFT = `#graphql
  mutation CommitSubscriptionDraft($draftId: ID!) {
    subscriptionContractCommit(draftId: $draftId) {
      contract {
        id
        status
        nextBillingDate
        createdAt
        customer {
          id
          email
        }
        customerPaymentMethod {
          id
          instrument {
            __typename
            ... on CustomerCreditCard {
              lastDigits
              brand
            }
          }
        }
        lines {
          edges {
            node {
              id
              title
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
        code
      }
    }
  }
`;

const UPDATE_SUBSCRIPTION_CONTRACT = `#graphql
  mutation UpdateSubscriptionContract($contractId: ID!, $input: SubscriptionContractUpdateInput!) {
    subscriptionContractUpdate(contractId: $contractId, input: $input) {
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

const PAUSE_SUBSCRIPTION = `#graphql
  mutation PauseSubscription($subscriptionContractId: ID!) {
    subscriptionContractPause(
      subscriptionContractId: $subscriptionContractId
    ) {
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

const ACTIVATE_SUBSCRIPTION = `#graphql
  mutation ActivateSubscription($subscriptionContractId: ID!) {
    subscriptionContractActivate(
      subscriptionContractId: $subscriptionContractId
    ) {
      contract {
        id
        status
        nextBillingDate
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CANCEL_SUBSCRIPTION = `#graphql
  mutation CancelSubscription($subscriptionContractId: ID!) {
    subscriptionContractCancel(
      subscriptionContractId: $subscriptionContractId
    ) {
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

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class SubscriptionContractService {
  private admin: AdminApiContext;
  private shop: string;

  constructor(admin: AdminApiContext, shop: string) {
    this.admin = admin;
    this.shop = shop;
  }

  /**
   * Create a subscription contract (draft → commit pattern)
   */
  async createSubscription(
    customerId: string,
    plan: SubscriptionPlan,
    paymentMethodId?: string
  ): Promise<CreateSubscriptionResult> {
    try {
      // Step 1: Validate or get payment method
      let validPaymentMethod = paymentMethodId;
      
      if (paymentMethodId) {
        const validation = await validatePaymentMethodForSubscription(this.admin, this.shop, paymentMethodId);
        if (!validation.isValid) {
          return {
            success: false,
            errors: validation.errors,
          };
        }
      } else {
        // Try to get a valid payment method
        const method = await getSubscriptionPaymentMethod(this.admin, this.shop, customerId);
        if (!method) {
          return {
            success: false,
            errors: ['No valid payment method found for customer'],
          };
        }
        validPaymentMethod = method.id;
      }

      // Step 2: Create subscription draft
      const draftResult = await this.createSubscriptionDraft(customerId, plan, validPaymentMethod!);
      
      if (!draftResult.success || !draftResult.draftId) {
        return draftResult;
      }

      // Step 3: Commit the draft
      const commitResult = await this.commitSubscriptionDraft(draftResult.draftId);
      
      if (commitResult.success && commitResult.contract) {
        // Step 4: Store in database
        await this.storeSubscriptionContract(commitResult.contract, plan);
      }

      return commitResult;
    } catch (error) {
      console.error('[SubscriptionContract] Failed to create subscription:', error);
      return {
        success: false,
        errors: ['Failed to create subscription contract'],
      };
    }
  }

  /**
   * Create subscription draft
   */
  private async createSubscriptionDraft(
    customerId: string,
    plan: SubscriptionPlan,
    paymentMethodId: string
  ): Promise<CreateSubscriptionResult> {
    try {
      // Build the input for subscription creation
      const input = {
        customerId,
        customerPaymentMethodId: paymentMethodId,
        nextBillingDate: this.calculateNextBillingDate(plan),
        currencyCode: plan.currency,
        contract: {
          deliveryPolicy: {
            interval: plan.interval,
            intervalCount: plan.intervalCount,
          },
          billingPolicy: {
            interval: plan.interval,
            intervalCount: plan.intervalCount,
          },
          // Add lines for subscription products
          lines: [
            {
              productVariantId: plan.id, // This should be the variant ID from tier products
              quantity: 1,
              pricingPolicy: {
                basePrice: {
                  amount: plan.amount.toString(),
                  currencyCode: plan.currency,
                },
              },
            },
          ],
        },
      };

      const response = await this.admin.graphql(CREATE_SUBSCRIPTION_DRAFT, {
        variables: { input },
      });

      const data = await response.json();

      if (data.errors) {
        console.error('[SubscriptionContract] GraphQL errors:', data.errors);
        return {
          success: false,
          errors: data.errors.map((e: any) => e.message),
        };
      }

      const result = data.data.subscriptionContractCreate;
      
      if (result.userErrors?.length > 0) {
        return {
          success: false,
          errors: result.userErrors.map((e: any) => e.message),
        };
      }

      if (!result.draft) {
        return {
          success: false,
          errors: ['Failed to create subscription draft'],
        };
      }

      return {
        success: true,
        draftId: result.draft.id,
        errors: [],
      };
    } catch (error) {
      console.error('[SubscriptionContract] Failed to create draft:', error);
      return {
        success: false,
        errors: ['Failed to create subscription draft'],
      };
    }
  }

  /**
   * Commit subscription draft to create active contract
   */
  private async commitSubscriptionDraft(draftId: string): Promise<CreateSubscriptionResult> {
    try {
      const response = await this.admin.graphql(COMMIT_SUBSCRIPTION_DRAFT, {
        variables: { draftId },
      });

      const data = await response.json();

      if (data.errors) {
        console.error('[SubscriptionContract] Commit errors:', data.errors);
        return {
          success: false,
          draftId,
          errors: data.errors.map((e: any) => e.message),
        };
      }

      const result = data.data.subscriptionContractCommit;
      
      if (result.userErrors?.length > 0) {
        // Check for specific error codes
        const errors = result.userErrors.map((e: any) => {
          if (e.code === 'PAYMENT_METHOD_NOT_FOUND') {
            return 'Payment method not found or invalid';
          }
          if (e.code === 'CUSTOMER_NEEDS_PAYMENT_METHOD') {
            return 'Customer needs a valid payment method for subscriptions';
          }
          return e.message;
        });

        return {
          success: false,
          draftId,
          errors,
        };
      }

      if (!result.contract) {
        return {
          success: false,
          draftId,
          errors: ['Failed to commit subscription draft'],
        };
      }

      // Parse contract data
      const contract: SubscriptionContract = {
        id: result.contract.id,
        customerId: result.contract.customer.id,
        status: result.contract.status,
        nextBillingDate: new Date(result.contract.nextBillingDate),
        amount: parseFloat(result.contract.lines.edges[0]?.node.currentPrice.amount || '0'),
        currency: result.contract.lines.edges[0]?.node.currentPrice.currencyCode as Currency || 'USD',
        interval: `${result.contract.deliveryPolicy?.intervalCount || 1} ${result.contract.deliveryPolicy?.interval || 'MONTH'}`,
        createdAt: new Date(result.contract.createdAt),
      };

      return {
        success: true,
        contract,
        errors: [],
      };
    } catch (error) {
      console.error('[SubscriptionContract] Failed to commit draft:', error);
      return {
        success: false,
        draftId,
        errors: ['Failed to commit subscription draft'],
      };
    }
  }

  /**
   * Pause an active subscription
   */
  async pauseSubscription(contractId: string): Promise<{ success: boolean; errors: string[] }> {
    try {
      const response = await this.admin.graphql(PAUSE_SUBSCRIPTION, {
        variables: { subscriptionContractId: contractId },
      });

      const data = await response.json();

      if (data.errors) {
        return {
          success: false,
          errors: data.errors.map((e: any) => e.message),
        };
      }

      const result = data.data.subscriptionContractPause;
      
      if (result.userErrors?.length > 0) {
        return {
          success: false,
          errors: result.userErrors.map((e: any) => e.message),
        };
      }

      // Update database
      await db.subscription.update({
        where: {
          shopifyContractId: contractId,
          shop: this.shop,
        },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { success: true, errors: [] };
    } catch (error) {
      console.error('[SubscriptionContract] Failed to pause subscription:', error);
      return {
        success: false,
        errors: ['Failed to pause subscription'],
      };
    }
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(contractId: string): Promise<{ success: boolean; errors: string[] }> {
    try {
      const response = await this.admin.graphql(ACTIVATE_SUBSCRIPTION, {
        variables: { subscriptionContractId: contractId },
      });

      const data = await response.json();

      if (data.errors) {
        return {
          success: false,
          errors: data.errors.map((e: any) => e.message),
        };
      }

      const result = data.data.subscriptionContractActivate;
      
      if (result.userErrors?.length > 0) {
        return {
          success: false,
          errors: result.userErrors.map((e: any) => e.message),
        };
      }

      // Update database
      await db.subscription.update({
        where: {
          shopifyContractId: contractId,
          shop: this.shop,
        },
        data: {
          status: 'ACTIVE',
          pausedAt: null,
          resumedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { success: true, errors: [] };
    } catch (error) {
      console.error('[SubscriptionContract] Failed to resume subscription:', error);
      return {
        success: false,
        errors: ['Failed to resume subscription'],
      };
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    contractId: string,
    reason?: string,
    immediate: boolean = false
  ): Promise<{ success: boolean; errors: string[] }> {
    try {
      const response = await this.admin.graphql(CANCEL_SUBSCRIPTION, {
        variables: { subscriptionContractId: contractId },
      });

      const data = await response.json();

      if (data.errors) {
        return {
          success: false,
          errors: data.errors.map((e: any) => e.message),
        };
      }

      const result = data.data.subscriptionContractCancel;
      
      if (result.userErrors?.length > 0) {
        return {
          success: false,
          errors: result.userErrors.map((e: any) => e.message),
        };
      }

      // Update database
      await db.subscription.update({
        where: {
          shopifyContractId: contractId,
          shop: this.shop,
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        },
      });

      return { success: true, errors: [] };
    } catch (error) {
      console.error('[SubscriptionContract] Failed to cancel subscription:', error);
      return {
        success: false,
        errors: ['Failed to cancel subscription'],
      };
    }
  }

  /**
   * Calculate next billing date based on plan
   */
  private calculateNextBillingDate(plan: SubscriptionPlan): string {
    const date = new Date();

    // Add trial days if applicable
    if (plan.trialDays && plan.trialDays > 0) {
      date.setDate(date.getDate() + plan.trialDays);
      return date.toISOString();
    }

    // Calculate based on interval
    switch (plan.interval) {
      case 'DAY':
        date.setDate(date.getDate() + plan.intervalCount);
        break;
      case 'WEEK':
        date.setDate(date.getDate() + (plan.intervalCount * 7));
        break;
      case 'MONTH':
        date.setMonth(date.getMonth() + plan.intervalCount);
        break;
      case 'YEAR':
        date.setFullYear(date.getFullYear() + plan.intervalCount);
        break;
    }

    return date.toISOString();
  }

  /**
   * Store subscription contract in database
   */
  private async storeSubscriptionContract(
    contract: SubscriptionContract,
    plan: SubscriptionPlan
  ): Promise<void> {
    try {
      // Get customer from database
      const customer = await db.customer.findFirst({
        where: {
          shop: this.shop,
          shopifyCustomerId: contract.customerId,
        },
      });

      if (!customer) {
        console.error('[SubscriptionContract] Customer not found in database');
        return;
      }

      // Create subscription record
      await db.subscription.create({
        data: {
          id: crypto.randomUUID(),
          shop: this.shop,
          customerId: customer.id,
          shopifyContractId: contract.id,
          planName: plan.name,
          status: contract.status,
          amount: roundToCurrencyPrecision(contract.amount, contract.currency),
          currency: contract.currency,
          billingInterval: plan.interval,
          billingIntervalCount: plan.intervalCount,
          nextBillingDate: contract.nextBillingDate,
          trialDays: plan.trialDays || 0,
          features: plan.features,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update customer subscription status
      await db.customer.update({
        where: { id: customer.id },
        data: {
          hasActiveSubscription: true,
          subscriptionTier: plan.name,
          updatedAt: new Date(),
        },
      });

      console.log(`[SubscriptionContract] Stored subscription for customer ${customer.email}`);
    } catch (error) {
      console.error('[SubscriptionContract] Failed to store in database:', error);
      // Non-critical error, contract is already created in Shopify
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a subscription for a customer
 */
export async function createCustomerSubscription(
  admin: AdminApiContext,
  shop: string,
  customerId: string,
  plan: SubscriptionPlan,
  paymentMethodId?: string
): Promise<CreateSubscriptionResult> {
  const service = new SubscriptionContractService(admin, shop);
  return service.createSubscription(customerId, plan, paymentMethodId);
}

/**
 * Pause a subscription
 */
export async function pauseCustomerSubscription(
  admin: AdminApiContext,
  shop: string,
  contractId: string
): Promise<{ success: boolean; errors: string[] }> {
  const service = new SubscriptionContractService(admin, shop);
  return service.pauseSubscription(contractId);
}

/**
 * Resume a subscription
 */
export async function resumeCustomerSubscription(
  admin: AdminApiContext,
  shop: string,
  contractId: string
): Promise<{ success: boolean; errors: string[] }> {
  const service = new SubscriptionContractService(admin, shop);
  return service.resumeSubscription(contractId);
}

/**
 * Cancel a subscription
 */
export async function cancelCustomerSubscription(
  admin: AdminApiContext,
  shop: string,
  contractId: string,
  reason?: string
): Promise<{ success: boolean; errors: string[] }> {
  const service = new SubscriptionContractService(admin, shop);
  return service.cancelSubscription(contractId, reason);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  SubscriptionContractService,
  createCustomerSubscription,
  pauseCustomerSubscription,
  resumeCustomerSubscription,
  cancelCustomerSubscription,
};