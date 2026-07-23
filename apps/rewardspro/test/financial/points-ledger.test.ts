import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import fc from 'fast-check';

// Points ledger types matching Prisma schema
type PointsLedgerType =
  | 'ORDER_EARNED'
  | 'CHALLENGE_COMPLETED'
  | 'SPIN_WHEEL_WIN'
  | 'SCRATCH_CARD_WIN'
  | 'MYSTERY_BOX_WIN'
  | 'BONUS_EVENT'
  | 'REFERRAL_BONUS'
  | 'MANUAL_CREDIT'
  | 'STREAK_BONUS'
  | 'RAFFLE_ENTRY'
  | 'MYSTERY_BOX_OPEN'
  | 'PREMIUM_SPIN'
  | 'GIVEBACK_DONATION'
  | 'MANUAL_DEBIT'
  | 'EXPIRATION'
  | 'REFUND_CLAWBACK'
  | 'SYSTEM_ADJUSTMENT';

interface PointsLedgerEntry {
  id: string;
  customerId: string;
  shop: string;
  type: PointsLedgerType;
  amount: number; // Integer — positive for earn, negative for spend
  balance: number; // Running balance after this entry
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date | null;
}

interface PointsCustomer {
  id: string;
  shop: string;
  pointsBalance: number;
  lifetimePoints: number;
}

/**
 * In-memory Points Ledger for property-based testing.
 * Mirrors the real service's invariants:
 * - All amounts are integers
 * - Balance = sum of all transaction amounts
 * - Balance >= 0 (spends throw on insufficient)
 * - Lifetime points are monotonically non-decreasing
 */
class PointsLedgerService {
  private entries: PointsLedgerEntry[] = [];
  private customers: Map<string, PointsCustomer> = new Map();
  private readonly shop: string;

  constructor(shop: string) {
    this.shop = shop;
  }

  initializeCustomer(customerId: string): PointsCustomer {
    const customer: PointsCustomer = {
      id: customerId,
      shop: this.shop,
      pointsBalance: 0,
      lifetimePoints: 0,
    };
    this.customers.set(customerId, customer);
    return customer;
  }

  getCustomer(customerId: string): PointsCustomer | undefined {
    return this.customers.get(customerId);
  }

  earnPoints(
    customerId: string,
    amount: number,
    type: PointsLedgerType = 'MANUAL_CREDIT',
    description?: string,
  ): PointsLedgerEntry {
    if (!Number.isInteger(amount)) {
      throw new Error('Points must be whole numbers');
    }
    if (amount <= 0) {
      throw new Error('Earn amount must be positive');
    }

    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const newBalance = customer.pointsBalance + amount;

    const entry: PointsLedgerEntry = {
      id: uuidv4(),
      customerId,
      shop: this.shop,
      type,
      amount,
      balance: newBalance,
      description: description ?? null,
      metadata: null,
      createdAt: new Date(),
      expiresAt: null,
    };

    this.entries.push(entry);
    customer.pointsBalance = newBalance;
    customer.lifetimePoints += amount;

    return entry;
  }

  spendPoints(
    customerId: string,
    amount: number,
    type: PointsLedgerType = 'MANUAL_DEBIT',
    description?: string,
  ): PointsLedgerEntry {
    if (!Number.isInteger(amount)) {
      throw new Error('Points must be whole numbers');
    }
    if (amount <= 0) {
      throw new Error('Spend amount must be positive');
    }

    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    if (customer.pointsBalance < amount) {
      throw new Error(
        `Insufficient points balance. Required: ${amount}, Available: ${customer.pointsBalance}`,
      );
    }

    const newBalance = customer.pointsBalance - amount;

    const entry: PointsLedgerEntry = {
      id: uuidv4(),
      customerId,
      shop: this.shop,
      type,
      amount: -amount, // Negative for spending
      balance: newBalance,
      description: description ?? null,
      metadata: null,
      createdAt: new Date(),
      expiresAt: null,
    };

    this.entries.push(entry);
    customer.pointsBalance = newBalance;
    // Lifetime points NOT decremented on spend

    return entry;
  }

