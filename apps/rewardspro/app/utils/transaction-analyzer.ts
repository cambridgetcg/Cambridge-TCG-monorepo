/**
 * Transaction Analyzer for Shopify Orders
 *
 * Analyzes payment transactions to determine cashback eligibility
 * Prevents double cashback on store credit and gift card payments
 */

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
 * Round down to 2 decimal places for accurate currency calculations
 */
export function roundDownToHundredths(value: number): number {
  return Math.floor(value * 100) / 100;
}

/**
 * Format number for Shopify API (exactly 2 decimal places)
 */
export function formatForShopify(value: number): string {
  return roundDownToHundredths(value).toFixed(2);
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
   */
  async fetchOrderTransactions(orderId: string): Promise<OrderDetails | null> {
    // Ensure we have a properly formatted GID
    const gid = orderId.startsWith('gid://')
      ? orderId
      : `gid://shopify/Order/${orderId}`;

    try {
      console.log(`[TransactionAnalyzer] Fetching transactions for order ${gid}`);

      const response = await this.admin.graphql(ORDER_TRANSACTIONS_QUERY, {
        variables: { id: gid }
      });

      const result = await response.json();

      if (result.errors || !result.data?.order) {
        console.error("[TransactionAnalyzer] Failed to fetch order details:", result.errors);
        return null;
      }

      console.log(`[TransactionAnalyzer] Found ${result.data.order.transactions.length} transactions`);
      return result.data.order;

    } catch (error) {
      console.error("[TransactionAnalyzer] GraphQL query failed:", error);
      return null;
    }
  }

  /**
   * Analyze transactions to determine payment breakdown
   */
  analyzeTransactions(transactions: Transaction[]): PaymentBreakdown {
    let giftCardAmount = 0;
    let storeCreditAmount = 0;
    let externalPaymentAmount = 0;
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
      const amount = parseFloat(tx.amountSet.shopMoney.amount);
      const gateway = tx.gateway.toLowerCase();
      currency = tx.amountSet.shopMoney.currencyCode;

      // Categorize payment by gateway
      if (gateway.includes('gift_card') || gateway === 'gift_card') {
        giftCardAmount += amount;
        console.log(`[TransactionAnalyzer]   Gift card: ${amount} (excluded from cashback)`);
      } else if (gateway.includes('store_credit') || gateway === 'store_credit' ||
                 gateway.includes('cashback') || gateway.includes('rewards')) {
        storeCreditAmount += amount;
        console.log(`[TransactionAnalyzer]   Store credit: ${amount} (excluded from cashback)`);
      } else {
        externalPaymentAmount += amount;
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