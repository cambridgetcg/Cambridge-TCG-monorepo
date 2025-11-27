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

// Create a refund on the order using store-credit gateway
// This marks the order as refunded in Shopify and uses the special "store-credit" gateway
// which doesn't require a parent transaction ID
const CREATE_STORE_CREDIT_REFUND_MUTATION = `#graphql
  mutation CreateStoreCreditRefund($input: RefundInput!) {
    refundCreate(input: $input) {
      refund {
        id
        totalRefundedSet {
          presentmentMoney {
            amount
            currencyCode
          }
        }
      }
      order {
        id
        name
        displayFinancialStatus
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
   * Refund an order to store credit
   *
   * This method performs TWO operations:
   * 1. Creates an official Shopify refund on the order (marks order as refunded)
   *    - Uses the "store-credit" gateway which doesn't require a parent transaction
   * 2. Issues store credit to the customer's account
   *    - Uses storeCreditAccountCredit mutation
   *
   * The order will show as "Refunded" or "Partially Refunded" in Shopify admin.
   */
  async refundToStoreCredit(
    orderId: string,
    amount: number,
    currency: string = 'USD',
    note?: string
  ): Promise<RefundToStoreCreditResult> {
    const formattedAmount = formatForShopify(amount);

    console.log(`[StoreCreditService] Creating refund to store credit for order ${orderId}`);
    console.log(`[StoreCreditService]    Amount: ${formattedAmount} ${currency}`);

    try {
      // Ensure orderId is in GID format
      const orderGid = orderId.startsWith('gid://')
        ? orderId
        : `gid://shopify/Order/${orderId}`;

      // Step 1: Get order details and customer ID
      const orderQuery = `#graphql
        query GetOrderCustomer($orderId: ID!) {
          order(id: $orderId) {
            id
            name
            displayFinancialStatus
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
        console.error("[StoreCreditService] Failed to get order:", orderData.errors);
        return {
          success: false,
          error: 'Failed to get order details'
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

      // Step 2: Create the refund on the order using "store-credit" gateway
      // This marks the order as refunded in Shopify
      const refundNote = note || `Refund to store credit via RewardsPro`;

      const refundResponse = await this.admin.graphql(CREATE_STORE_CREDIT_REFUND_MUTATION, {
        variables: {
          input: {
            orderId: orderGid,
            note: refundNote,
            notify: false, // Don't send refund notification email
            transactions: [
              {
                amount: formattedAmount,
                gateway: "store-credit", // Special gateway that doesn't need parent_id
                kind: "REFUND",
                orderId: orderGid
              }
            ]
          }
        }
      });

      const refundResult = await refundResponse.json();

      // Check for GraphQL errors
      if (refundResult.errors) {
        console.error("[StoreCreditService] Refund GraphQL errors:", refundResult.errors);
        return {
          success: false,
          error: refundResult.errors[0]?.message || 'Failed to create refund'
        };
      }

      // Check for user errors
      const refundUserErrors = refundResult.data?.refundCreate?.userErrors;
      if (refundUserErrors && refundUserErrors.length > 0) {
        const errorMessages = refundUserErrors.map((e: any) => e.message).join(', ');
        console.error("[StoreCreditService] Refund user errors:", refundUserErrors);
        return {
          success: false,
          error: errorMessages
        };
      }

      const refund = refundResult.data?.refundCreate?.refund;
      const updatedOrder = refundResult.data?.refundCreate?.order;

      if (!refund) {
        return {
          success: false,
          error: 'No refund returned from Shopify'
        };
      }

      console.log(`[StoreCreditService] ✅ Refund created on order`);
      console.log(`[StoreCreditService]    Refund ID: ${refund.id}`);
      console.log(`[StoreCreditService]    Order status: ${updatedOrder?.displayFinancialStatus}`);

      // Step 3: Issue store credit to the customer's account
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

      // Check for store credit errors
      if (creditResult.errors) {
        console.error("[StoreCreditService] Store credit error:", creditResult.errors);
        // Refund was created but store credit failed - this is a partial success
        return {
          success: true, // Refund was created
          refundId: refund.id,
          orderName: orderName,
          refundedAmount: parseFloat(formattedAmount),
          currency: currency,
          error: `Refund created but failed to issue store credit: ${creditResult.errors[0]?.message}`
        };
      }

      const creditUserErrors = creditResult.data?.storeCreditAccountCredit?.userErrors;
      if (creditUserErrors && creditUserErrors.length > 0) {
        const errorMessages = creditUserErrors.map((e: any) => e.message).join(', ');
        console.error("[StoreCreditService] Store credit user errors:", creditUserErrors);
        return {
          success: true, // Refund was created
          refundId: refund.id,
          orderName: orderName,
          refundedAmount: parseFloat(formattedAmount),
          currency: currency,
          error: `Refund created but failed to issue store credit: ${errorMessages}`
        };
      }

      const transaction = creditResult.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;

      console.log(`[StoreCreditService] ✅ Store credit issued to customer`);
      if (transaction) {
        console.log(`[StoreCreditService]    Credit Transaction ID: ${transaction.id}`);
        console.log(`[StoreCreditService]    New Balance: ${transaction.balanceAfterTransaction?.amount} ${currency}`);
      }

      return {
        success: true,
        refundId: refund.id,
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