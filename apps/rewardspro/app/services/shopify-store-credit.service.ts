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