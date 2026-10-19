/**
 * Transaction Analyzer for Shopify Orders
 *
 * Analyzes payment transactions to determine cashback eligibility
 * Prevents double cashback on store credit and gift card payments
 */

import { Prisma } from '@prisma/client';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Transaction {
  id: string;
  gateway: string;
  status: string;
  kind: string;
  amountSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  parentTransaction?: {
    id: string;
  };
}

export interface OrderDetails {
  id: string;
  totalReceivedSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  transactions: Transaction[];
}

export interface PaymentBreakdown {
  giftCardAmount: number;
  storeCreditAmount: number;
  externalPaymentAmount: number;
  cashbackEligibleAmount: number;
  currency: string;
}

// ============================================================================
// GRAPHQL QUERIES
// ============================================================================

const ORDER_TRANSACTIONS_QUERY = `#graphql
  query GetOrderPaymentDetails($id: ID!) {
    order(id: $id) {
      id
      totalReceivedSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      transactions(first: 250) {
        id
        gateway
        status
        kind
        amountSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        parentTransaction {
          id
        }
      }
    }
  }
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * A money amount cut to whole cents, rounding down. Decimal arithmetic, not
 * `Math.floor(value * 100)`: in binary floating point 2.30 * 100 is
 * 229.99999999999997, which floors to 2.29.
 */
function toCentsRoundingDown(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

/**
 * Round down to 2 decimal places for accurate currency calculations
 */
export function roundDownToHundredths(value: Prisma.Decimal.Value): number {
  return toCentsRoundingDown(value).toNumber();
}

/**
 * Format an amount for Shopify's MoneyInput (exactly 2 decimal places,
 * rounding down). An amount the ledger stores (2 decimal places) is sent
 * unchanged: 2.30 is sent as "2.30".
 */
export function formatForShopify(value: Prisma.Decimal.Value): string {
  return toCentsRoundingDown(value).toFixed(2);
}

// ============================================================================
// TRANSACTION ANALYZER CLASS
// ============================================================================

export class TransactionAnalyzer {
  private admin: any;

  constructor(admin: any) {
    this.admin = admin;
  }

  /**
   * Fetch order transaction details from Shopify
   *
   * Throws when the request or query fails (network, throttling, API error),
   * so the caller can fail the webhook and let Shopify redeliver it, instead
   * of treating a transient failure as "no cashback-eligible payment".
   * Returns null only when Shopify reports no such order.
   */
  async fetchOrderTransactions(orderId: string): Promise<OrderDetails | null> {
    // Ensure we have a properly formatted GID
    const gid = orderId.startsWith('gid://')
      ? orderId
      : `gid://shopify/Order/${orderId}`;

    console.log(`[TransactionAnalyzer] Fetching transactions for order ${gid}`);

    const response = await this.admin.graphql(ORDER_TRANSACTIONS_QUERY, {
      variables: { id: gid }
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(`Order transactions query failed: ${JSON.stringify(result.errors).slice(0, 300)}`);
    }
    if (!result.data?.order) {
      console.warn(`[TransactionAnalyzer] Order ${gid} not found`);
      return null;
    }

    console.log(`[TransactionAnalyzer] Found ${result.data.order.transactions.length} transactions`);
    return result.data.order;
  }

  /**
   * Analyze transactions to determine payment breakdown
   */
  analyzeTransactions(transactions: Transaction[]): PaymentBreakdown {
    // Summed as decimals: float sums of cents (0.70 + 0.10 = 0.7999…) round down a cent short
    let giftCardAmount = new Prisma.Decimal(0);
    let storeCreditAmount = new Prisma.Decimal(0);
    let externalPaymentAmount = new Prisma.Decimal(0);
    let currency = 'USD';

    console.log(`[TransactionAnalyzer] Analyzing ${transactions.length} transactions`);

    // Only process successful SALE or CAPTURE transactions
    const validTransactions = transactions.filter(tx => {
      const isSuccessful = tx.status === 'SUCCESS';
      const isPayment = ['SALE', 'CAPTURE'].includes(tx.kind);
      return isSuccessful && isPayment;
    });

    console.log(`[TransactionAnalyzer] ${validTransactions.length} valid payment transactions`);

    // Deduplicate CAPTURE/AUTHORIZATION pairs
    const processedIds = new Set<string>();

    validTransactions.forEach(tx => {
      // Skip if we've already processed this transaction
      if (processedIds.has(tx.id)) return;

      // Skip CAPTURE if we already processed its AUTHORIZATION
      if (tx.kind === 'CAPTURE' && tx.parentTransaction) {
        const parentAuth = transactions.find(
          t => t.id === tx.parentTransaction!.id && t.kind === 'AUTHORIZATION'
        );
        if (parentAuth && processedIds.has(parentAuth.id)) {
          console.log(`[TransactionAnalyzer] Skipping duplicate CAPTURE for ${parentAuth.id}`);
          return;
        }
      }

      processedIds.add(tx.id);
      const amount = new Prisma.Decimal(tx.amountSet.shopMoney.amount);
      const gateway = tx.gateway.toLowerCase();
      currency = tx.amountSet.shopMoney.currencyCode;

      // Categorize payment by gateway
      if (gateway.includes('gift_card') || gateway === 'gift_card') {
        giftCardAmount = giftCardAmount.plus(amount);
        console.log(`[TransactionAnalyzer]   Gift card: ${amount} (excluded from cashback)`);
      } else if (gateway.includes('store_credit') || gateway === 'store_credit' ||
                 gateway.includes('cashback') || gateway.includes('rewards')) {
        storeCreditAmount = storeCreditAmount.plus(amount);
        console.log(`[TransactionAnalyzer]   Store credit: ${amount} (excluded from cashback)`);
      } else {
        externalPaymentAmount = externalPaymentAmount.plus(amount);
        console.log(`[TransactionAnalyzer]   External payment (${tx.gateway}): ${amount} (eligible for cashback)`);
      }
    });

    const breakdown = {
      giftCardAmount: roundDownToHundredths(giftCardAmount),
      storeCreditAmount: roundDownToHundredths(storeCreditAmount),
      externalPaymentAmount: roundDownToHundredths(externalPaymentAmount),
      cashbackEligibleAmount: roundDownToHundredths(externalPaymentAmount),
      currency
    };

    console.log("[TransactionAnalyzer] Payment Breakdown:", {
      giftCard: `${breakdown.giftCardAmount} ${currency}`,
      storeCredit: `${breakdown.storeCreditAmount} ${currency}`,
      external: `${breakdown.externalPaymentAmount} ${currency}`,
      eligible: `${breakdown.cashbackEligibleAmount} ${currency}`
    });

    return breakdown;
  }

  /**
   * Get cashback eligible amount for an order
   */
  async getCashbackEligibleAmount(orderId: string): Promise<{
    eligibleAmount: number;
    currency: string;
    breakdown: PaymentBreakdown | null;
  }> {
    // Fetch order transactions
    const orderDetails = await this.fetchOrderTransactions(orderId);

    if (!orderDetails || orderDetails.transactions.length === 0) {
      console.warn("[TransactionAnalyzer] No transactions found, returning 0 eligible amount");
      return {
        eligibleAmount: 0,
        currency: 'USD',
        breakdown: null
      };
    }

    // Analyze transactions
    const breakdown = this.analyzeTransactions(orderDetails.transactions);

    return {
      eligibleAmount: breakdown.cashbackEligibleAmount,
      currency: breakdown.currency,
      breakdown
    };
  }
}

// ============================================================================
// EXPORT HELPER FUNCTION
// ============================================================================

/**
 * Create a new TransactionAnalyzer instance
 */
export function createTransactionAnalyzer(admin: any): TransactionAnalyzer {
  return new TransactionAnalyzer(admin);
}