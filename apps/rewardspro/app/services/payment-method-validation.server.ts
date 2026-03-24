/**
 * Payment Method Validation Service
 *
 * Validates customer payment methods for subscription contracts.
 * Checks for valid card, expiry dates, and subscription readiness.
 * Handles both tokenized and vaulted payment methods.
 */

import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import prisma from '~/db.server';

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentMethod {
  id: string;
  instrumentType: 'CREDIT_CARD' | 'SHOP_PAY' | 'PAYPAL' | 'APPLE_PAY';
  lastDigits?: string;
  expiryMonth?: number;
  expiryYear?: number;
  brand?: string;
  isExpired: boolean;
  isRevoked: boolean;
  canBeUsedForSubscriptions: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  paymentMethod?: PaymentMethod;
  errors: string[];
  warnings: string[];
  requiresUpdate: boolean;
}

export interface CustomerPaymentMethods {
  customerId: string;
  email: string;
  defaultPaymentMethod?: PaymentMethod;
  availableMethods: PaymentMethod[];
  hasValidSubscriptionMethod: boolean;
  canCreateSubscription: boolean;
}

// ============================================================================
// GRAPHQL QUERIES
// ============================================================================

const CUSTOMER_PAYMENT_METHODS_QUERY = `#graphql
  query GetCustomerPaymentMethods($customerId: ID!) {
    customer(id: $customerId) {
      id
      email
      displayName
      
      paymentMethods(first: 10) {
        nodes {
          id
          instrument {
            __typename
            ... on CustomerCreditCard {
              brand
              expiryMonth
              expiryYear
              firstDigits
              lastDigits
              isExpired
              maskedNumber
            }
            ... on CustomerShopPayAgreement {
              expiryMonth
              expiryYear
              isExpired
              isRevoked
              lastDigits
              maskedNumber
            }
            ... on CustomerPaypalBillingAgreement {
              billingAddress {
                country
              }
              isRevoked
              paypalAccountEmail
            }
            ... on ApplePayCreditCard {
              brand
              expiryMonth
              expiryYear
              lastDigits
            }
          }
          
          # Check if can be used for subscriptions
          subscriptionContracts(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
      
      # Default payment method from last order
      orders(first: 1, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          node {
            id
            paymentGatewayNames
          }
        }
      }
    }
  }
`;