  adjustPoints(
    customerId: string,
    amount: number,
    reason: string,
  ): PointsLedgerEntry {
    if (amount > 0) {
      return this.earnPoints(customerId, amount, 'MANUAL_CREDIT', reason);
    } else if (amount < 0) {
      return this.spendPoints(customerId, Math.abs(amount), 'MANUAL_DEBIT', reason);
    }
    throw new Error('Amount must not be zero');
  }

  getCustomerEntries(customerId: string): PointsLedgerEntry[] {
    return this.entries.filter((e) => e.customerId === customerId);
  }

  verifyLedgerConsistency(customerId: string): {
    isConsistent: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const customerEntries = this.getCustomerEntries(customerId);

    if (customerEntries.length === 0) {
      return { isConsistent: true, errors: [] };
    }

    const sorted = [...customerEntries].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    // Verify balance chain
    let calculatedBalance = 0;
    for (const entry of sorted) {
      calculatedBalance += entry.amount;

      if (calculatedBalance !== entry.balance) {
        errors.push(
          `Balance mismatch at entry ${entry.id}: calculated ${calculatedBalance}, recorded ${entry.balance}`,
        );
      }

      // All amounts must be integers
      if (!Number.isInteger(entry.amount)) {
        errors.push(`Non-integer amount at entry ${entry.id}: ${entry.amount}`);
      }
      if (!Number.isInteger(entry.balance)) {
        errors.push(`Non-integer balance at entry ${entry.id}: ${entry.balance}`);
      }
    }

    // Final balance must match customer record
    const customer = this.customers.get(customerId);
    if (customer && calculatedBalance !== customer.pointsBalance) {
      errors.push(
        `Customer balance mismatch: ledger sum ${calculatedBalance}, customer record ${customer.pointsBalance}`,
      );
    }

    // Balance must be non-negative
    if (customer && customer.pointsBalance < 0) {
      errors.push(`Negative balance: ${customer.pointsBalance}`);
    }

    return { isConsistent: errors.length === 0, errors };
  }
}

// ============================================
// TESTS
// ============================================

