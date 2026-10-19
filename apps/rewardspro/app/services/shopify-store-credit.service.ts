/**
 * Shopify Store Credit Service
 *
 * Manages store credit operations via Shopify GraphQL API
 * Issues credit, queries balances, and handles sync operations
 */

import { GraphqlQueryError, HttpResponseError, MissingRequiredArgument } from '@shopify/shopify-api';
import { Prisma } from '@prisma/client';
import { formatForShopify, roundDownToHundredths } from '../utils/transaction-analyzer';
import { createLogger } from '~/services/logger.server';

const logger = createLogger('StoreCreditService');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface StoreCreditResult {
  success: boolean;
  transactionId?: string;
  balance?: number;
  error?: string;
  /**
   * Set on every failure: true when the credit or debit may have been
   * applied, so it must not be sent again (no answer, a 5xx, an error
   * Shopify may raise after running the mutation); false only when Shopify
   * said it applied nothing, or nothing was sent.
   */
  ambiguous?: boolean;
}

type StoreCreditMutation = 'storeCreditAccountCredit' | 'storeCreditAccountDebit';

/**
 * Top-level GraphQL error codes with which Shopify turns a request away
 * before running it (Admin API "Status and error codes"): THROTTLED (like a
 * 429), ACCESS_DENIED (like a 401), SHOP_INACTIVE, and MAX_COST_EXCEEDED
 * (the query's cost, checked before it runs). Not INTERNAL_SERVER_ERROR,
 * Shopify's 500 answered as a 200, nor codes this list does not name: the
 * docs say others may appear, and a mutation may have run before them.
 */
const REFUSED_BEFORE_RUNNING: ReadonlySet<string> = new Set(['THROTTLED', 'ACCESS_DENIED', 'SHOP_INACTIVE', 'MAX_COST_EXCEEDED']);

/**
 * The userError codes Shopify documents for each mutation
 * (StoreCreditAccountCreditUserErrorCode, StoreCreditAccountDebitUserErrorCode).
 * Each names a reason no transaction could be made. A userError with any
 * other code, or none, leaves it unknown.
 */
