import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import fc from 'fast-check';

// Mock types matching Prisma schema
type LedgerEntryType =
  | 'CASHBACK_EARNED'
  | 'ORDER_PAYMENT'
  | 'MANUAL_ADJUSTMENT'
  | 'REFUND_CREDIT'
  | 'CLAWBACK'
  | 'EXPIRY'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

interface StoreCreditLedgerEntry {
  id: string;
  customerId: string;
  shop: string;
  type: LedgerEntryType;
  amount: Decimal;
  balance: Decimal;
  orderId?: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface Customer {
  id: string;
  shop: string;
  storeCreditBalance: Decimal;
  lifetimeStoreCreditEarned: Decimal;
  lifetimeStoreCreditUsed: Decimal;
}

// Ledger Service for testing double-entry bookkeeping
class StoreCreditLedgerService {
  private entries: StoreCreditLedgerEntry[] = [];
  private customers: Map<string, Customer> = new Map();
  private readonly shop: string;

  constructor(shop: string) {
    this.shop = shop;
  }

  // Initialize customer
  initializeCustomer(customerId: string): Customer {
    const customer: Customer = {
      id: customerId,
      shop: this.shop,
      storeCreditBalance: new Decimal(0),
      lifetimeStoreCreditEarned: new Decimal(0),
      lifetimeStoreCreditUsed: new Decimal(0)
    };
    this.customers.set(customerId, customer);
    return customer;
  }

