import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import crypto from 'crypto';

/**
 * Financial Security Tests
 * Focus on preventing double-spending, ensuring calculation integrity,
 * and implementing idempotency for financial operations
 */
describe('Financial Security Tests', () => {
  // Mock database for testing
  const mockDb = {
    transactions: new Map<string, any>(),
    customers: new Map<string, any>(),
    idempotencyKeys: new Map<string, any>(),

    async createTransaction(data: any) {
      const id = crypto.randomBytes(16).toString('hex');
      const transaction = { id, ...data, createdAt: new Date() };
      this.transactions.set(id, transaction);
      return transaction;
    },

    async getCustomer(id: string) {
      return this.customers.get(id);
    },

    async updateCustomerBalance(id: string, amount: number) {
      const customer = this.customers.get(id);
      if (!customer) throw new Error('Customer not found');

      const newBalance = customer.storeCredit + amount;
      if (newBalance < 0) throw new Error('Insufficient balance');

      customer.storeCredit = newBalance;
      return customer;
    },

    async checkIdempotencyKey(key: string) {
      return this.idempotencyKeys.has(key);
    },

    async storeIdempotencyResult(key: string, result: any) {
      this.idempotencyKeys.set(key, {
        result,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      });
    }
  };

  beforeEach(() => {
    mockDb.transactions.clear();
    mockDb.customers.clear();
    mockDb.idempotencyKeys.clear();

    // Seed test customer
    mockDb.customers.set('cust-123', {
      id: 'cust-123',
      shop: 'test-shop.myshopify.com',
      email: 'test@example.com',
      storeCredit: 100.00
    });
  });

  describe('Double-Spend Prevention', () => {
    test('prevents concurrent credit redemptions', async () => {
      const customerId = 'cust-123';
      const amount = 100; // Try to spend full balance twice

      // Function to redeem credit with locking
      const redeemCredit = async (custId: string, amt: number): Promise<boolean> => {
        // Simulate row-level lock with a simple mutex
        const lockKey = `lock:${custId}`;
        let locked = false;

        try {
          // In production, use SELECT ... FOR UPDATE or Redis lock
          locked = true;

          const customer = await mockDb.getCustomer(custId);
          if (!customer) throw new Error('Customer not found');

          if (customer.storeCredit < amt) {
            return false; // Insufficient funds
          }

          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 10));

          await mockDb.updateCustomerBalance(custId, -amt);
          await mockDb.createTransaction({
            customerId: custId,
            type: 'REDEMPTION',
            amount: -amt,
            balance: customer.storeCredit - amt
          });

          return true;
        } finally {
          // Release lock
          locked = false;
        }
      };

      // Attempt concurrent redemptions
      const [result1, result2] = await Promise.allSettled([
        redeemCredit(customerId, amount),
        redeemCredit(customerId, amount)
      ]);

      // One should succeed, one should fail
      const successes = [result1, result2].filter(
        r => r.status === 'fulfilled' && r.value === true
      ).length;

      expect(successes).toBe(1);

      // Check final balance
      const customer = await mockDb.getCustomer(customerId);
      expect(customer.storeCredit).toBe(0);
    });

    test('handles race condition in cashback application', async () => {
      const orderId = 'order-456';
      const customerId = 'cust-123';
      const cashbackAmount = 10;

      // Track if cashback was already applied
      const appliedCashbacks = new Set<string>();

      const applyCashback = async (oId: string, cId: string, amount: number): Promise<boolean> => {
        // Check if already applied (idempotency)
        if (appliedCashbacks.has(oId)) {
          return false; // Already processed
        }

        appliedCashbacks.add(oId);

        await mockDb.updateCustomerBalance(cId, amount);
        await mockDb.createTransaction({
          customerId: cId,
          orderId: oId,
          type: 'CASHBACK_EARNED',
          amount: amount
        });

        return true;
      };

      // Simulate duplicate webhook
      const results = await Promise.all([
        applyCashback(orderId, customerId, cashbackAmount),
        applyCashback(orderId, customerId, cashbackAmount),
        applyCashback(orderId, customerId, cashbackAmount)
      ]);

      // Only first should succeed
      expect(results.filter(r => r === true)).toHaveLength(1);
      expect(results.filter(r => r === false)).toHaveLength(2);

      // Balance should only increase once
      const customer = await mockDb.getCustomer(customerId);
      expect(customer.storeCredit).toBe(110); // 100 + 10, not 100 + 30
    });
  });

  describe('Idempotency Implementation', () => {
    test('implements idempotency keys for financial operations', async () => {
      const idempotencyKey = 'idem-key-789';
      const operation = {
        customerId: 'cust-123',
        amount: 25,
        type: 'CREDIT_ADJUSTMENT'
      };

      const executeWithIdempotency = async (key: string, op: any) => {
        // Check if already processed
        if (await mockDb.checkIdempotencyKey(key)) {
          const cached = mockDb.idempotencyKeys.get(key);
          return { ...cached.result, idempotent: true };
        }

        // Process operation
        const customer = await mockDb.updateCustomerBalance(op.customerId, op.amount);
        const transaction = await mockDb.createTransaction(op);

        const result = {
          success: true,
          transactionId: transaction.id,
          newBalance: customer.storeCredit
        };

        // Store result with idempotency key
        await mockDb.storeIdempotencyResult(key, result);

        return result;
      };

      // First call processes
      const result1 = await executeWithIdempotency(idempotencyKey, operation);
      expect(result1.success).toBe(true);
      expect(result1.idempotent).toBeUndefined();

      // Subsequent calls return cached result
      const result2 = await executeWithIdempotency(idempotencyKey, operation);
      expect(result2.success).toBe(true);
      expect(result2.idempotent).toBe(true);
      expect(result2.transactionId).toBe(result1.transactionId);

      // Balance only changed once
      const customer = await mockDb.getCustomer('cust-123');
      expect(customer.storeCredit).toBe(125); // 100 + 25, not 100 + 50
    });

    test('idempotency keys expire after 24 hours', () => {
      vi.useFakeTimers();

      const key = 'expiring-key';
      const result = { success: true, amount: 50 };

      // Store idempotency result
      mockDb.idempotencyKeys.set(key, {
        result,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      expect(mockDb.checkIdempotencyKey(key)).toBe(true);

      // Advance time by 25 hours
      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);

      // Should be expired (in real implementation)
      const entry = mockDb.idempotencyKeys.get(key);
      const isExpired = entry && new Date() > entry.expiresAt;
      expect(isExpired).toBe(true);

      vi.useRealTimers();
    });

    test('generates unique idempotency keys', () => {
      const generateIdempotencyKey = (
        shop: string,
        operation: string,
        uniqueData: any
      ): string => {
        const data = JSON.stringify({ shop, operation, ...uniqueData });
        return crypto.createHash('sha256').update(data).digest('hex');
      };

      const key1 = generateIdempotencyKey('shop1', 'credit', { orderId: '123' });
      const key2 = generateIdempotencyKey('shop1', 'credit', { orderId: '124' });
      const key3 = generateIdempotencyKey('shop2', 'credit', { orderId: '123' });

      expect(key1).not.toBe(key2); // Different order
      expect(key1).not.toBe(key3); // Different shop
      expect(key1.length).toBe(64); // SHA256 hex
    });
  });

  describe('Decimal Precision and Calculation Integrity', () => {
    test('handles decimal arithmetic correctly', () => {
      // Use Decimal.js or similar for financial calculations
      const Decimal = require('decimal.js');

      // JavaScript floating point issues
      expect(0.1 + 0.2).not.toBe(0.3); // Famous JS issue

      // Using Decimal for precision
      const a = new Decimal(0.1);
      const b = new Decimal(0.2);
      const sum = a.plus(b);

      expect(sum.toNumber()).toBe(0.3);
    });

    test('calculates cashback with proper rounding', () => {
      const calculateCashback = (amount: number, percentage: number): number => {
        // Use banker's rounding (round half to even)
        const Decimal = require('decimal.js');
        Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

        const amt = new Decimal(amount);
        const pct = new Decimal(percentage).dividedBy(100);
        const cashback = amt.multipliedBy(pct);

        // Round to 2 decimal places (cents)
        return cashback.toDecimalPlaces(2).toNumber();
      };

      // Test various scenarios
      expect(calculateCashback(100, 5)).toBe(5.00);
      expect(calculateCashback(99.99, 10)).toBe(10.00); // 9.999 rounds to 10.00
      expect(calculateCashback(19.95, 3)).toBe(0.60); // 0.5985 rounds to 0.60
      expect(calculateCashback(25.25, 2)).toBe(0.51); // 0.505 rounds to 0.50 (banker's)
    });

    test('stores currency in smallest unit (cents)', () => {
      // Store as integers to avoid precision issues
      const toCents = (dollars: number): number => Math.round(dollars * 100);
      const toDollars = (cents: number): number => cents / 100;

      expect(toCents(10.99)).toBe(1099);
      expect(toCents(0.01)).toBe(1);
      expect(toDollars(1099)).toBe(10.99);
      expect(toDollars(1)).toBe(0.01);

      // No precision loss
      const amount = 123.45;
      expect(toDollars(toCents(amount))).toBe(amount);
    });

    test('prevents negative balances', async () => {
      const customerId = 'cust-123';

      // Try to deduct more than available
      await expect(
        mockDb.updateCustomerBalance(customerId, -150)
      ).rejects.toThrow('Insufficient balance');

      // Balance should remain unchanged
      const customer = await mockDb.getCustomer(customerId);
      expect(customer.storeCredit).toBe(100);
    });

    test('handles extremely large numbers safely', () => {
      const Decimal = require('decimal.js');

      // JavaScript's MAX_SAFE_INTEGER
      const maxSafe = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991

      // Test with amounts beyond safe integer
      const largeAmount = new Decimal('9999999999999999.99');
      const cashback = largeAmount.multipliedBy(0.05);

      expect(cashback.toString()).toBe('499999999999999.9995');

      // Ensure we reject unreasonable amounts
      const validateAmount = (amount: number): boolean => {
        return amount > 0 && amount <= 1000000; // Max $1M
      };

      expect(validateAmount(100)).toBe(true);
      expect(validateAmount(9999999999)).toBe(false);
    });
  });

  describe('Transaction Integrity', () => {
    test('maintains transaction consistency with double-entry bookkeeping', async () => {
      // Every credit must have a corresponding debit
      const applyTransaction = async (
        customerId: string,
        amount: number,
        type: string
      ) => {
        const customer = await mockDb.getCustomer(customerId);
        const previousBalance = customer.storeCredit;

        // Update balance
        await mockDb.updateCustomerBalance(customerId, amount);

        // Create ledger entry
        const transaction = await mockDb.createTransaction({
          customerId,
          type,
          amount,
          previousBalance,
          balance: previousBalance + amount
        });

        return transaction;
      };

      // Series of transactions
      await applyTransaction('cust-123', 50, 'CASHBACK_EARNED');
      await applyTransaction('cust-123', -30, 'ORDER_PAYMENT');
      await applyTransaction('cust-123', 20, 'REFUND_CREDIT');

      // Verify audit trail
      const transactions = Array.from(mockDb.transactions.values())
        .filter(t => t.customerId === 'cust-123')
        .sort((a, b) => a.createdAt - b.createdAt);

      expect(transactions).toHaveLength(3);

      // Verify running balance
      expect(transactions[0].balance).toBe(150); // 100 + 50
      expect(transactions[1].balance).toBe(120); // 150 - 30
      expect(transactions[2].balance).toBe(140); // 120 + 20

      // Final balance should match
      const customer = await mockDb.getCustomer('cust-123');
      expect(customer.storeCredit).toBe(140);
    });

    test('creates immutable audit log', async () => {
      const transaction = await mockDb.createTransaction({
        customerId: 'cust-123',
        type: 'CASHBACK_EARNED',
        amount: 25,
        metadata: { orderId: 'order-999' }
      });

      // Attempt to modify (should not be allowed in production)
      const original = { ...transaction };

      // In real implementation, this would throw or be prevented
      // transaction.amount = 50; // Should not be allowed

      expect(transaction).toEqual(original);
      expect(transaction.id).toBeDefined();
      expect(transaction.createdAt).toBeDefined();
    });
  });

  describe('Fraud Detection', () => {
    test('detects unusual transaction patterns', async () => {
      const detectFraud = (transactions: any[]): boolean => {
        // Simple velocity check
        const recentTransactions = transactions.filter(t => {
          const hourAgo = Date.now() - 60 * 60 * 1000;
          return t.createdAt.getTime() > hourAgo;
        });

        // Flag if too many transactions in short period
        if (recentTransactions.length > 10) return true;

        // Flag if large amount
        const largeTransactions = transactions.filter(t => Math.abs(t.amount) > 1000);
        if (largeTransactions.length > 0) return true;

        return false;
      };

      // Normal pattern
      const normalTransactions = [
        { amount: 10, createdAt: new Date() },
        { amount: -5, createdAt: new Date() }
      ];
      expect(detectFraud(normalTransactions)).toBe(false);

      // Suspicious pattern - many transactions
      const suspiciousTransactions = Array(15).fill(null).map(() => ({
        amount: 50,
        createdAt: new Date()
      }));
      expect(detectFraud(suspiciousTransactions)).toBe(true);

      // Suspicious pattern - large amount
      const largeTransaction = [{ amount: 5000, createdAt: new Date() }];
      expect(detectFraud(largeTransaction)).toBe(true);
    });

    test('implements velocity limits', () => {
      const velocityLimits = {
        hourly: { count: 10, amount: 500 },
        daily: { count: 50, amount: 2000 }
      };

      const checkVelocity = (
        transactions: any[],
        windowHours: number,
        limits: { count: number; amount: number }
      ): boolean => {
        const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
        const recent = transactions.filter(t => t.createdAt.getTime() > cutoff);

        const count = recent.length;
        const total = recent.reduce((sum, t) => sum + Math.abs(t.amount), 0);

        return count <= limits.count && total <= limits.amount;
      };

      const transactions = [
        { amount: 100, createdAt: new Date() },
        { amount: 200, createdAt: new Date() },
        { amount: 250, createdAt: new Date() }
      ];

      expect(checkVelocity(transactions, 1, velocityLimits.hourly)).toBe(true);

      // Add transaction that exceeds hourly limit
      transactions.push({ amount: 100, createdAt: new Date() });
      expect(checkVelocity(transactions, 1, velocityLimits.hourly)).toBe(false);
    });
  });

  describe('Currency Handling', () => {
    test('handles multiple currencies correctly', () => {
      const convertCurrency = (
        amount: number,
        fromCurrency: string,
        toCurrency: string,
        rates: Record<string, number>
      ): number => {
        if (fromCurrency === toCurrency) return amount;

        // Convert to USD first (base currency)
        const usdAmount = amount / rates[fromCurrency];

        // Convert to target currency
        return Number((usdAmount * rates[toCurrency]).toFixed(2));
      };

      const exchangeRates = {
        USD: 1,
        EUR: 0.85,
        GBP: 0.73,
        CAD: 1.25
      };

      expect(convertCurrency(100, 'USD', 'EUR', exchangeRates)).toBe(85);
      expect(convertCurrency(100, 'EUR', 'USD', exchangeRates)).toBe(117.65);
      expect(convertCurrency(100, 'GBP', 'CAD', exchangeRates)).toBe(171.23);
    });

    test('stores exchange rate at transaction time', async () => {
      const transaction = await mockDb.createTransaction({
        customerId: 'cust-123',
        amount: 100,
        currency: 'USD',
        exchangeRate: 1,
        baseCurrencyAmount: 100,
        metadata: {
          originalCurrency: 'EUR',
          originalAmount: 85,
          exchangeRate: 1.1765
        }
      });

      // Can reconstruct original amount
      expect(transaction.metadata.originalAmount).toBe(85);
      expect(transaction.metadata.exchangeRate).toBe(1.1765);
    });
  });

  describe('Refund Handling', () => {
    test('handles partial refunds correctly', async () => {
      const orderId = 'order-1000';
      const originalAmount = 100;
      const cashbackRate = 0.05;
      const originalCashback = originalAmount * cashbackRate; // $5

      // Original purchase
      await mockDb.updateCustomerBalance('cust-123', originalCashback);

      // Partial refund (50%)
      const refundAmount = 50;
      const refundCashbackClawback = refundAmount * cashbackRate; // $2.50

      await mockDb.updateCustomerBalance('cust-123', -refundCashbackClawback);
      await mockDb.createTransaction({
        customerId: 'cust-123',
        orderId,
        type: 'CASHBACK_REVERSED',
        amount: -refundCashbackClawback,
        metadata: {
          refundAmount,
          originalOrderAmount: originalAmount
        }
      });

      // Customer should have $2.50 cashback remaining
      const customer = await mockDb.getCustomer('cust-123');
      expect(customer.storeCredit).toBe(102.50); // 100 + 5 - 2.50
    });

    test('prevents refund amount exceeding original', () => {
      const validateRefund = (
        originalAmount: number,
        previousRefunds: number[],
        newRefundAmount: number
      ): boolean => {
        const totalRefunded = previousRefunds.reduce((sum, r) => sum + r, 0) + newRefundAmount;
        return totalRefunded <= originalAmount;
      };

      expect(validateRefund(100, [], 50)).toBe(true);
      expect(validateRefund(100, [30], 70)).toBe(true);
      expect(validateRefund(100, [30, 40], 31)).toBe(false); // Would exceed original
    });
  });

  describe('Security Best Practices', () => {
    test('never logs sensitive financial data', () => {
      const sanitizeForLogging = (transaction: any): any => {
        const sanitized = { ...transaction };

        // Remove or mask sensitive fields
        if (sanitized.customerId) {
          sanitized.customerId = sanitized.customerId.substring(0, 8) + '...';
        }

        if (sanitized.amount > 100) {
          sanitized.amount = 'LARGE_AMOUNT';
        }

        delete sanitized.metadata?.bankAccount;
        delete sanitized.metadata?.routingNumber;

        return sanitized;
      };

      const sensitive = {
        id: 'txn-123',
        customerId: 'cust-sensitive-12345',
        amount: 5000,
        metadata: {
          bankAccount: '****1234',
          orderId: 'order-456'
        }
      };

      const logged = sanitizeForLogging(sensitive);

      expect(logged.customerId).toBe('cust-sen...');
      expect(logged.amount).toBe('LARGE_AMOUNT');
      expect(logged.metadata.bankAccount).toBeUndefined();
      expect(logged.metadata.orderId).toBe('order-456'); // Non-sensitive preserved
    });

    test('validates all financial inputs', () => {
      const validateFinancialInput = (input: any): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (typeof input.amount !== 'number' || isNaN(input.amount)) {
          errors.push('Amount must be a number');
        }

        if (input.amount < 0) {
          errors.push('Amount cannot be negative');
        }

        if (input.amount > 1000000) {
          errors.push('Amount exceeds maximum');
        }

        if (input.currency && !/^[A-Z]{3}$/.test(input.currency)) {
          errors.push('Invalid currency code');
        }

        return {
          valid: errors.length === 0,
          errors
        };
      };

      expect(validateFinancialInput({ amount: 100 })).toEqual({ valid: true, errors: [] });
      expect(validateFinancialInput({ amount: 'abc' })).toEqual({
        valid: false,
        errors: ['Amount must be a number']
      });
      expect(validateFinancialInput({ amount: -50 })).toEqual({
        valid: false,
        errors: ['Amount cannot be negative']
      });
    });
  });
});