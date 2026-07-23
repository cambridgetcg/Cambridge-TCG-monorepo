/**
 * Currency Normalization Service
 *
 * Normalizes all amounts to a base currency (USD by default) for consistent
 * calculations across multi-currency stores. This ensures accurate tier
 * calculations and cashback amounts regardless of order currency.
 *
 * Based on research: Multi-currency stores should normalize to base currency
 * for calculations, then convert back for display.
 */

/**
 * Exchange rates: How much 1 unit of foreign currency equals in USD
 * E.g., EUR: 1.09 means €1 = $1.09 USD
 *
 * IMPORTANT: These are foreign-to-USD rates for clarity
 * To convert to USD: multiply by rate
 * To convert from USD: divide by rate
 *
 * These rates should be updated daily from an API in production
 */
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,      // Base currency
  EUR: 1.09,     // €1 = $1.09 (was incorrectly 0.92)
  GBP: 1.27,     // £1 = $1.27 (was incorrectly 0.79)
  CAD: 0.74,     // C$1 = $0.74 (was incorrectly 1.36)
  AUD: 0.65,     // A$1 = $0.65 (was incorrectly 1.53)
  JPY: 0.0067,   // ¥1 = $0.0067 (was incorrectly 149.50)
  CHF: 1.13,     // CHF 1 = $1.13 (was incorrectly 0.88)
  SEK: 0.096,    // kr1 = $0.096 (was incorrectly 10.43)
  NOK: 0.093,    // kr1 = $0.093 (was incorrectly 10.72)
  DKK: 0.146,    // kr1 = $0.146 (was incorrectly 6.87)
  NZD: 0.61,     // NZ$1 = $0.61 (was incorrectly 1.63)
  SGD: 0.75,     // S$1 = $0.75 (was incorrectly 1.34)
  HKD: 0.128,    // HK$1 = $0.128 (was incorrectly 7.82)
  MXN: 0.058,    // $1 MXN = $0.058 USD (was incorrectly 17.15)
  INR: 0.012,    // ₹1 = $0.012 (was incorrectly 83.12)
  CNY: 0.138,    // ¥1 CNY = $0.138 (was incorrectly 7.24)
  BRL: 0.201,    // R$1 = $0.201 (was incorrectly 4.97)
  ZAR: 0.053,    // R1 = $0.053 (was incorrectly 18.92)
  AED: 0.272,    // د.إ1 = $0.272 (was incorrectly 3.67)
  PLN: 0.251,    // zł1 = $0.251 (was incorrectly 3.98)
  THB: 0.028,    // ฿1 = $0.028 (was incorrectly 35.23)
  MYR: 0.214,    // RM1 = $0.214 (was incorrectly 4.67)
  PHP: 0.018,    // ₱1 = $0.018 (was incorrectly 55.89)
  IDR: 0.000064, // Rp1 = $0.000064 (was incorrectly 15650)
  TRY: 0.033,    // ₺1 = $0.033 (was incorrectly 30.12)
  RUB: 0.011,    // ₽1 = $0.011 (was incorrectly 89.76)
  HUF: 0.0028,   // Ft1 = $0.0028 (was incorrectly 356.78)
  CZK: 0.043,    // Kč1 = $0.043 (was incorrectly 23.42)
  ILS: 0.274,    // ₪1 = $0.274 (was incorrectly 3.65)
  KRW: 0.00075,  // ₩1 = $0.00075 (was incorrectly 1332.45)
  CLP: 0.0011,   // CLP not in original, adding
  RON: 0.22,     // RON not in original, adding
  // Removed VND and TWD as they're not in the Prisma enum
};

export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  normalizedAmount: number;
  baseCurrency: string;
  exchangeRate: number;
  conversionDate: Date;
}

/**
 * Normalize amount to base currency (USD)
 */