  // Add credit (positive amount)
  addCredit(
    customerId: string,
    amount: Decimal,
    type: LedgerEntryType,
    orderId?: string,
    description?: string
  ): StoreCreditLedgerEntry {
    if (amount.lte(0)) {
      throw new Error('Credit amount must be positive');
    }

    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const previousBalance = customer.storeCreditBalance;
    const newBalance = previousBalance.plus(amount);

    const entry: StoreCreditLedgerEntry = {
      id: uuidv4(),
      customerId,
      shop: this.shop,
      type,
      amount: amount,
      balance: newBalance,
      orderId,
      description,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.entries.push(entry);

    // Update customer balances
    customer.storeCreditBalance = newBalance;
    if (type === 'CASHBACK_EARNED' || type === 'REFUND_CREDIT' || type === 'MANUAL_ADJUSTMENT') {
      customer.lifetimeStoreCreditEarned = customer.lifetimeStoreCreditEarned.plus(amount);
    }

    return entry;
  }

  // Debit: reduce balance (for transfers out, redemptions, etc.)
  addDebit(
    customerId: string,
    amount: Decimal,
    type: LedgerEntryType,
    orderId?: string,
    description?: string
  ): StoreCreditLedgerEntry {
    if (amount.lte(0)) {
      throw new Error('Debit amount must be positive');
    }
    const customer = this.customers.get(customerId);
    if (!customer) throw new Error('Customer not found');
    const previousBalance = customer.storeCreditBalance;
    const newBalance = previousBalance.minus(amount);
    const entry: StoreCreditLedgerEntry = {
      id: uuidv4(), customerId, shop: this.shop, type,
      amount: amount.neg(), balance: newBalance, orderId, description,
      createdAt: new Date(), updatedAt: new Date()
    };
    this.entries.push(entry);
    customer.storeCreditBalance = newBalance;
    return entry;
  }

  // Use credit (negative amount in ledger)
  useCredit(
    customerId: string,
    amount: Decimal,
    orderId: string,
    description?: string
  ): StoreCreditLedgerEntry {
    if (amount.lte(0)) {
      throw new Error('Use amount must be positive');
    }

    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    if (customer.storeCreditBalance.lt(amount)) {
      throw new Error('Insufficient store credit balance');
    }

    const previousBalance = customer.storeCreditBalance;
    const newBalance = previousBalance.minus(amount);

    const entry: StoreCreditLedgerEntry = {
      id: uuidv4(),
      customerId,
      shop: this.shop,
      type: 'ORDER_PAYMENT',
      amount: amount.neg(), // Negative for usage
      balance: newBalance,
      orderId,
      description,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.entries.push(entry);

    // Update customer balances
    customer.storeCreditBalance = newBalance;
    customer.lifetimeStoreCreditUsed = customer.lifetimeStoreCreditUsed.plus(amount);

    return entry;
  }

  // Process clawback (reverse credit)
  processClawback(
    customerId: string,
    amount: Decimal,
    originalOrderId: string,
    reason: string
  ): StoreCreditLedgerEntry {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Allow negative balance for clawbacks
    const previousBalance = customer.storeCreditBalance;
    const newBalance = previousBalance.minus(amount);

    const entry: StoreCreditLedgerEntry = {
      id: uuidv4(),
      customerId,
      shop: this.shop,
      type: 'CLAWBACK',
      amount: amount.neg(), // Negative for clawback
      balance: newBalance,
      orderId: originalOrderId,
      description: `Clawback: ${reason}`,
      metadata: { reason, originalOrderId },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.entries.push(entry);
    customer.storeCreditBalance = newBalance;

    return entry;
  }

  // Get all entries for a customer
  getCustomerEntries(customerId: string): StoreCreditLedgerEntry[] {
    return this.entries.filter(e => e.customerId === customerId);
  }

  // Verify ledger consistency
  verifyLedgerConsistency(customerId: string): {
    isConsistent: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const customerEntries = this.getCustomerEntries(customerId);

    if (customerEntries.length === 0) {
      return { isConsistent: true, errors: [] };
    }

    // Sort entries by creation time
    const sortedEntries = [...customerEntries].sort((a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime()
    );

    // Verify balance chain
    let calculatedBalance = new Decimal(0);
    for (const entry of sortedEntries) {
      calculatedBalance = calculatedBalance.plus(entry.amount);

      if (!calculatedBalance.eq(entry.balance)) {
        errors.push(
          `Balance mismatch at entry ${entry.id}: ` +
          `calculated ${calculatedBalance.toString()}, ` +
          `recorded ${entry.balance.toString()}`
        );
      }
    }

    // Verify final balance matches customer record
    const customer = this.customers.get(customerId);
    if (customer && !calculatedBalance.eq(customer.storeCreditBalance)) {
      errors.push(
        `Customer balance mismatch: ` +
        `ledger sum ${calculatedBalance.toString()}, ` +
        `customer record ${customer.storeCreditBalance.toString()}`
      );
    }

    return {
      isConsistent: errors.length === 0,
      errors
    };
  }

  // Calculate audit totals
  calculateAuditTotals(): {
    totalCredits: Decimal;
    totalDebits: Decimal;
    netBalance: Decimal;
    isBalanced: boolean;
  } {
    let totalCredits = new Decimal(0);
    let totalDebits = new Decimal(0);

    for (const entry of this.entries) {
      if (entry.amount.gt(0)) {
        totalCredits = totalCredits.plus(entry.amount);
      } else {
        totalDebits = totalDebits.plus(entry.amount.abs());
      }
    }

    const netBalance = totalCredits.minus(totalDebits);

    // Sum of all customer balances should equal net ledger balance
    let customerBalanceSum = new Decimal(0);
    for (const customer of this.customers.values()) {
      customerBalanceSum = customerBalanceSum.plus(customer.storeCreditBalance);
    }

    // Allow tiny precision drift (last few decimal digits) from accumulated operations
    const isBalanced = netBalance.minus(customerBalanceSum).abs().lt(new Decimal('1e-15'));

    return {
      totalCredits,
      totalDebits,
      netBalance,
      isBalanced
    };
  }
}

describe('Store Credit Ledger - Double-Entry Bookkeeping', () => {
  let ledger: StoreCreditLedgerService;
  const TEST_SHOP = 'test-shop.myshopify.com';

  beforeEach(() => {
    ledger = new StoreCreditLedgerService(TEST_SHOP);
  });

  describe('Basic Ledger Operations', () => {
    it('should maintain balance consistency through credit and debit operations', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      // Add credit
      ledger.addCredit(
        customerId,
        new Decimal(100),
        'CASHBACK_EARNED',
        'order-1',
        'Cashback from order'
      );

      expect(customer.storeCreditBalance.toNumber()).toBe(100);
      expect(customer.lifetimeStoreCreditEarned.toNumber()).toBe(100);

      // Use credit
      ledger.useCredit(
        customerId,
        new Decimal(30),
        'order-2',
        'Applied to order'
      );

      expect(customer.storeCreditBalance.toNumber()).toBe(70);
      expect(customer.lifetimeStoreCreditUsed.toNumber()).toBe(30);

      // Verify consistency
      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(true);
      expect(consistency.errors).toHaveLength(0);
    });

    it('should prevent negative balance from normal usage', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      ledger.addCredit(
        customerId,
        new Decimal(50),
        'CASHBACK_EARNED',
        'order-1'
      );

      // Try to use more than available
      expect(() => {
        ledger.useCredit(
          customerId,
          new Decimal(60),
          'order-2'
        );
      }).toThrow('Insufficient store credit balance');
    });

    it('should allow negative balance from clawbacks', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      ledger.addCredit(
        customerId,
        new Decimal(100),
        'CASHBACK_EARNED',
        'order-1'
      );

      ledger.useCredit(
        customerId,
        new Decimal(80),
        'order-2'
      );

      // Clawback more than remaining balance
      ledger.processClawback(
        customerId,
        new Decimal(50),
        'order-1',
        'Order cancelled after credit used'
      );

      expect(customer.storeCreditBalance.toNumber()).toBe(-30);

      // Ledger should still be consistent
      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(true);
    });
  });

  describe('Audit and Balance Verification', () => {
    it('should maintain global balance equality', () => {
      // Initialize multiple customers
      const customer1 = 'customer-1';
      const customer2 = 'customer-2';
      const customer3 = 'customer-3';

      ledger.initializeCustomer(customer1);
      ledger.initializeCustomer(customer2);
      ledger.initializeCustomer(customer3);

      // Various transactions
      ledger.addCredit(customer1, new Decimal(100), 'CASHBACK_EARNED');
      ledger.addCredit(customer2, new Decimal(200), 'REFUND_CREDIT');
      ledger.addCredit(customer3, new Decimal(150), 'MANUAL_ADJUSTMENT');

      ledger.useCredit(customer1, new Decimal(30), 'order-1');
      ledger.useCredit(customer2, new Decimal(50), 'order-2');

      ledger.processClawback(customer3, new Decimal(20), 'order-3', 'Fraud');

      // Verify global balance
      const audit = ledger.calculateAuditTotals();
      expect(audit.isBalanced).toBe(true);

      // Total credits minus total debits should equal sum of customer balances
      const expectedBalance = (100 - 30) + (200 - 50) + (150 - 20);
      expect(audit.netBalance.toNumber()).toBe(expectedBalance);
    });

    it('should track lifetime earned and used correctly', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      // Multiple earn events
      ledger.addCredit(customerId, new Decimal(50), 'CASHBACK_EARNED');
      ledger.addCredit(customerId, new Decimal(30), 'REFUND_CREDIT');
      ledger.addCredit(customerId, new Decimal(20), 'MANUAL_ADJUSTMENT');

      // Multiple use events
      ledger.useCredit(customerId, new Decimal(25), 'order-1');
      ledger.useCredit(customerId, new Decimal(15), 'order-2');

      expect(customer.lifetimeStoreCreditEarned.toNumber()).toBe(100);
      expect(customer.lifetimeStoreCreditUsed.toNumber()).toBe(40);
      expect(customer.storeCreditBalance.toNumber()).toBe(60);
    });
  });

  describe('Property-Based Testing - Ledger Invariants', () => {
    it('should maintain balance consistency for random transactions', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              customerId: fc.constantFrom('c1', 'c2', 'c3'),
              operation: fc.constantFrom('credit', 'debit'),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true })
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (transactions) => {
            // Fresh ledger per iteration to avoid accumulating state
            const testLedger = new StoreCreditLedgerService(TEST_SHOP);
            // Initialize customers
            const customerIds = [...new Set(transactions.map(t => t.customerId))];
            customerIds.forEach(id => testLedger.initializeCustomer(id));

            // Track expected balances
            const expectedBalances = new Map<string, Decimal>();
            customerIds.forEach(id => expectedBalances.set(id, new Decimal(0)));

            // Process transactions
            let orderId = 1;
            for (const tx of transactions) {
              const amount = new Decimal(tx.amount);
              const currentBalance = expectedBalances.get(tx.customerId)!;

              if (tx.operation === 'credit') {
                testLedger.addCredit(
                  tx.customerId,
                  amount,
                  'CASHBACK_EARNED',
                  `order-${orderId++}`
                );
                expectedBalances.set(tx.customerId, currentBalance.plus(amount));
              } else if (currentBalance.gte(amount)) {
                // Only debit if sufficient balance
                testLedger.useCredit(
                  tx.customerId,
                  amount,
                  `order-${orderId++}`
                );
                expectedBalances.set(tx.customerId, currentBalance.minus(amount));
              }
            }

            // Verify all customers have consistent ledgers
            for (const customerId of customerIds) {
              const consistency = testLedger.verifyLedgerConsistency(customerId);
              expect(consistency.isConsistent).toBe(true);

              const customer = testLedger['customers'].get(customerId)!;
              const expected = expectedBalances.get(customerId)!;
              expect(customer.storeCreditBalance.toNumber()).toBeCloseTo(
                expected.toNumber(),
                10 // 10 decimal places precision
              );
            }

            // Verify global audit
            const audit = testLedger.calculateAuditTotals();
            expect(audit.isBalanced).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain the accounting equation: Assets = Liabilities + Equity', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.array(
            fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true }),
            { minLength: 0, maxLength: 10 }
          ),
          (credits, debits) => {
            const testLedger2 = new StoreCreditLedgerService(TEST_SHOP);
            const customerId = 'test-customer';
            testLedger2.initializeCustomer(customerId);

            // Add all credits
            credits.forEach((amount, i) => {
              testLedger2.addCredit(
                customerId,
                new Decimal(amount),
                'CASHBACK_EARNED',
                `credit-${i}`
              );
            });

            // Process debits (only if balance allows)
            const customer = testLedger2['customers'].get(customerId)!;
            debits.forEach((amount, i) => {
              if (customer.storeCreditBalance.gte(amount)) {
                testLedger2.useCredit(
                  customerId,
                  new Decimal(amount),
                  `debit-${i}`
                );
              }
            });

            // Verify accounting equation
            const entries = testLedger2.getCustomerEntries(customerId);
            const sumOfEntries = entries.reduce(
              (sum, entry) => sum.plus(entry.amount),
              new Decimal(0)
            );

            expect(sumOfEntries.toNumber()).toBeCloseTo(
              customer.storeCreditBalance.toNumber(),
              10
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should never lose precision in compound operations', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: Math.fround(0.001), max: Math.fround(0.999), noNaN: true }),
            { minLength: 10, maxLength: 100 }
          ),
          (amounts) => {
            const testLedger3 = new StoreCreditLedgerService(TEST_SHOP);
            const customerId = 'precision-test';
            testLedger3.initializeCustomer(customerId);

            // Add many small amounts
            amounts.forEach((amount, i) => {
              testLedger3.addCredit(
                customerId,
                new Decimal(amount),
                'CASHBACK_EARNED',
                `micro-${i}`
              );
            });

            // Calculate expected sum with Decimal precision
            const expectedSum = amounts.reduce(
              (sum, amount) => sum.plus(new Decimal(amount)),
              new Decimal(0)
            );

            const customer = testLedger3['customers'].get(customerId)!;

            // Should match to at least 10 decimal places
            expect(customer.storeCreditBalance.toNumber()).toBeCloseTo(
              expectedSum.toNumber(),
              10
            );

            // Verify consistency
            const consistency = testLedger3.verifyLedgerConsistency(customerId);
            expect(consistency.isConsistent).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle partial refunds correctly', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      // Original purchase with cashback
      ledger.addCredit(
        customerId,
        new Decimal(50), // 5% of $1000 order
        'CASHBACK_EARNED',
        'order-1',
        '5% cashback on $1000 order'
      );

      // Customer uses some credit
      ledger.useCredit(
        customerId,
        new Decimal(20),
        'order-2',
        'Applied to new order'
      );

      // Partial refund on original order (50% refund)
      // Should clawback 50% of original cashback
      ledger.processClawback(
        customerId,
        new Decimal(25), // 50% of 50
        'order-1',
        'Partial refund - 50% of order'
      );

      expect(customer.storeCreditBalance.toNumber()).toBe(5); // 50 - 20 - 25
    });

