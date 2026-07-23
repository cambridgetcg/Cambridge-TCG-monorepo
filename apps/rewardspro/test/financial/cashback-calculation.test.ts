import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import fc from 'fast-check';

// Types matching the application's schema
interface Tier {
  id: string;
  name: string;
  cashbackPercentage: Decimal;
  minimumSpend: Decimal;
  maximumSpend?: Decimal;
  multiplier?: Decimal;
  minimumOrders?: number;
  evaluationPeriod: 'ANNUAL' | 'LIFETIME';
}

interface Order {
  id: string;
  customerId: string;
  subtotal: Decimal;
  tax: Decimal;
  shipping: Decimal;
  discount: Decimal;
  total: Decimal;
  currency: string;
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: Decimal;
  discount: Decimal;
  taxable: boolean;
  eligibleForCashback: boolean;
}

interface CashbackCalculation {
  orderId: string;
  customerId: string;
  tier: Tier;
  eligibleAmount: Decimal;
  cashbackPercentage: Decimal;
  cashbackAmount: Decimal;
  cappedAmount?: Decimal;
  excludedAmount?: Decimal;
  metadata: Record<string, any>;
}

// Cashback Calculation Service
class CashbackService {
  private readonly tiers: Map<string, Tier> = new Map();
  private readonly maxCashbackPerOrder: Decimal;
  private readonly minCashbackAmount: Decimal;
  private readonly excludedCategories: Set<string>;

  constructor() {
    this.maxCashbackPerOrder = new Decimal(500); // Cap per order
    this.minCashbackAmount = new Decimal(0.01); // Minimum cashback
    this.excludedCategories = new Set(['gift-cards', 'shipping', 'taxes']);
  }

  addTier(tier: Tier): void {
    this.tiers.set(tier.id, tier);
  }

  calculateCashback(
    order: Order,
    tierId: string,
    options: {
      applyMultiplier?: boolean;
      excludeDiscountedItems?: boolean;
      includeShipping?: boolean;
      includeTax?: boolean;
      customExclusions?: string[];
    } = {}
  ): CashbackCalculation {
    const tier = this.tiers.get(tierId);
    if (!tier) {
      throw new Error(`Tier ${tierId} not found`);
    }

    // Calculate eligible amount
    let eligibleAmount = this.calculateEligibleAmount(order, options);

    // Apply tier percentage
    let cashbackPercentage = tier.cashbackPercentage;

    // Apply multiplier if enabled
    if (options.applyMultiplier && tier.multiplier) {
      cashbackPercentage = cashbackPercentage.times(tier.multiplier);
    }

    // Calculate raw cashback
    let cashbackAmount = eligibleAmount
      .times(cashbackPercentage)
      .div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // Cap at order total (rounding can push cashback above total for tiny orders)
    if (cashbackAmount.gt(order.total)) {
      cashbackAmount = order.total.toDecimalPlaces(2, Decimal.ROUND_FLOOR);
    }

    // Apply caps
    let cappedAmount: Decimal | undefined;
    if (cashbackAmount.gt(this.maxCashbackPerOrder)) {
      cappedAmount = cashbackAmount;
      cashbackAmount = this.maxCashbackPerOrder;
    }

    // Apply minimum threshold
    if (cashbackAmount.lt(this.minCashbackAmount) && cashbackAmount.gt(0)) {
      cashbackAmount = new Decimal(0);
    }

    return {
      orderId: order.id,
      customerId: order.customerId,
      tier,
      eligibleAmount,
      cashbackPercentage,
      cashbackAmount,
      cappedAmount,
      excludedAmount: order.total.minus(eligibleAmount),
      metadata: {
        multiplierApplied: options.applyMultiplier && tier.multiplier,
        itemsProcessed: order.items.length,
        currency: order.currency
      }
    };
  }

  private calculateEligibleAmount(
    order: Order,
    options: {
      excludeDiscountedItems?: boolean;
      includeShipping?: boolean;
      includeTax?: boolean;
      customExclusions?: string[];
    }
  ): Decimal {
    let eligibleAmount = new Decimal(0);

    // Process items
    for (const item of order.items) {
      if (!item.eligibleForCashback) {
        continue;
      }

      if (options.excludeDiscountedItems && item.discount.gt(0)) {
        continue;
      }

      // Item subtotal after discount
      const itemTotal = item.price
        .times(item.quantity)
        .minus(item.discount);

      eligibleAmount = eligibleAmount.plus(itemTotal);
    }

    // Add shipping if included
    if (options.includeShipping) {
      eligibleAmount = eligibleAmount.plus(order.shipping);
    }

    // Add tax if included (unusual but some programs do this)
    if (options.includeTax) {
      eligibleAmount = eligibleAmount.plus(order.tax);
    }

    // Ensure we don't exceed order total
    if (eligibleAmount.gt(order.total)) {
      eligibleAmount = order.total;
    }

    return eligibleAmount;
  }

