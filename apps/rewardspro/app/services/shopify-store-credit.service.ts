/**
 * Shopify Store Credit Service
 *
 * Manages store credit operations via Shopify GraphQL API
 * Issues credit, queries balances, and handles sync operations
 */

import { formatForShopify, roundDownToHundredths } from '../utils/transaction-analyzer';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface StoreCreditResult {
  success: boolean;
  transactionId?: string;
  balance?: number;
  error?: string;
}

export interface StoreCreditAccount {
  id: string;
  balance: {
    amount: string;
    currencyCode: string;
  };
}

export interface RefundToStoreCreditResult {
  success: boolean;
  refundId?: string;
  orderName?: string;
  refundedAmount?: number;
  currency?: string;
  error?: string;
}

export interface OrderForRefund {
  id: string;
  name: string;
  displayFinancialStatus: string;
  totalPrice: number;
  totalRefunded: number;
  currency: string;
  refundableAmount: number;
  lineItems: Array<{
    id: string;
    name: string;
    quantity: number;
    refundableQuantity: number;
    unitPrice: number;
  }>;
}

// ============================================================================
// GRAPHQL MUTATIONS & QUERIES
// ============================================================================

const ISSUE_STORE_CREDIT_MUTATION = `#graphql
  mutation IssueStoreCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
    storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
      storeCreditAccountTransaction {
        id
        amount {
          amount
          currencyCode
        }
        balanceAfterTransaction {
          amount
          currencyCode
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

const QUERY_STORE_CREDIT_BALANCE = `#graphql
  query GetCustomerStoreCredit($customerId: ID!) {
    customer(id: $customerId) {
      id
      email
      displayName
      storeCreditAccounts(first: 10) {
        edges {
          node {
            id
            balance {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const DEBIT_STORE_CREDIT_MUTATION = `#graphql
  mutation DebitStoreCredit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
    storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
      storeCreditAccountTransaction {
        id
        amount {
          amount
          currencyCode
        }
        balanceAfterTransaction {
          amount
          currencyCode
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

// Note: Shopify does NOT support refundCreate with refundMethods.storeCreditRefund
// The refundMethods field doesn't exist in RefundInput
// Instead, we use storeCreditAccountCredit to add credit to customer's account
// and optionally add a timeline comment to the order for tracking

const ADD_ORDER_TIMELINE_COMMENT = `#graphql
  mutation AddOrderTimelineComment($orderId: ID!, $message: String!) {
    orderUpdate(input: { id: $orderId, note: $message }) {
      order {
        id
        name
        note
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const QUERY_ORDER_FOR_REFUND = `#graphql
  query GetOrderForRefund($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      displayFinancialStatus
      totalPriceSet {
        presentmentMoney {
          amount
          currencyCode
        }
      }
      totalRefundedSet {
        presentmentMoney {
          amount
          currencyCode
        }
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            name
            quantity
            refundableQuantity
            originalUnitPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      customer {
        id
      }
    }
  }
`;

// ============================================================================
// SHOPIFY STORE CREDIT SERVICE CLASS
// ============================================================================

export class ShopifyStoreCreditService {
  private admin: any;
  private shop: string;

  constructor(admin: any, shop: string) {
    this.admin = admin;
    this.shop = shop;
  }

  /**
   * Issue store credit to a customer
   */
  async issueStoreCredit(
    customerId: string,
    amount: number,
    currency: string = 'USD',
    description?: string
  ): Promise<StoreCreditResult> {
    const formattedAmount = formatForShopify(amount);

    console.log(`[StoreCreditService] Issuing ${formattedAmount} ${currency} to customer ${customerId}`);

    try {
      const response = await this.admin.graphql(ISSUE_STORE_CREDIT_MUTATION, {
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
          creditInput: {
            creditAmount: {
              amount: formattedAmount,
              currencyCode: currency
            }
          }
        }
      });

      const result = await response.json();

      // Check for GraphQL errors
      if (result.errors) {
        console.error("[StoreCreditService] GraphQL errors:", result.errors);
        return {
          success: false,
          error: result.errors[0]?.message || 'GraphQL error'
        };
      }

      // Check for user errors
      const userErrors = result.data?.storeCreditAccountCredit?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => e.message).join(', ');
        console.error("[StoreCreditService] User errors:", userErrors);
        return {
          success: false,
          error: errorMessages
        };
      }

      // Check for successful transaction
      const transaction = result.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
      if (transaction) {
        const newBalance = parseFloat(transaction.balanceAfterTransaction.amount);
        console.log(`[StoreCreditService] ✅ Credit issued successfully`);
        console.log(`[StoreCreditService]    Transaction ID: ${transaction.id}`);
        console.log(`[StoreCreditService]    New balance: ${newBalance} ${currency}`);

        return {
          success: true,
          transactionId: transaction.id,
          balance: newBalance
        };
      }

      return {
        success: false,
        error: "No transaction returned from Shopify"
      };

    } catch (error) {
      console.error("[StoreCreditService] API error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Query customer's store credit balance
   */
  async getStoreCreditBalance(customerId: string): Promise<{
    success: boolean;
    balance?: number;
    currency?: string;
    accounts?: StoreCreditAccount[];
    error?: string;
  }> {
    try {
      const response = await this.admin.graphql(QUERY_STORE_CREDIT_BALANCE, {
        variables: {
          customerId: `gid://shopify/Customer/${customerId}`
        }
      });

      const result = await response.json();

      if (result.errors) {
        console.error("[StoreCreditService] Failed to query balance:", result.errors);
        return {
          success: false,
          error: result.errors[0]?.message || 'Failed to query balance'
        };
      }

      const customer = result.data?.customer;
      if (!customer) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      // Calculate total from all store credit accounts
      const accounts = customer.storeCreditAccounts?.edges || [];
      let totalBalance = 0;
      let currency = 'USD';

      const processedAccounts: StoreCreditAccount[] = [];

      for (const edge of accounts) {
        const account = edge.node;
        const balance = parseFloat(account.balance.amount || "0");
        currency = account.balance.currencyCode;

        if (!isNaN(balance) && isFinite(balance) && balance >= 0) {
          totalBalance += balance;
          processedAccounts.push(account);
        }
      }

      console.log(`[StoreCreditService] Customer ${customerId} has ${totalBalance} ${currency} in store credit`);

      return {
        success: true,
        balance: roundDownToHundredths(totalBalance),
        currency,
        accounts: processedAccounts
      };

    } catch (error) {
      console.error("[StoreCreditService] Query error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Debit store credit (for adjustments/corrections)
   */
  async debitStoreCredit(
    customerId: string,
    amount: number,
    currency: string = 'USD',
    description?: string
  ): Promise<StoreCreditResult> {
    const formattedAmount = formatForShopify(amount);

    console.log(`[StoreCreditService] Debiting ${formattedAmount} ${currency} from customer ${customerId}`);

    try {
      const response = await this.admin.graphql(DEBIT_STORE_CREDIT_MUTATION, {
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
          debitInput: {
            debitAmount: {
              amount: formattedAmount,
              currencyCode: currency
            }
          }
        }
      });

      const result = await response.json();

      // Handle errors same as credit
      if (result.errors) {
        return {
          success: false,
          error: result.errors[0]?.message || 'GraphQL error'
        };
      }

      const userErrors = result.data?.storeCreditAccountDebit?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => e.message).join(', ');
        return {
          success: false,
          error: errorMessages
        };
      }

      const transaction = result.data?.storeCreditAccountDebit?.storeCreditAccountTransaction;
      if (transaction) {
        const newBalance = parseFloat(transaction.balanceAfterTransaction.amount);
        console.log(`[StoreCreditService] ✅ Debit successful, new balance: ${newBalance} ${currency}`);

        return {
          success: true,
          transactionId: transaction.id,
          balance: newBalance
        };
      }

      return {
        success: false,
        error: "No transaction returned"
      };

    } catch (error) {
      console.error("[StoreCreditService] Debit error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Sync local balance with Shopify
   */
  async syncBalance(customerId: string, localBalance: number): Promise<{
    success: boolean;
    shopifyBalance?: number;
    difference?: number;
    needsSync: boolean;
    error?: string;
  }> {
    const result = await this.getStoreCreditBalance(customerId);

    if (!result.success) {
      return {
        success: false,
        needsSync: false,
        error: result.error
      };
    }

    const shopifyBalance = result.balance || 0;
    const difference = Math.abs(shopifyBalance - localBalance);

    // Consider balances synced if difference is less than 1 cent
    const needsSync = difference > 0.01;

    console.log(`[StoreCreditService] Balance sync check:`);
    console.log(`[StoreCreditService]    Shopify: ${shopifyBalance}`);
    console.log(`[StoreCreditService]    Local: ${localBalance}`);
    console.log(`[StoreCreditService]    Difference: ${difference}`);
    console.log(`[StoreCreditService]    Needs sync: ${needsSync}`);

    return {
      success: true,
      shopifyBalance,
      difference,
      needsSync
    };
  }

  /**
   * Get order details for refund
   */
  async getOrderForRefund(orderId: string): Promise<{
    success: boolean;
    order?: OrderForRefund;
    error?: string;
  }> {
    try {
      // Ensure orderId is in GID format
      const orderGid = orderId.startsWith('gid://')
        ? orderId
        : `gid://shopify/Order/${orderId}`;

      const response = await this.admin.graphql(QUERY_ORDER_FOR_REFUND, {
        variables: {
          orderId: orderGid
        }
      });

      const result = await response.json();

      if (result.errors) {
        console.error("[StoreCreditService] Failed to query order:", result.errors);
        return {
          success: false,
          error: result.errors[0]?.message || 'Failed to query order'
        };
      }

      const order = result.data?.order;
      if (!order) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      const totalPrice = parseFloat(order.totalPriceSet?.presentmentMoney?.amount || "0");
      const totalRefunded = parseFloat(order.totalRefundedSet?.presentmentMoney?.amount || "0");
      const currency = order.totalPriceSet?.presentmentMoney?.currencyCode || "USD";

      const lineItems = (order.lineItems?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        quantity: edge.node.quantity,
        refundableQuantity: edge.node.refundableQuantity,
        unitPrice: parseFloat(edge.node.originalUnitPriceSet?.presentmentMoney?.amount || "0")
      }));

      return {
        success: true,
        order: {
          id: order.id,
          name: order.name,
          displayFinancialStatus: order.displayFinancialStatus,
          totalPrice,
          totalRefunded,
          currency,
          refundableAmount: Math.max(0, totalPrice - totalRefunded),
          lineItems
        }
      };

    } catch (error) {
      console.error("[StoreCreditService] Query order error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Issue store credit to a customer as a "refund" for an order
   *
   * IMPORTANT: Shopify does NOT support refundCreate with store credit refund methods.
   * The `refundMethods.storeCreditRefund` field does not exist in the API.
   *
   * This method:
   * 1. Gets the order details and customer ID
   * 2. Issues store credit to the customer using storeCreditAccountCredit
   * 3. Adds a note to the order for tracking
   *
   * Note: This does NOT create an official Shopify refund on the order.
   * It simply adds store credit to the customer's account.
   */
  async refundToStoreCredit(
    orderId: string,
    amount: number,
    currency: string = 'USD',
    note?: string
  ): Promise<RefundToStoreCreditResult> {
    const formattedAmount = formatForShopify(amount);

    console.log(`[StoreCreditService] Issuing store credit for order ${orderId}`);
    console.log(`[StoreCreditService]    Amount: ${formattedAmount} ${currency}`);

    try {
      // Step 1: Get order details including customer ID
      const orderResult = await this.getOrderForRefund(orderId);

      if (!orderResult.success || !orderResult.order) {
        return {
          success: false,
          error: orderResult.error || 'Failed to get order details'
        };
      }

      const order = orderResult.order;

      // We need to get the customer ID from the order
      const orderGid = orderId.startsWith('gid://')
        ? orderId
        : `gid://shopify/Order/${orderId}`;

      // Query order to get customer ID
      const orderQuery = `#graphql
        query GetOrderCustomer($orderId: ID!) {
          order(id: $orderId) {
            id
            name
            customer {
              id
            }
          }
        }
      `;

      const orderResponse = await this.admin.graphql(orderQuery, {
        variables: { orderId: orderGid }
      });
      const orderData = await orderResponse.json();

      if (orderData.errors) {
        console.error("[StoreCreditService] Failed to get order customer:", orderData.errors);
        return {
          success: false,
          error: 'Failed to get customer from order'
        };
      }

      const customerId = orderData.data?.order?.customer?.id;
      const orderName = orderData.data?.order?.name;

      if (!customerId) {
        return {
          success: false,
          error: 'Order does not have an associated customer'
        };
      }

      console.log(`[StoreCreditService] Found customer ${customerId} for order ${orderName}`);

      // Step 2: Issue store credit to the customer
      const creditResponse = await this.admin.graphql(ISSUE_STORE_CREDIT_MUTATION, {
        variables: {
          id: customerId,
          creditInput: {
            creditAmount: {
              amount: formattedAmount,
              currencyCode: currency
            }
          }
        }
      });

      const creditResult = await creditResponse.json();

      // Check for errors
      if (creditResult.errors) {
        console.error("[StoreCreditService] Store credit error:", creditResult.errors);
        return {
          success: false,
          error: creditResult.errors[0]?.message || 'Failed to issue store credit'
        };
      }

      const userErrors = creditResult.data?.storeCreditAccountCredit?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const errorMessages = userErrors.map((e: any) => e.message).join(', ');
        console.error("[StoreCreditService] User errors:", userErrors);
        return {
          success: false,
          error: errorMessages
        };
      }

      const transaction = creditResult.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
      if (!transaction) {
        return {
          success: false,
          error: 'No transaction returned from store credit operation'
        };
      }

      console.log(`[StoreCreditService] ✅ Store credit issued successfully`);
      console.log(`[StoreCreditService]    Transaction ID: ${transaction.id}`);
      console.log(`[StoreCreditService]    Amount: ${formattedAmount} ${currency}`);
      console.log(`[StoreCreditService]    Order: ${orderName}`);

      // Step 3: Try to add a note to the order (optional - don't fail if this errors)
      try {
        const noteMessage = note
          ? `${note}\n\nStore credit issued: ${formattedAmount} ${currency} via RewardsPro`
          : `Store credit issued: ${formattedAmount} ${currency} via RewardsPro`;

        await this.admin.graphql(ADD_ORDER_TIMELINE_COMMENT, {
          variables: {
            orderId: orderGid,
            message: noteMessage
          }
        });
        console.log(`[StoreCreditService] Order note added`);
      } catch (noteError) {
        // Don't fail the whole operation if note fails
        console.warn("[StoreCreditService] Failed to add order note:", noteError);
      }

      return {
        success: true,
        refundId: transaction.id,
        orderName: orderName,
        refundedAmount: parseFloat(formattedAmount),
        currency: currency
      };

    } catch (error) {
      console.error("[StoreCreditService] Refund to store credit error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ShopifyStoreCreditService instance
 */
export function createStoreCreditService(admin: any, shop: string): ShopifyStoreCreditService {
  return new ShopifyStoreCreditService(admin, shop);
}