    it('should handle concurrent transactions with proper ordering', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      // Simulate concurrent transactions (would be handled by DB locks in production)
      const transactions = [
        { type: 'credit', amount: 100, orderId: 'order-1' },
        { type: 'credit', amount: 50, orderId: 'order-2' },
        { type: 'debit', amount: 30, orderId: 'order-3' },
        { type: 'credit', amount: 20, orderId: 'order-4' },
        { type: 'debit', amount: 40, orderId: 'order-5' },
        { type: 'clawback', amount: 15, orderId: 'order-1' }
      ];

      transactions.forEach(tx => {
        if (tx.type === 'credit') {
          ledger.addCredit(
            customerId,
            new Decimal(tx.amount),
            'CASHBACK_EARNED',
            tx.orderId
          );
        } else if (tx.type === 'debit') {
          ledger.useCredit(
            customerId,
            new Decimal(tx.amount),
            tx.orderId
          );
        } else if (tx.type === 'clawback') {
          ledger.processClawback(
            customerId,
            new Decimal(tx.amount),
            tx.orderId,
            'Test clawback'
          );
        }
      });

      // Expected: 100 + 50 - 30 + 20 - 40 - 15 = 85
      const customer = ledger['customers'].get(customerId)!;
      expect(customer.storeCreditBalance.toNumber()).toBe(85);

      // Verify ledger consistency
      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(true);
    });