describe('Points Ledger - Integer Bookkeeping', () => {
  let ledger: PointsLedgerService;
  const TEST_SHOP = 'test-shop.myshopify.com';

  beforeEach(() => {
    ledger = new PointsLedgerService(TEST_SHOP);
  });

  describe('Basic Ledger Operations', () => {
    it('should earn points and update balance + lifetime', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      ledger.earnPoints(customerId, 100, 'ORDER_EARNED', 'Order purchase');

      expect(customer.pointsBalance).toBe(100);
      expect(customer.lifetimePoints).toBe(100);
    });

    it('should spend points and update balance but NOT lifetime', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      ledger.earnPoints(customerId, 100, 'ORDER_EARNED');
      ledger.spendPoints(customerId, 30, 'RAFFLE_ENTRY');

      expect(customer.pointsBalance).toBe(70);
      expect(customer.lifetimePoints).toBe(100); // Unchanged
    });

    it('should maintain balance chain through earn and spend', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      ledger.earnPoints(customerId, 100, 'ORDER_EARNED');
      ledger.earnPoints(customerId, 50, 'CHALLENGE_COMPLETED');
      ledger.spendPoints(customerId, 30, 'RAFFLE_ENTRY');
      ledger.earnPoints(customerId, 25, 'REFERRAL_BONUS');

      const consistency = ledger.verifyLedgerConsistency(customerId);
      expect(consistency.isConsistent).toBe(true);
      expect(consistency.errors).toHaveLength(0);
    });

    it('should throw on insufficient balance for spend', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);
      ledger.earnPoints(customerId, 50, 'ORDER_EARNED');

      expect(() => {
        ledger.spendPoints(customerId, 60, 'RAFFLE_ENTRY');
      }).toThrow('Insufficient points balance');
    });

    it('should throw on non-integer earn amount', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      expect(() => {
        ledger.earnPoints(customerId, 10.5, 'MANUAL_CREDIT');
      }).toThrow('Points must be whole numbers');
    });

    it('should throw on non-integer spend amount', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);
      ledger.earnPoints(customerId, 100, 'ORDER_EARNED');

      expect(() => {
        ledger.spendPoints(customerId, 10.5, 'MANUAL_DEBIT');
      }).toThrow('Points must be whole numbers');
    });

    it('should throw on zero earn', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      expect(() => {
        ledger.earnPoints(customerId, 0, 'MANUAL_CREDIT');
      }).toThrow('Earn amount must be positive');
    });

    it('should throw on negative earn', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      expect(() => {
        ledger.earnPoints(customerId, -10, 'MANUAL_CREDIT');
      }).toThrow('Earn amount must be positive');
    });

    it('should throw on customer not found', () => {
      expect(() => {
        ledger.earnPoints('nonexistent', 100, 'MANUAL_CREDIT');
      }).toThrow('Customer not found');
    });
  });

  describe('adjustPoints dispatching', () => {
    it('should dispatch positive amounts to earnPoints', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);

      ledger.adjustPoints(customerId, 100, 'Admin bonus');

      expect(customer.pointsBalance).toBe(100);
      expect(customer.lifetimePoints).toBe(100);
    });

    it('should dispatch negative amounts to spendPoints', () => {
      const customerId = 'customer-1';
      const customer = ledger.initializeCustomer(customerId);
      ledger.earnPoints(customerId, 200, 'ORDER_EARNED');

      ledger.adjustPoints(customerId, -50, 'Admin correction');

      expect(customer.pointsBalance).toBe(150);
      expect(customer.lifetimePoints).toBe(200);
    });

    it('should throw on zero amount', () => {
      const customerId = 'customer-1';
      ledger.initializeCustomer(customerId);

      expect(() => {
        ledger.adjustPoints(customerId, 0, 'Invalid');
      }).toThrow('Amount must not be zero');
    });
  });

  describe('Multi-customer operations', () => {
    it('should track independent balances per customer', () => {
      const c1 = 'customer-1';
      const c2 = 'customer-2';
      const cust1 = ledger.initializeCustomer(c1);
      const cust2 = ledger.initializeCustomer(c2);

      ledger.earnPoints(c1, 100, 'ORDER_EARNED');
      ledger.earnPoints(c2, 200, 'CHALLENGE_COMPLETED');
      ledger.spendPoints(c1, 30, 'RAFFLE_ENTRY');

      expect(cust1.pointsBalance).toBe(70);
      expect(cust2.pointsBalance).toBe(200);

      const consistency1 = ledger.verifyLedgerConsistency(c1);
      const consistency2 = ledger.verifyLedgerConsistency(c2);
      expect(consistency1.isConsistent).toBe(true);
      expect(consistency2.isConsistent).toBe(true);
    });
  });

  describe('Property-Based Testing - Points Ledger Invariants', () => {
    // Each property callback must create a fresh ledger to avoid accumulating
    // state across fc.assert iterations (beforeEach only runs once per `it`).

    it('balance = sum of all transaction amounts', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              customerId: fc.constantFrom('c1', 'c2', 'c3'),
              operation: fc.constantFrom('earn', 'spend'),
              amount: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 1, maxLength: 50 },
          ),
          (transactions) => {
            const fresh = new PointsLedgerService(TEST_SHOP);
            const customerIds = [...new Set(transactions.map((t) => t.customerId))];
            customerIds.forEach((id) => fresh.initializeCustomer(id));

            for (const tx of transactions) {
              const customer = fresh.getCustomer(tx.customerId)!;
              if (tx.operation === 'earn') {
                fresh.earnPoints(tx.customerId, tx.amount, 'MANUAL_CREDIT');
              } else if (customer.pointsBalance >= tx.amount) {
                fresh.spendPoints(tx.customerId, tx.amount, 'MANUAL_DEBIT');
              }
            }

            for (const customerId of customerIds) {
              const entries = fresh.getCustomerEntries(customerId);
              const sumOfAmounts = entries.reduce((sum, e) => sum + e.amount, 0);
              const customer = fresh.getCustomer(customerId)!;
              expect(customer.pointsBalance).toBe(sumOfAmounts);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('balance >= 0 (no negative balances)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              operation: fc.constantFrom('earn', 'spend'),
              amount: fc.integer({ min: 1, max: 500 }),
            }),
            { minLength: 1, maxLength: 30 },
          ),
          (transactions) => {
            const fresh = new PointsLedgerService(TEST_SHOP);
            const customerId = 'c1';
            fresh.initializeCustomer(customerId);

            for (const tx of transactions) {
              const customer = fresh.getCustomer(customerId)!;
              if (tx.operation === 'earn') {
                fresh.earnPoints(customerId, tx.amount, 'MANUAL_CREDIT');
              } else if (customer.pointsBalance >= tx.amount) {
                fresh.spendPoints(customerId, tx.amount, 'MANUAL_DEBIT');
              }
            }

            const customer = fresh.getCustomer(customerId)!;
            expect(customer.pointsBalance).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('lifetime points monotonically non-decreasing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              operation: fc.constantFrom('earn', 'spend'),
              amount: fc.integer({ min: 1, max: 500 }),
            }),
            { minLength: 1, maxLength: 30 },
          ),
          (transactions) => {
            const fresh = new PointsLedgerService(TEST_SHOP);
            const customerId = 'c1';
            fresh.initializeCustomer(customerId);
            let previousLifetime = 0;

            for (const tx of transactions) {
              const customer = fresh.getCustomer(customerId)!;
              if (tx.operation === 'earn') {
                fresh.earnPoints(customerId, tx.amount, 'MANUAL_CREDIT');
              } else if (customer.pointsBalance >= tx.amount) {
                fresh.spendPoints(customerId, tx.amount, 'MANUAL_DEBIT');
              }

              expect(customer.lifetimePoints).toBeGreaterThanOrEqual(previousLifetime);
              previousLifetime = customer.lifetimePoints;
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('all amounts and balances are integers (catches Decimal leak)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              operation: fc.constantFrom('earn', 'spend'),
              amount: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 1, maxLength: 30 },
          ),
          (transactions) => {
            const fresh = new PointsLedgerService(TEST_SHOP);
            const customerId = 'c1';
            fresh.initializeCustomer(customerId);

            for (const tx of transactions) {
              const customer = fresh.getCustomer(customerId)!;
              if (tx.operation === 'earn') {
                fresh.earnPoints(customerId, tx.amount, 'MANUAL_CREDIT');
              } else if (customer.pointsBalance >= tx.amount) {
                fresh.spendPoints(customerId, tx.amount, 'MANUAL_DEBIT');
              }
            }

            const entries = fresh.getCustomerEntries(customerId);
            for (const entry of entries) {
              expect(Number.isInteger(entry.amount)).toBe(true);
              expect(Number.isInteger(entry.balance)).toBe(true);
            }

            const customer = fresh.getCustomer(customerId)!;
            expect(Number.isInteger(customer.pointsBalance)).toBe(true);
            expect(Number.isInteger(customer.lifetimePoints)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('spend fails when amount > balance', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 500 }),
          (earnAmount, excess) => {
            const fresh = new PointsLedgerService(TEST_SHOP);
            const customerId = 'c1';
            fresh.initializeCustomer(customerId);
            fresh.earnPoints(customerId, earnAmount, 'MANUAL_CREDIT');

            const overAmount = earnAmount + excess;
            expect(() => {
              fresh.spendPoints(customerId, overAmount, 'MANUAL_DEBIT');
            }).toThrow('Insufficient points balance');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('ledger consistency holds after all random operations', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              customerId: fc.constantFrom('c1', 'c2'),
              operation: fc.constantFrom('earn', 'spend'),
              amount: fc.integer({ min: 1, max: 500 }),
            }),
            { minLength: 5, maxLength: 50 },
          ),
          (transactions) => {
            const fresh = new PointsLedgerService(TEST_SHOP);
            const customerIds = [...new Set(transactions.map((t) => t.customerId))];
            customerIds.forEach((id) => fresh.initializeCustomer(id));

            for (const tx of transactions) {
              const customer = fresh.getCustomer(tx.customerId)!;
              if (tx.operation === 'earn') {
                fresh.earnPoints(tx.customerId, tx.amount, 'MANUAL_CREDIT');
              } else if (customer.pointsBalance >= tx.amount) {
                fresh.spendPoints(tx.customerId, tx.amount, 'MANUAL_DEBIT');
              }
            }

            for (const customerId of customerIds) {
              const result = fresh.verifyLedgerConsistency(customerId);
              expect(result.isConsistent).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