const REFUSED_USER_ERRORS: Record<StoreCreditMutation, ReadonlySet<string>> = {
  storeCreditAccountCredit: new Set([
    'ACCOUNT_NOT_FOUND',
    'CREDIT_LIMIT_EXCEEDED',
    'EXPIRES_AT_IN_PAST',
    'MISMATCHING_CURRENCY',
    'NEGATIVE_OR_ZERO_AMOUNT',
    'OWNER_NOT_FOUND',
    'UNSUPPORTED_CURRENCY',
  ]),
  storeCreditAccountDebit: new Set(['ACCOUNT_NOT_FOUND', 'INSUFFICIENT_FUNDS', 'MISMATCHING_CURRENCY', 'NEGATIVE_OR_ZERO_AMOUNT']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function codeOf(error: unknown): unknown {
  const record = asRecord(error);
  return record?.code ?? asRecord(record?.extensions)?.code;
}

/**
 * Whether a store-credit mutation answered with top-level GraphQL `errors`
 * (and perhaps partial `data`) may still have been applied. Not applied only
 * when every error carries a code in REFUSED_BEFORE_RUNNING, none points
 * inside the mutation's payload, and no payload came back.
 */
function graphqlErrorsMayHaveApplied(errors: unknown, data: unknown, mutation: StoreCreditMutation): boolean {
  // A payload, even one without a transaction, means the mutation ran
  if (asRecord(data)?.[mutation] != null) return true;
  if (!Array.isArray(errors) || errors.length === 0) return true;
  return !errors.every((error) => {
    const code = codeOf(error);
    const path = asRecord(error)?.path;
    return typeof code === 'string' && REFUSED_BEFORE_RUNNING.has(code) && !(Array.isArray(path) && path.length > 1);
  });
}

/**
 * Whether a store-credit mutation that threw after it was sent may still
 * have been applied. Not applied only when Shopify said so:
 * - a 200 with GraphQL errors (`GraphqlQueryError`) that turn the request
 *   away before it runs (graphqlErrorsMayHaveApplied);
 * - a 4xx answer (`HttpResponseError`: refused, throttled, not authorised),
 *   or the Response the admin and webhook contexts rethrow in its place,
 *   with its status: a 4xx, or a redirect to re-authenticate after a 401.
 * Anything else may have: no answer (`HttpRequestError`: the connection
 * failed or dropped, a timeout), a 5xx, or a 200 that could not be read.
 */
function mayHaveBeenApplied(error: unknown, mutation: StoreCreditMutation): boolean {
  if (error instanceof GraphqlQueryError) {
    return graphqlErrorsMayHaveApplied(asRecord(error.body?.errors)?.graphQLErrors, error.body?.data, mutation);
  }
  const refused = (status: number) => status >= 400 && status < 500;
  if (error instanceof HttpResponseError) return !refused(error.response.code);
  if (error instanceof Response) return !(refused(error.status) || (error.status >= 300 && error.status < 400));
  return true;
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
    _description?: string
  ): Promise<StoreCreditResult> {
    return this.sendStoreCreditMutation('storeCreditAccountCredit', customerId, amount, currency);
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
        logger.error('Failed to query balance', { errors: result.errors });
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
      // IMPORTANT: Group balances by currency to avoid mixing different currencies
      const accounts = customer.storeCreditAccounts?.edges || [];
      const balancesByCurrency = new Map<string, number>();
      const processedAccounts: StoreCreditAccount[] = [];

      for (const edge of accounts) {
        const account = edge.node;
        const balance = parseFloat(account.balance.amount || "0");
        const accountCurrency = account.balance.currencyCode;

        if (!isNaN(balance) && isFinite(balance) && balance >= 0) {
          const existing = balancesByCurrency.get(accountCurrency) || 0;
          balancesByCurrency.set(accountCurrency, existing + balance);
          processedAccounts.push(account);
        }
      }

      // Return the primary currency (first one found) or USD default
      // Convert map to array for logging and return most common currency balance
      const currencies = Array.from(balancesByCurrency.entries());
      const primaryCurrency = currencies.length > 0 ? currencies[0][0] : 'USD';
      const primaryBalance = currencies.length > 0 ? currencies[0][1] : 0;

      // Log warning if multiple currencies detected - this could cause issues
      if (currencies.length > 1) {
        logger.warn('Customer has store credit in multiple currencies', {
          customerId,
          currencies: currencies.map(([curr, bal]) => ({ currency: curr, balance: bal }))
        });
      }

      logger.debug('Customer store credit balance', { customerId, totalBalance: primaryBalance, currency: primaryCurrency });

      return {
        success: true,
        balance: roundDownToHundredths(primaryBalance),
        currency: primaryCurrency,
        accounts: processedAccounts
      };

    } catch (error) {
      logger.error('Query error', error);
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
    _description?: string
  ): Promise<StoreCreditResult> {
    return this.sendStoreCreditMutation('storeCreditAccountDebit', customerId, amount, currency);
  }

  /**
   * Send one store-credit credit or debit and read Shopify's answer. Every
   * failure says whether the mutation may have been applied (`ambiguous`),
   * so a writer hands its claimed entry back only when it was not: a
   * failure before the request is sent, or an answer from Shopify that it
   * applied nothing (mayHaveBeenApplied, graphqlErrorsMayHaveApplied and
   * REFUSED_USER_ERRORS).
   */
  private async sendStoreCreditMutation(
    mutation: StoreCreditMutation,
    customerId: string,
    amount: number,
    currency: string
  ): Promise<StoreCreditResult> {
    const failure = (error: string, ambiguous: boolean): StoreCreditResult => ({ success: false, error, ambiguous });
    const credit = mutation === 'storeCreditAccountCredit';

    // Nothing is sent until the request is built: a failure here applied nothing
    let query: string;
    let variables: Record<string, unknown>;
    try {
      if (typeof this.admin?.graphql !== 'function') return failure('No Shopify Admin API client', false);
      const formattedAmount = formatForShopify(amount);
      const cents = new Prisma.Decimal(formattedAmount);
      if (!(cents.isFinite() && cents.gt(0))) return failure(`Invalid store credit amount (${amount})`, false);
      const money = { amount: formattedAmount, currencyCode: currency };
      const id = `gid://shopify/Customer/${customerId}`;
      query = credit ? ISSUE_STORE_CREDIT_MUTATION : DEBIT_STORE_CREDIT_MUTATION;
      variables = credit ? { id, creditInput: { creditAmount: money } } : { id, debitInput: { debitAmount: money } };
      logger.info(credit ? 'Issuing store credit' : 'Debiting store credit', { amount: formattedAmount, currency, customerId });
    } catch (error) {
      logger.error('Store credit request not sent', error);
      return failure(error instanceof Error ? error.message : 'Invalid store credit request', false);
    }

    let result: unknown;
    try {
      const response = await this.admin.graphql(query, { variables });
      result = await response.json();
    } catch (error) {
      logger.error(credit ? 'API error' : 'Debit error', error);
      // The client refused to build the request (no access token): not sent
      const notSent = error instanceof MissingRequiredArgument;
      return failure(error instanceof Error ? error.message : 'Unknown error', !notSent && mayHaveBeenApplied(error, mutation));
    }

    const answer = asRecord(result);
    const payload = asRecord(asRecord(answer?.data)?.[mutation]);

    // GraphQL errors in an answer that did not throw: the same rule
    const errors = answer?.errors;
    if (errors) {
      const graphQLErrors = Array.isArray(errors) ? errors : asRecord(errors)?.graphQLErrors;
      logger.error('GraphQL errors', { errors: graphQLErrors });
      const first = Array.isArray(graphQLErrors) ? asRecord(graphQLErrors[0])?.message : undefined;
      return failure(typeof first === 'string' ? first : 'GraphQL error', graphqlErrorsMayHaveApplied(graphQLErrors, answer?.data, mutation));
    }

    const transaction = asRecord(payload?.storeCreditAccountTransaction);
    const userErrors = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
    if (userErrors.length > 0) {
      logger.error('User errors', { userErrors });
      const messages = userErrors.map((e) => asRecord(e)?.message).filter((m): m is string => typeof m === 'string');
      // Not applied only for a documented reason, and with no transaction
      const refused = transaction === null && userErrors.every((e) => {
        const code = codeOf(e);
        return typeof code === 'string' && REFUSED_USER_ERRORS[mutation].has(code);
      });
      return failure(messages.join(', ') || 'Shopify refused the store credit change', !refused);
    }

    if (transaction) {
      const balanceAfter = asRecord(transaction.balanceAfterTransaction)?.amount;
      const newBalance = typeof balanceAfter === 'string' ? parseFloat(balanceAfter) : undefined;
      const transactionId = typeof transaction.id === 'string' ? transaction.id : undefined;
      logger.info(credit ? 'Credit issued successfully' : 'Debit successful', { transactionId, newBalance, currency });
      return { success: true, transactionId, balance: newBalance };
    }

    // An answer with neither a transaction nor a reason does not say that
    // nothing was applied
    return failure(credit ? 'No transaction returned from Shopify' : 'No transaction returned', true);
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

    logger.debug('Balance sync check', { shopifyBalance, localBalance, difference, needsSync });

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
        logger.error('Failed to query order', { errors: result.errors });
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
      logger.error('Query order error', error);
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

    logger.info('Creating refund to store credit', { orderId, amount: formattedAmount, currency });

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
        logger.error('Failed to get order', { errors: orderData.errors });
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

      logger.debug('Found customer for order', { customerId, orderName });

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
        logger.error('Refund GraphQL errors', { errors: refundResult.errors });
        return {
          success: false,
          error: refundResult.errors[0]?.message || 'Failed to create refund'
        };
      }

      // Check for user errors
      const refundUserErrors = refundResult.data?.refundCreate?.userErrors;
      if (refundUserErrors && refundUserErrors.length > 0) {
        const errorMessages = refundUserErrors.map((e: any) => e.message).join(', ');
        logger.error('Refund user errors', { userErrors: refundUserErrors });
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

      logger.info('Refund created on order', { refundId: refund.id, orderStatus: updatedOrder?.displayFinancialStatus });

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
      // IMPORTANT: Return success: false if store credit fails - the operation is incomplete
      // The refundId is still included so caller can handle the partial state
      if (creditResult.errors) {
        logger.error('Store credit error', { errors: creditResult.errors });
        // Refund was created but store credit failed - this is a FAILURE state
        // Customer has order refunded but no store credit - needs manual intervention
        return {
          success: false, // Operation failed - store credit not issued
          refundId: refund.id, // Include refund ID for debugging/recovery
          orderName: orderName,
          refundedAmount: parseFloat(formattedAmount),
          currency: currency,
          error: `CRITICAL: Refund created but store credit failed: ${creditResult.errors[0]?.message}. Manual intervention required.`
        };
      }

      const creditUserErrors = creditResult.data?.storeCreditAccountCredit?.userErrors;
      if (creditUserErrors && creditUserErrors.length > 0) {
        const errorMessages = creditUserErrors.map((e: any) => e.message).join(', ');
        logger.error('Store credit user errors', { userErrors: creditUserErrors });
        return {
          success: false, // Operation failed - store credit not issued
          refundId: refund.id, // Include refund ID for debugging/recovery
          orderName: orderName,
          refundedAmount: parseFloat(formattedAmount),
          currency: currency,
          error: `CRITICAL: Refund created but store credit failed: ${errorMessages}. Manual intervention required.`
        };
      }

      const transaction = creditResult.data?.storeCreditAccountCredit?.storeCreditAccountTransaction;

      logger.info('Store credit issued to customer', {
        transactionId: transaction?.id,
        newBalance: transaction?.balanceAfterTransaction?.amount,
        currency
      });

      return {
        success: true,
        refundId: refund.id,
        orderName: orderName,
        refundedAmount: parseFloat(formattedAmount),
        currency: currency
      };

    } catch (error) {
      logger.error('Refund to store credit error', error);
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