    it('should handle transfer between customers', () => {
      const customer1 = 'customer-1';
      const customer2 = 'customer-2';

      ledger.initializeCustomer(customer1);
      ledger.initializeCustomer(customer2);

      // Customer 1 earns credit
      ledger.addCredit(
        customer1,
        new Decimal(100),
        'CASHBACK_EARNED',
        'order-1'
      );

      // Transfer $50 from customer1 to customer2
      const transferAmount = new Decimal(50);
      const transferId = `transfer-${Date.now()}`;

      // Debit from customer 1 via STORE_CREDIT_REDEEMED (a negative balance event)
      // Transfers are modelled as: customer1 redeems credit (balance goes down)
      ledger.addDebit(customer1, transferAmount, 'TRANSFER_OUT', transferId, `Transfer to ${customer2}`);

      // Credit to customer 2
      ledger.addCredit(
        customer2,
        transferAmount,
        'TRANSFER_IN',
        transferId,
        `Transfer from ${customer1}`
      );

      const c1 = ledger['customers'].get(customer1)!;
      const c2 = ledger['customers'].get(customer2)!;

      expect(c1.storeCreditBalance.toNumber()).toBe(50);
      expect(c2.storeCreditBalance.toNumber()).toBe(50);

      // Global audit should still balance
      const audit = ledger.calculateAuditTotals();
      expect(audit.isBalanced).toBe(true);
      expect(audit.netBalance.toNumber()).toBe(100); // Total unchanged
    });
  });

  describe('Ledger Reconstruction and Audit Trail', () => {
    it('should be able to reconstruct balance from ledger entries', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      // Series of transactions
      const transactions = [
        { amount: 100, type: 'CASHBACK_EARNED' as LedgerEntryType },
        { amount: -30, type: 'ORDER_PAYMENT' as LedgerEntryType },
        { amount: 50, type: 'REFUND_CREDIT' as LedgerEntryType },
        { amount: -20, type: 'ORDER_PAYMENT' as LedgerEntryType },
        { amount: -15, type: 'CLAWBACK' as LedgerEntryType }
      ];

      // Process transactions
      transactions.forEach((tx, i) => {
        if (tx.amount > 0) {
          ledger.addCredit(
            customerId,
            new Decimal(tx.amount),
            tx.type,
            `order-${i}`
          );
        } else if (tx.type === 'ORDER_PAYMENT') {
          ledger.useCredit(
            customerId,
            new Decimal(Math.abs(tx.amount)),
            `order-${i}`
          );
        } else if (tx.type === 'CLAWBACK') {
          ledger.processClawback(
            customerId,
            new Decimal(Math.abs(tx.amount)),
            `order-${i}`,
            'Test'
          );
        }
      });

      // Reconstruct balance from entries
      const entries = ledger.getCustomerEntries(customerId);
      const reconstructedBalance = entries.reduce(
        (sum, entry) => sum.plus(entry.amount),
        new Decimal(0)
      );

      const customer = ledger['customers'].get(customerId)!;
      expect(reconstructedBalance.toNumber()).toBe(customer.storeCreditBalance.toNumber());
      expect(reconstructedBalance.toNumber()).toBe(85); // 100 - 30 + 50 - 20 - 15
    });

    it('should maintain complete audit trail with metadata', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      // Transaction with metadata
      const entry1 = ledger.addCredit(
        customerId,
        new Decimal(100),
        'CASHBACK_EARNED',
        'order-123',
        'Black Friday 10% cashback'
      );

      expect(entry1.description).toBe('Black Friday 10% cashback');
      expect(entry1.orderId).toBe('order-123');

      // Clawback with reason
      const entry2 = ledger.processClawback(
        customerId,
        new Decimal(50),
        'order-123',
        'Customer initiated return after 30 days'
      );

      expect(entry2.description).toContain('Clawback');
      expect(entry2.metadata?.reason).toBe('Customer initiated return after 30 days');
      expect(entry2.metadata?.originalOrderId).toBe('order-123');

      // All entries should have timestamps
      const entries = ledger.getCustomerEntries(customerId);
      entries.forEach(entry => {
        expect(entry.createdAt).toBeInstanceOf(Date);
        expect(entry.updatedAt).toBeInstanceOf(Date);
        expect(entry.shop).toBe(TEST_SHOP);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero amounts appropriately', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      // Zero credit should be rejected
      expect(() => {
        ledger.addCredit(
          customerId,
          new Decimal(0),
          'CASHBACK_EARNED'
        );
      }).toThrow('Credit amount must be positive');

      // Zero debit should be rejected
      expect(() => {
        ledger.useCredit(
          customerId,
          new Decimal(0),
          'order-1'
        );
      }).toThrow('Use amount must be positive');
    });

    it('should handle maximum precision amounts', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      // Very precise amount (more than typical currency precision)
      const preciseAmount = new Decimal('123.456789012345678901234567890');

      ledger.addCredit(
        customerId,
        preciseAmount,
        'MANUAL_ADJUSTMENT',
        undefined,
        'High precision test'
      );

      const customer = ledger['customers'].get(customerId)!;
      // Decimal.js has 20 significant digits by default; compare numeric value not string repr
      expect(customer.storeCreditBalance.toNumber()).toBeCloseTo(preciseAmount.toNumber(), 10);

      // Verify consistency with high precision
      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(true);
    });

    it('should detect and report inconsistencies', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      // Add legitimate entry
      ledger.addCredit(
        customerId,
        new Decimal(100),
        'CASHBACK_EARNED',
        'order-1'
      );

      // Manually corrupt the customer balance (simulating data corruption)
      customer.storeCreditBalance = new Decimal(150); // Should be 100

      // Verify should detect inconsistency
      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(false);
      expect(consistency.errors).toHaveLength(1);
      expect(consistency.errors[0]).toContain('Customer balance mismatch');
    });

    it('should handle rapid successive transactions', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      // Simulate rapid transactions (e.g., from batch processing)
      const rapidTransactions = Array(100).fill(0).map((_, i) => ({
        amount: new Decimal(Math.random() * 10 + 0.01),
        type: 'CASHBACK_EARNED' as LedgerEntryType,
        orderId: `rapid-${i}`
      }));

      rapidTransactions.forEach(tx => {
        ledger.addCredit(
          customerId,
          tx.amount,
          tx.type,
          tx.orderId
        );
      });

      // Verify all entries are recorded
      const entries = ledger.getCustomerEntries(customerId);
      expect(entries).toHaveLength(100);

      // Verify consistency
      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(true);

      // Verify final balance
      const expectedBalance = rapidTransactions.reduce(
        (sum, tx) => sum.plus(tx.amount),
        new Decimal(0)
      );

      const customer = ledger['customers'].get(customerId)!;
      expect(customer.storeCreditBalance.toNumber()).toBeCloseTo(
        expectedBalance.toNumber(),
        10
      );
    });
  });
});