const VALIDATE_PAYMENT_METHOD_QUERY = `#graphql
  query ValidatePaymentMethod($paymentMethodId: ID!) {
    node(id: $paymentMethodId) {
      __typename
      ... on CustomerPaymentMethod {
        id
        instrument {
          __typename
          ... on CustomerCreditCard {
            brand
            expiryMonth
            expiryYear
            lastDigits
            isExpired
          }
          ... on CustomerShopPayAgreement {
            expiryMonth
            expiryYear
            isExpired
            isRevoked
          }
        }
        customer {
          id
          email
        }
      }
    }
  }
`;

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class PaymentMethodValidationService {
  private admin: AdminApiContext;
  private shop: string;

  constructor(admin: AdminApiContext, shop: string) {
    this.admin = admin;
    this.shop = shop;
  }

  /**
   * Get all payment methods for a customer
   */
  async getCustomerPaymentMethods(customerId: string): Promise<CustomerPaymentMethods> {
    try {
      const response = await this.admin.graphql(CUSTOMER_PAYMENT_METHODS_QUERY, {
        variables: { customerId },
      });

      const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

      if (data.errors) {
        console.error('[PaymentValidation] GraphQL errors:', data.errors);
        throw new Error('Failed to fetch payment methods');
      }

      const customer = data.data.customer;
      if (!customer) {
        throw new Error('Customer not found');
      }

      const paymentMethods = this.parsePaymentMethods(customer.paymentMethods?.nodes || []);
      const validMethods = paymentMethods.filter(m => m.canBeUsedForSubscriptions && !m.isExpired && !m.isRevoked);

      return {
        customerId: customer.id,
        email: customer.email,
        defaultPaymentMethod: validMethods[0],
        availableMethods: paymentMethods,
        hasValidSubscriptionMethod: validMethods.length > 0,
        canCreateSubscription: validMethods.length > 0,
      };
    } catch (error) {
      console.error('[PaymentValidation] Failed to get payment methods:', error);
      throw error;
    }
  }

  /**
   * Validate a specific payment method
   */
  async validatePaymentMethod(paymentMethodId: string): Promise<ValidationResult> {
    try {
      const response = await this.admin.graphql(VALIDATE_PAYMENT_METHOD_QUERY, {
        variables: { paymentMethodId },
      });

      const data = await response.json() as { data: any; errors?: Array<{ message: string }> };

      if (data.errors) {
        return {
          isValid: false,
          errors: data.errors.map((e: any) => e.message),
          warnings: [],
          requiresUpdate: true,
        };
      }

      const node = data.data.node;
      if (!node || node.__typename !== 'CustomerPaymentMethod') {
        return {
          isValid: false,
          errors: ['Payment method not found or invalid'],
          warnings: [],
          requiresUpdate: true,
        };
      }

      const paymentMethod = this.parsePaymentMethod(node);
      const validation = this.validatePaymentMethodDetails(paymentMethod!);

      return {
        isValid: validation.isValid,
        paymentMethod: paymentMethod ?? undefined,
        errors: validation.errors,
        warnings: validation.warnings,
        requiresUpdate: validation.requiresUpdate,
      };
    } catch (error) {
      console.error('[PaymentValidation] Validation failed:', error);
      return {
        isValid: false,
        errors: ['Failed to validate payment method'],
        warnings: [],
        requiresUpdate: true,
      };
    }
  }

  /**
   * Check if customer has any valid payment method for subscriptions
   */
  async canCreateSubscription(customerId: string): Promise<boolean> {
    try {
      const methods = await this.getCustomerPaymentMethods(customerId);
      return methods.canCreateSubscription;
    } catch (error) {
      console.error('[PaymentValidation] Subscription check failed:', error);
      return false;
    }
  }

  /**
   * Get subscription-ready payment method for a customer
   */
  async getSubscriptionPaymentMethod(customerId: string): Promise<PaymentMethod | null> {
    try {
      const methods = await this.getCustomerPaymentMethods(customerId);
      
      if (!methods.hasValidSubscriptionMethod) {
        return null;
      }

      // Prefer non-expired credit cards
      const creditCards = methods.availableMethods.filter(
        m => m.instrumentType === 'CREDIT_CARD' && !m.isExpired && m.canBeUsedForSubscriptions
      );

      if (creditCards.length > 0) {
        // Sort by expiry date (furthest first)
        return creditCards.sort((a, b) => {
          const aExpiry = (a.expiryYear || 0) * 12 + (a.expiryMonth || 0);
          const bExpiry = (b.expiryYear || 0) * 12 + (b.expiryMonth || 0);
          return bExpiry - aExpiry;
        })[0];
      }

      // Fall back to Shop Pay or other methods
      return methods.defaultPaymentMethod || null;
    } catch (error) {
      console.error('[PaymentValidation] Failed to get subscription payment method:', error);
      return null;
    }
  }

  /**
   * Parse payment methods from GraphQL response
   */
  private parsePaymentMethods(nodes: any[]): PaymentMethod[] {
    return nodes.map(node => this.parsePaymentMethod(node)).filter(Boolean) as PaymentMethod[];
  }

  /**
   * Parse a single payment method
   */
  private parsePaymentMethod(node: any): PaymentMethod | null {
    if (!node || !node.instrument) {
      return null;
    }

    const instrument = node.instrument;
    const hasActiveSubscriptions = node.subscriptionContracts?.edges?.length > 0;

    let type: PaymentMethod['instrumentType'];
    let lastDigits: string | undefined;
    let expiryMonth: number | undefined;
    let expiryYear: number | undefined;
    let brand: string | undefined;
    let isExpired = false;
    let isRevoked = false;

    switch (instrument.__typename) {
      case 'CustomerCreditCard':
        type = 'CREDIT_CARD';
        lastDigits = instrument.lastDigits;
        expiryMonth = instrument.expiryMonth;
        expiryYear = instrument.expiryYear;
        brand = instrument.brand;
        isExpired = instrument.isExpired || false;
        break;

      case 'CustomerShopPayAgreement':
        type = 'SHOP_PAY';
        lastDigits = instrument.lastDigits;
        expiryMonth = instrument.expiryMonth;
        expiryYear = instrument.expiryYear;
        isExpired = instrument.isExpired || false;
        isRevoked = instrument.isRevoked || false;
        break;

      case 'CustomerPaypalBillingAgreement':
        type = 'PAYPAL';
        isRevoked = instrument.isRevoked || false;
        break;

      case 'ApplePayCreditCard':
        type = 'APPLE_PAY';
        lastDigits = instrument.lastDigits;
        expiryMonth = instrument.expiryMonth;
        expiryYear = instrument.expiryYear;
        brand = instrument.brand;
        break;

      default:
        return null;
    }

    return {
      id: node.id,
      instrumentType: type,
      lastDigits,
      expiryMonth,
      expiryYear,
      brand,
      isExpired,
      isRevoked,
      canBeUsedForSubscriptions: !isExpired && !isRevoked && (hasActiveSubscriptions || type === 'CREDIT_CARD' || type === 'SHOP_PAY'),
    };
  }

  /**
   * Validate payment method details
   */
  private validatePaymentMethodDetails(method: PaymentMethod): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    requiresUpdate: boolean;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let requiresUpdate = false;

    // Check if expired
    if (method.isExpired) {
      errors.push('Payment method has expired');
      requiresUpdate = true;
    }

    // Check if revoked
    if (method.isRevoked) {
      errors.push('Payment method has been revoked');
      requiresUpdate = true;
    }

    // Check expiry date for credit cards
    if ((method.instrumentType === 'CREDIT_CARD' || method.instrumentType === 'SHOP_PAY') && 
        method.expiryMonth && method.expiryYear) {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // Check if expires soon (within 2 months)
      const monthsUntilExpiry = (method.expiryYear - currentYear) * 12 + (method.expiryMonth - currentMonth);
      
      if (monthsUntilExpiry < 0) {
        errors.push('Card has expired');
        requiresUpdate = true;
      } else if (monthsUntilExpiry <= 2) {
        warnings.push(`Card expires in ${monthsUntilExpiry} month(s)`);
      }
    }

    // Check if can be used for subscriptions
    if (!method.canBeUsedForSubscriptions) {
      errors.push('Payment method cannot be used for subscriptions');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      requiresUpdate,
    };
  }

  /**
   * Store validation result in database for tracking
   */
  async storeValidationResult(
    customerId: string,
    paymentMethodId: string,
    result: ValidationResult
  ): Promise<void> {
    try {
      // Store in PaymentMethodValidation model (to be created)
      await (db as any).$executeRawUnsafe(`
        INSERT INTO "PaymentMethodValidation" (
          id, shop, "customerId", "paymentMethodId", "isValid", 
          errors, warnings, "validatedAt", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("customerId", "paymentMethodId") 
        DO UPDATE SET 
          "isValid" = $5,
          errors = $6,
          warnings = $7,
          "validatedAt" = $8,
          "updatedAt" = $10
      `,
        crypto.randomUUID(),
        this.shop,
        customerId,
        paymentMethodId,
        result.isValid,
        JSON.stringify(result.errors),
        JSON.stringify(result.warnings),
        new Date(),
        new Date(),
        new Date()
      );

      console.log(`[PaymentValidation] Stored validation for ${customerId}:`, {
        paymentMethodId,
        isValid: result.isValid,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });
    } catch (error) {
      console.error('[PaymentValidation] Failed to store validation:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Check for expiring payment methods and send notifications
   */
  async checkExpiringMethods(daysBefore: number = 30): Promise<{
    expiringMethods: Array<{
      customerId: string;
      email: string;
      paymentMethod: PaymentMethod;
      daysUntilExpiry: number;
    }>;
  }> {
    try {
      // This would typically be called by a cron job
      // Query all customers with active subscriptions
      const customers = await prisma.customer.findMany({
        where: {
          shop: this.shop,
          hasActiveSubscription: true,
        },
        select: {
          id: true,
          shopifyCustomerId: true,
          email: true,
        },
      });

      const expiringMethods: any[] = [];

      for (const customer of customers) {
        if (!customer.shopifyCustomerId) continue;

        const methods = await this.getCustomerPaymentMethods(customer.shopifyCustomerId);
        
        for (const method of methods.availableMethods) {
          if (method.expiryMonth && method.expiryYear) {
            const now = new Date();
            const expiryDate = new Date(method.expiryYear, method.expiryMonth - 1);
            const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry > 0 && daysUntilExpiry <= daysBefore) {
              expiringMethods.push({
                customerId: customer.shopifyCustomerId,
                email: customer.email,
                paymentMethod: method,
                daysUntilExpiry,
              });
            }
          }
        }
      }

      return { expiringMethods };
    } catch (error) {
      console.error('[PaymentValidation] Failed to check expiring methods:', error);
      return { expiringMethods: [] };
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate payment method for subscription
 */
export async function validatePaymentMethodForSubscription(
  admin: AdminApiContext,
  shop: string,
  paymentMethodId: string
): Promise<ValidationResult> {
  const service = new PaymentMethodValidationService(admin, shop);
  return service.validatePaymentMethod(paymentMethodId);
}

/**
 * Get customer's subscription-ready payment method
 */
export async function getSubscriptionPaymentMethod(
  admin: AdminApiContext,
  shop: string,
  customerId: string
): Promise<PaymentMethod | null> {
  const service = new PaymentMethodValidationService(admin, shop);
  return service.getSubscriptionPaymentMethod(customerId);
}

/**
 * Check if customer can create subscription
 */
export async function canCustomerCreateSubscription(
  admin: AdminApiContext,
  shop: string,
  customerId: string
): Promise<boolean> {
  const service = new PaymentMethodValidationService(admin, shop);
  return service.canCreateSubscription(customerId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PaymentMethodValidationService,
  validatePaymentMethodForSubscription,
  getSubscriptionPaymentMethod,
  canCustomerCreateSubscription,
};