export function normalizeToBaseCurrency(
  amount: number,
  fromCurrency: string,
  baseCurrency: string = 'USD'
): CurrencyConversionResult {
  const currency = fromCurrency.toUpperCase();
  const base = baseCurrency.toUpperCase();

  // If already in base currency, no conversion needed
  if (currency === base) {
    return {
      originalAmount: amount,
      originalCurrency: currency,
      normalizedAmount: amount,
      baseCurrency: base,
      exchangeRate: 1.0,
      conversionDate: new Date()
    };
  }

  // Get exchange rate (foreign-to-USD rates)
  const fromRate = EXCHANGE_RATES[currency] || 1.0;
  const toRate = EXCHANGE_RATES[base] || 1.0;

  // Convert through USD as intermediate if needed
  let normalizedAmount: number;
  let effectiveRate: number;

  if (base === 'USD') {
    // Direct conversion to USD: multiply by the rate
    // E.g., €100 * 1.09 = $109
    normalizedAmount = amount * fromRate;
    effectiveRate = fromRate;
  } else if (currency === 'USD') {
    // Converting from USD to another currency: divide by that currency's rate
    // E.g., $100 / 1.09 = €91.74
    normalizedAmount = amount / toRate;
    effectiveRate = 1 / toRate;
  } else {
    // Cross-rate conversion (from currency -> USD -> base currency)
    // First convert to USD, then to target
    const usdAmount = amount * fromRate; // Convert to USD
    normalizedAmount = usdAmount / toRate; // Convert from USD to target
    effectiveRate = fromRate / toRate;
  }

  return {
    originalAmount: amount,
    originalCurrency: currency,
    normalizedAmount: Math.round(normalizedAmount * 100) / 100, // Round to 2 decimal places
    baseCurrency: base,
    exchangeRate: effectiveRate,
    conversionDate: new Date()
  };
}

/**
 * Convert from base currency back to target currency
 */
export function convertFromBaseCurrency(
  amount: number,
  toCurrency: string,
  baseCurrency: string = 'USD'
): CurrencyConversionResult {
  const currency = toCurrency.toUpperCase();
  const base = baseCurrency.toUpperCase();

  // If already in target currency, no conversion needed
  if (currency === base) {
    return {
      originalAmount: amount,
      originalCurrency: base,
      normalizedAmount: amount,
      baseCurrency: currency,
      exchangeRate: 1.0,
      conversionDate: new Date()
    };
  }

  // Get exchange rate (foreign-to-USD rates)
  const toRate = EXCHANGE_RATES[currency] || 1.0;
  const fromRate = EXCHANGE_RATES[base] || 1.0;

  // Convert
  let convertedAmount: number;
  let effectiveRate: number;

  if (base === 'USD') {
    // Direct conversion from USD: divide by the target currency's rate
    // E.g., $100 / 1.09 = €91.74
    convertedAmount = amount / toRate;
    effectiveRate = 1 / toRate;
  } else if (currency === 'USD') {
    // Converting to USD from another base: multiply by that currency's rate
    // E.g., €100 * 1.09 = $109
    convertedAmount = amount * fromRate;
    effectiveRate = fromRate;
  } else {
    // Cross-rate conversion (base currency -> USD -> target currency)
    const usdAmount = amount * fromRate; // Convert base to USD
    convertedAmount = usdAmount / toRate; // Convert USD to target
    effectiveRate = fromRate / toRate;
  }

  return {
    originalAmount: amount,
    originalCurrency: base,
    normalizedAmount: Math.round(convertedAmount * 100) / 100,
    baseCurrency: currency,
    exchangeRate: effectiveRate,
    conversionDate: new Date()
  };
}

/**
 * Batch normalize multiple amounts
 */
export function batchNormalize(
  amounts: Array<{ amount: number; currency: string }>,
  baseCurrency: string = 'USD'
): Array<CurrencyConversionResult> {
  return amounts.map(({ amount, currency }) =>
    normalizeToBaseCurrency(amount, currency, baseCurrency)
  );
}