  calculateTieredCashback(
    order: Order,
    customerLifetimeSpend: Decimal
  ): CashbackCalculation {
    // Find appropriate tier based on lifetime spend
    let highestQualifiedTier: Tier | null = null;

    for (const tier of this.tiers.values()) {
      if (customerLifetimeSpend.gte(tier.minimumSpend)) {
        if (!tier.maximumSpend || customerLifetimeSpend.lt(tier.maximumSpend)) {
          if (!highestQualifiedTier ||
              tier.cashbackPercentage.gt(highestQualifiedTier.cashbackPercentage)) {
            highestQualifiedTier = tier;
          }
        }
      }
    }

    if (!highestQualifiedTier) {
      throw new Error('No qualifying tier found');
    }

    return this.calculateCashback(order, highestQualifiedTier.id);
  }

  // Calculate bonus cashback for special promotions
  calculatePromotionalCashback(
    order: Order,
    promoRules: {
      categoryBonuses?: Map<string, Decimal>;
      brandBonuses?: Map<string, Decimal>;
      minimumPurchase?: Decimal;
      bonusPercentage?: Decimal;
      stackable?: boolean;
    }
  ): Decimal {
    let bonusCashback = new Decimal(0);

    // Check minimum purchase requirement
    if (promoRules.minimumPurchase && order.total.lt(promoRules.minimumPurchase)) {
      return bonusCashback;
    }

    // Apply category and brand bonuses
    for (const item of order.items) {
      if (!item.eligibleForCashback) continue;

      const itemTotal = item.price.times(item.quantity).minus(item.discount);

      // Category bonus (would need category in real implementation)
      // Brand bonus (would need brand in real implementation)

      // General bonus percentage
      if (promoRules.bonusPercentage) {
        const bonus = itemTotal
          .times(promoRules.bonusPercentage)
          .div(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        bonusCashback = bonusCashback.plus(bonus);
      }
    }

    return bonusCashback;
  }
}

describe('Cashback Calculation Tests', () => {
  let cashbackService: CashbackService;

  beforeEach(() => {
    cashbackService = new CashbackService();

    // Setup test tiers
    cashbackService.addTier({
      id: 'bronze',
      name: 'Bronze',
      cashbackPercentage: new Decimal(1),
      minimumSpend: new Decimal(0),
      evaluationPeriod: 'LIFETIME'
    });

    cashbackService.addTier({
      id: 'silver',
      name: 'Silver',
      cashbackPercentage: new Decimal(2),
      minimumSpend: new Decimal(500),
      evaluationPeriod: 'LIFETIME'
    });

    cashbackService.addTier({
      id: 'gold',
      name: 'Gold',
      cashbackPercentage: new Decimal(3),
      minimumSpend: new Decimal(2000),
      multiplier: new Decimal(1.5), // 1.5x on special days
      evaluationPeriod: 'ANNUAL'
    });

    cashbackService.addTier({
      id: 'platinum',
      name: 'Platinum',
      cashbackPercentage: new Decimal(5),
      minimumSpend: new Decimal(5000),
      multiplier: new Decimal(2), // 2x on special days
      evaluationPeriod: 'ANNUAL'
    });
  });

  describe('Basic Cashback Calculations', () => {
    it('should calculate correct cashback for simple order', () => {
      const order: Order = {
        id: 'order-1',
        customerId: 'customer-1',
        subtotal: new Decimal(100),
        tax: new Decimal(10),
        shipping: new Decimal(5),
        discount: new Decimal(0),
        total: new Decimal(115),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 1,
            price: new Decimal(100),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'silver');

      expect(calculation.eligibleAmount.toNumber()).toBe(100);
      expect(calculation.cashbackPercentage.toNumber()).toBe(2);
      expect(calculation.cashbackAmount.toNumber()).toBe(2); // 2% of $100
    });

    it('should handle orders with mixed eligible/ineligible items', () => {
      const order: Order = {
        id: 'order-2',
        customerId: 'customer-1',
        subtotal: new Decimal(200),
        tax: new Decimal(20),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(220),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 1,
            price: new Decimal(100),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          },
          {
            id: 'item-2',
            productId: 'gift-card-1',
            quantity: 1,
            price: new Decimal(100),
            discount: new Decimal(0),
            taxable: false,
            eligibleForCashback: false // Gift cards not eligible
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'gold');

      expect(calculation.eligibleAmount.toNumber()).toBe(100); // Only first item
      expect(calculation.cashbackAmount.toNumber()).toBe(3); // 3% of $100
      expect(calculation.excludedAmount?.toNumber()).toBe(120); // Tax + gift card
    });

    it('should apply item-level discounts correctly', () => {
      const order: Order = {
        id: 'order-3',
        customerId: 'customer-1',
        subtotal: new Decimal(150),
        tax: new Decimal(13.5),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(163.5),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 2,
            price: new Decimal(50),
            discount: new Decimal(10), // $10 off total for this line
            taxable: true,
            eligibleForCashback: true
          },
          {
            id: 'item-2',
            productId: 'product-2',
            quantity: 1,
            price: new Decimal(60),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'silver');

      // Item 1: (50 * 2) - 10 = 90
      // Item 2: 60
      // Total eligible: 150
      expect(calculation.eligibleAmount.toNumber()).toBe(150);
      expect(calculation.cashbackAmount.toNumber()).toBe(3); // 2% of $150
    });
  });

  describe('Tier Multipliers and Special Promotions', () => {
    it('should apply tier multiplier when enabled', () => {
      const order: Order = {
        id: 'order-4',
        customerId: 'customer-1',
        subtotal: new Decimal(1000),
        tax: new Decimal(100),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(1100),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 1,
            price: new Decimal(1000),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      // Without multiplier
      const regularCalc = cashbackService.calculateCashback(order, 'gold');
      expect(regularCalc.cashbackPercentage.toNumber()).toBe(3);
      expect(regularCalc.cashbackAmount.toNumber()).toBe(30); // 3% of $1000

      // With multiplier (e.g., Black Friday)
      const multipliedCalc = cashbackService.calculateCashback(order, 'gold', {
        applyMultiplier: true
      });
      expect(multipliedCalc.cashbackPercentage.toNumber()).toBe(4.5); // 3% * 1.5
      expect(multipliedCalc.cashbackAmount.toNumber()).toBe(45); // 4.5% of $1000
    });

    it('should respect maximum cashback cap', () => {
      const order: Order = {
        id: 'order-5',
        customerId: 'customer-1',
        subtotal: new Decimal(20000),
        tax: new Decimal(2000),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(22000),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'luxury-item',
            quantity: 1,
            price: new Decimal(20000),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'platinum');

      // 5% of $20,000 = $1,000, but capped at $500
      expect(calculation.cashbackPercentage.toNumber()).toBe(5);
      expect(calculation.cappedAmount?.toNumber()).toBe(1000);
      expect(calculation.cashbackAmount.toNumber()).toBe(500); // Capped
    });

    it('should handle minimum cashback threshold', () => {
      const order: Order = {
        id: 'order-6',
        customerId: 'customer-1',
        subtotal: new Decimal(0.5), // Very small order
        tax: new Decimal(0.05),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(0.55),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'cheap-item',
            quantity: 1,
            price: new Decimal(0.5),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'bronze');

      // 1% of $0.50 = $0.005, rounds to $0.01 (ROUND_HALF_UP) = exactly at minimum threshold
      // Threshold check: lt(0.01) is false for 0.01, so cashback is kept
      expect(calculation.eligibleAmount.toNumber()).toBe(0.5);
      expect(calculation.cashbackAmount.toNumber()).toBe(0.01); // At threshold (not below)
    });
  });

  describe('Tiered Cashback Based on Lifetime Spend', () => {
    it('should select correct tier based on lifetime spend', () => {
      const order: Order = {
        id: 'order-7',
        customerId: 'customer-1',
        subtotal: new Decimal(100),
        tax: new Decimal(10),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(110),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 1,
            price: new Decimal(100),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      // Test different lifetime spend amounts
      const testCases = [
        { lifetimeSpend: 100, expectedTier: 'bronze', expectedCashback: 1 },
        { lifetimeSpend: 600, expectedTier: 'silver', expectedCashback: 2 },
        { lifetimeSpend: 2500, expectedTier: 'gold', expectedCashback: 3 },
        { lifetimeSpend: 6000, expectedTier: 'platinum', expectedCashback: 5 }
      ];

      testCases.forEach(testCase => {
        const calculation = cashbackService.calculateTieredCashback(
          order,
          new Decimal(testCase.lifetimeSpend)
        );

        expect(calculation.tier.id).toBe(testCase.expectedTier);
        expect(calculation.cashbackAmount.toNumber()).toBe(testCase.expectedCashback);
      });
    });
  });

  describe('Property-Based Testing for Cashback', () => {
    it('cashback should never exceed order total', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
          (orderAmount, cashbackPercentage) => {
            const tier: Tier = {
              id: 'test-tier',
              name: 'Test',
              cashbackPercentage: new Decimal(cashbackPercentage),
              minimumSpend: new Decimal(0),
              evaluationPeriod: 'LIFETIME'
            };
            cashbackService.addTier(tier);

            const order: Order = {
              id: 'test-order',
              customerId: 'test-customer',
              subtotal: new Decimal(orderAmount),
              tax: new Decimal(0),
              shipping: new Decimal(0),
              discount: new Decimal(0),
              total: new Decimal(orderAmount),
              currency: 'USD',
              items: [{
                id: 'test-item',
                productId: 'test-product',
                quantity: 1,
                price: new Decimal(orderAmount),
                discount: new Decimal(0),
                taxable: true,
                eligibleForCashback: true
              }]
            };

            const calculation = cashbackService.calculateCashback(order, 'test-tier');

            // Cashback should never exceed order total
            expect(calculation.cashbackAmount.lte(order.total)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cashback percentage should be consistent', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }),
          (orderAmounts, percentage) => {
            const tier: Tier = {
              id: 'consistent-tier',
              name: 'Consistent',
              cashbackPercentage: new Decimal(percentage),
              minimumSpend: new Decimal(0),
              evaluationPeriod: 'LIFETIME'
            };
            cashbackService.addTier(tier);

            const cashbackRatios = orderAmounts.map(amount => {
              const order: Order = {
                id: `order-${amount}`,
                customerId: 'customer-1',
                subtotal: new Decimal(amount),
                tax: new Decimal(0),
                shipping: new Decimal(0),
                discount: new Decimal(0),
                total: new Decimal(amount),
                currency: 'USD',
                items: [{
                  id: 'item-1',
                  productId: 'product-1',
                  quantity: 1,
                  price: new Decimal(amount),
                  discount: new Decimal(0),
                  taxable: true,
                  eligibleForCashback: true
                }]
              };

              const calc = cashbackService.calculateCashback(order, 'consistent-tier');

              // Calculate actual percentage (handling edge cases)
              if (calc.cashbackAmount.eq(0)) {
                return 0; // Below minimum threshold
              }
              if (calc.cappedAmount) {
                return -1; // Hit cap, exclude from comparison
              }

              return calc.cashbackAmount
                .times(100)
                .div(calc.eligibleAmount)
                .toNumber();
            });

            // All non-capped, non-threshold ratios should be equal
            const validRatios = cashbackRatios.filter(r => r > 0);
            if (validRatios.length > 1) {
              const expectedRatio = validRatios[0];
              validRatios.forEach(ratio => {
                expect(ratio).toBeCloseTo(expectedRatio, 1); // Within 0.05% — rounding on large amounts is negligible
              });
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('adding discounts should never increase cashback', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(50), noNaN: true }),
          fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }),
          (price, discount, cashbackPercentage) => {
            const tier: Tier = {
              id: 'discount-test',
              name: 'Discount Test',
              cashbackPercentage: new Decimal(cashbackPercentage),
              minimumSpend: new Decimal(0),
              evaluationPeriod: 'LIFETIME'
            };
            cashbackService.addTier(tier);

            // Order without discount
            const orderNoDiscount: Order = {
              id: 'order-no-discount',
              customerId: 'customer-1',
              subtotal: new Decimal(price),
              tax: new Decimal(0),
              shipping: new Decimal(0),
              discount: new Decimal(0),
              total: new Decimal(price),
              currency: 'USD',
              items: [{
                id: 'item-1',
                productId: 'product-1',
                quantity: 1,
                price: new Decimal(price),
                discount: new Decimal(0),
                taxable: true,
                eligibleForCashback: true
              }]
            };

            // Order with discount
            const effectiveDiscount = Math.min(discount, price * 0.9); // Max 90% off
            const orderWithDiscount: Order = {
              id: 'order-with-discount',
              customerId: 'customer-1',
              subtotal: new Decimal(price),
              tax: new Decimal(0),
              shipping: new Decimal(0),
              discount: new Decimal(0),
              total: new Decimal(price).minus(effectiveDiscount),
              currency: 'USD',
              items: [{
                id: 'item-1',
                productId: 'product-1',
                quantity: 1,
                price: new Decimal(price),
                discount: new Decimal(effectiveDiscount),
                taxable: true,
                eligibleForCashback: true
              }]
            };

            const calcNoDiscount = cashbackService.calculateCashback(
              orderNoDiscount,
              'discount-test'
            );
            const calcWithDiscount = cashbackService.calculateCashback(
              orderWithDiscount,
              'discount-test'
            );

            // Cashback should be less or equal with discount
            expect(
              calcWithDiscount.cashbackAmount.lte(calcNoDiscount.cashbackAmount)
            ).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Complex Order Scenarios', () => {
    it('should handle orders with multiple quantities correctly', () => {
      const order: Order = {
        id: 'order-multi-qty',
        customerId: 'customer-1',
        subtotal: new Decimal(500),
        tax: new Decimal(50),
        shipping: new Decimal(10),
        discount: new Decimal(0),
        total: new Decimal(560),
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 5, // 5 units at $50 each
            price: new Decimal(50),
            discount: new Decimal(25), // $25 total discount on this line
            taxable: true,
            eligibleForCashback: true
          },
          {
            id: 'item-2',
            productId: 'product-2',
            quantity: 10, // 10 units at $25 each
            price: new Decimal(25),
            discount: new Decimal(0),
            taxable: true,
            eligibleForCashback: true
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'gold');

      // Item 1: (50 * 5) - 25 = 225
      // Item 2: 25 * 10 = 250
      // Total: 475
      expect(calculation.eligibleAmount.toNumber()).toBe(475);
      expect(calculation.cashbackAmount.toNumber()).toBe(14.25); // 3% of $475
    });

    it('should handle mixed currencies correctly', () => {
      // Test that currency is tracked in metadata
      const orderUSD: Order = {
        id: 'order-usd',
        customerId: 'customer-1',
        subtotal: new Decimal(100),
        tax: new Decimal(10),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(110),
        currency: 'USD',
        items: [{
          id: 'item-1',
          productId: 'product-1',
          quantity: 1,
          price: new Decimal(100),
          discount: new Decimal(0),
          taxable: true,
          eligibleForCashback: true
        }]
      };

      const orderEUR: Order = {
        ...orderUSD,
        id: 'order-eur',
        currency: 'EUR'
      };

      const calcUSD = cashbackService.calculateCashback(orderUSD, 'silver');
      const calcEUR = cashbackService.calculateCashback(orderEUR, 'silver');

      expect(calcUSD.metadata.currency).toBe('USD');
      expect(calcEUR.metadata.currency).toBe('EUR');

      // Same percentage regardless of currency
      expect(calcUSD.cashbackPercentage.eq(calcEUR.cashbackPercentage)).toBe(true);
    });

    it('should handle bundle deals correctly', () => {
      const order: Order = {
        id: 'order-bundle',
        customerId: 'customer-1',
        subtotal: new Decimal(150),
        tax: new Decimal(15),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(165),
        currency: 'USD',
        items: [
          {
            id: 'bundle-1',
            productId: 'bundle-product',
            quantity: 1,
            price: new Decimal(150),
            discount: new Decimal(30), // Bundle discount
            taxable: true,
            eligibleForCashback: true
          },
          {
            id: 'free-item',
            productId: 'free-product',
            quantity: 1,
            price: new Decimal(0), // Free with bundle
            discount: new Decimal(0),
            taxable: false,
            eligibleForCashback: false
          }
        ]
      };

      const calculation = cashbackService.calculateCashback(order, 'gold');

      // Only the paid bundle item is eligible
      expect(calculation.eligibleAmount.toNumber()).toBe(120); // 150 - 30
      expect(calculation.cashbackAmount.toNumber()).toBe(3.6); // 3% of $120
    });
  });

  describe('Cashback with Tax and Shipping Options', () => {
    it('should include shipping when configured', () => {
      const order: Order = {
        id: 'order-shipping',
        customerId: 'customer-1',
        subtotal: new Decimal(100),
        tax: new Decimal(10),
        shipping: new Decimal(20),
        discount: new Decimal(0),
        total: new Decimal(130),
        currency: 'USD',
        items: [{
          id: 'item-1',
          productId: 'product-1',
          quantity: 1,
          price: new Decimal(100),
          discount: new Decimal(0),
          taxable: true,
          eligibleForCashback: true
        }]
      };

      // Without shipping
      const calcWithoutShipping = cashbackService.calculateCashback(order, 'silver');
      expect(calcWithoutShipping.eligibleAmount.toNumber()).toBe(100);
      expect(calcWithoutShipping.cashbackAmount.toNumber()).toBe(2);

      // With shipping
      const calcWithShipping = cashbackService.calculateCashback(order, 'silver', {
        includeShipping: true
      });
      expect(calcWithShipping.eligibleAmount.toNumber()).toBe(120); // 100 + 20
      expect(calcWithShipping.cashbackAmount.toNumber()).toBe(2.4); // 2% of $120
    });

    it('should include tax when configured (rare but exists)', () => {
      const order: Order = {
        id: 'order-tax',
        customerId: 'customer-1',
        subtotal: new Decimal(100),
        tax: new Decimal(8.25), // 8.25% tax
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(108.25),
        currency: 'USD',
        items: [{
          id: 'item-1',
          productId: 'product-1',
          quantity: 1,
          price: new Decimal(100),
          discount: new Decimal(0),
          taxable: true,
          eligibleForCashback: true
        }]
      };

      // With tax included (some international programs do this)
      const calcWithTax = cashbackService.calculateCashback(order, 'silver', {
        includeTax: true
      });
      expect(calcWithTax.eligibleAmount.toNumber()).toBe(108.25);
      expect(calcWithTax.cashbackAmount.toNumber()).toBe(2.17); // 2% of $108.25, rounded
    });
  });

  describe('Edge Cases and Precision', () => {
    it('should handle very small percentages correctly', () => {
      const tier: Tier = {
        id: 'micro',
        name: 'Micro',
        cashbackPercentage: new Decimal(0.01), // 0.01%
        minimumSpend: new Decimal(0),
        evaluationPeriod: 'LIFETIME'
      };
      cashbackService.addTier(tier);

      const order: Order = {
        id: 'order-micro',
        customerId: 'customer-1',
        subtotal: new Decimal(1000),
        tax: new Decimal(0),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(1000),
        currency: 'USD',
        items: [{
          id: 'item-1',
          productId: 'product-1',
          quantity: 1,
          price: new Decimal(1000),
          discount: new Decimal(0),
          taxable: true,
          eligibleForCashback: true
        }]
      };

      const calculation = cashbackService.calculateCashback(order, 'micro');
      expect(calculation.cashbackAmount.toNumber()).toBe(0.10); // 0.01% of $1000
    });

    it('should maintain precision with repeating decimals', () => {
      const tier: Tier = {
        id: 'repeating',
        name: 'Repeating',
        cashbackPercentage: new Decimal(100).div(3), // 33.333...%
        minimumSpend: new Decimal(0),
        evaluationPeriod: 'LIFETIME'
      };
      cashbackService.addTier(tier);

      const order: Order = {
        id: 'order-repeating',
        customerId: 'customer-1',
        subtotal: new Decimal(100),
        tax: new Decimal(0),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(100),
        currency: 'USD',
        items: [{
          id: 'item-1',
          productId: 'product-1',
          quantity: 1,
          price: new Decimal(100),
          discount: new Decimal(0),
          taxable: true,
          eligibleForCashback: true
        }]
      };

      const calculation = cashbackService.calculateCashback(order, 'repeating');

      // Should round to 2 decimal places
      expect(calculation.cashbackAmount.toNumber()).toBe(33.33);

      // Verify no precision loss in percentage storage
      expect(calculation.cashbackPercentage.toString()).toContain('33.3333');
    });

    it('should handle zero dollar orders', () => {
      const order: Order = {
        id: 'order-zero',
        customerId: 'customer-1',
        subtotal: new Decimal(0),
        tax: new Decimal(0),
        shipping: new Decimal(0),
        discount: new Decimal(0),
        total: new Decimal(0),
        currency: 'USD',
        items: [{
          id: 'item-1',
          productId: 'free-product',
          quantity: 1,
          price: new Decimal(0),
          discount: new Decimal(0),
          taxable: false,
          eligibleForCashback: false
        }]
      };

      const calculation = cashbackService.calculateCashback(order, 'gold');
      expect(calculation.cashbackAmount.toNumber()).toBe(0);
      expect(calculation.eligibleAmount.toNumber()).toBe(0);
    });
  });
});