/**
 * Calculate total spending across multiple currencies
 * Normalizes all amounts to base currency before summing
 */
export function calculateMultiCurrencyTotal(
  transactions: Array<{ amount: number; currency: string }>,
  baseCurrency: string = 'USD'
): {
  total: number;
  baseCurrency: string;
  transactions: Array<CurrencyConversionResult>;
} {
  const normalizedTransactions = batchNormalize(transactions, baseCurrency);
  const total = normalizedTransactions.reduce(
    (sum, tx) => sum + tx.normalizedAmount,
    0
  );

  return {
    total: Math.round(total * 100) / 100,
    baseCurrency,
    transactions: normalizedTransactions
  };
}

/**
 * Get exchange rate between two currencies
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): number {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return 1.0;

  const fromRate = EXCHANGE_RATES[from] || 1.0; // Rate to convert from-currency to USD
  const toRate = EXCHANGE_RATES[to] || 1.0;     // Rate to convert to-currency to USD

  // Cross rate: from -> USD -> to
  // E.g., EUR to GBP: (EUR to USD) / (GBP to USD) = 1.09 / 1.27 = 0.858
  return fromRate / toRate;
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Check if currency is supported
 */
export function isCurrencySupported(currency: string): boolean {
  return currency.toUpperCase() in EXCHANGE_RATES;
}

/**
 * Get list of supported currencies
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(EXCHANGE_RATES);
}

/**
 * Calculate cashback in customer's preferred currency
 */
export function calculateCashbackInCurrency(
  orderAmount: number,
  orderCurrency: string,
  cashbackPercent: number,
  customerCurrency: string
): {
  cashbackAmount: number;
  currency: string;
  normalizedAmount: number;
} {
  // First normalize order amount to USD
  const normalized = normalizeToBaseCurrency(orderAmount, orderCurrency, 'USD');

  // Calculate cashback on normalized amount (USD)
  const cashbackInUSD = (normalized.normalizedAmount * cashbackPercent) / 100;

  // Convert cashback to customer's preferred currency
  const cashbackInCustomerCurrency = convertFromBaseCurrency(
    cashbackInUSD,
    customerCurrency,
    'USD'
  );

  return {
    cashbackAmount: cashbackInCustomerCurrency.normalizedAmount,
    currency: customerCurrency,
    normalizedAmount: cashbackInUSD // USD amount for aggregation
  };
}

/**
 * Aggregate spending across multiple currencies for tier calculation
 */
export async function aggregateCustomerSpending(
  orders: Array<{
    totalPrice: number;
    currency: string;
    totalRefunded: number;
  }>,
  baseCurrency: string = 'USD'
): Promise<{
  totalSpent: number;
  totalRefunded: number;
  netSpent: number;
  baseCurrency: string;
}> {
  let totalSpent = 0;
  let totalRefunded = 0;

  for (const order of orders) {
    // Normalize order total to base currency
    const normalizedTotal = normalizeToBaseCurrency(
      order.totalPrice,
      order.currency,
      baseCurrency
    );
    totalSpent += normalizedTotal.normalizedAmount;

    // Normalize refund amount to base currency
    if (order.totalRefunded > 0) {
      const normalizedRefund = normalizeToBaseCurrency(
        order.totalRefunded,
        order.currency,
        baseCurrency
      );
      totalRefunded += normalizedRefund.normalizedAmount;
    }
  }

  return {
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalRefunded: Math.round(totalRefunded * 100) / 100,
    netSpent: Math.round((totalSpent - totalRefunded) * 100) / 100,
    baseCurrency
  };
}

/**
 * Update exchange rates from Shopify or external API
 * In production, this would fetch real-time rates
 */
export async function updateExchangeRates(
  shopDomain: string
): Promise<Record<string, number>> {
  // TODO: Implement fetching from Shopify Markets API or external service
  // For now, return static rates
  console.log(`[Currency] Would fetch exchange rates for ${shopDomain}`);
  return EXCHANGE_RATES;
}
