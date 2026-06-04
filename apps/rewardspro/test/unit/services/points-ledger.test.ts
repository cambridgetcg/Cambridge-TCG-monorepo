import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing the service
vi.mock('~/db.server', () => {
  const mockTransaction = vi.fn(async (fn: (tx: any) => Promise<any>) => {
    return fn(mockPrisma);
  });

  const createModelMock = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn(),
  });

  const mockPrisma: Record<string, any> = {
    customer: createModelMock(),
    pointsLedger: createModelMock(),
    pointsConfig: createModelMock(),
    $transaction: mockTransaction,
  };

  return { default: mockPrisma };
});

// Mock points-config dependencies
vi.mock('~/services/points-config.server', () => ({
  getPointsConfig: vi.fn().mockResolvedValue({
    isEnabled: true,
    currencyName: 'Stars',
    currencyNamePlural: 'Stars',
    currencyIcon: '⭐',
    pointsPerDollar: 10,
    roundingMode: 'FLOOR',
    pointsExpire: false,
    expirationDays: 365,
    expirationWarningDays: 30,
  }),
  calculateExpirationDate: vi.fn().mockResolvedValue(null),
  isPointsEnabled: vi.fn().mockResolvedValue(true),
}));

import db from '~/db.server';
import {
  earnPoints,
  spendPoints,
  adjustPoints,
  getPointsBalance,
  getTransactionHistory,
} from '~/services/points-ledger.server';
import { isPointsEnabled } from '~/services/points-config.server';

const mockDb = db as any;

describe('Points Ledger Service (mocked DB)', () => {
  const TEST_SHOP = 'test.myshopify.com';
  const TEST_CUSTOMER_ID = 'cust-123';

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: points enabled
    (isPointsEnabled as any).mockResolvedValue(true);
  });

  describe('earnPoints', () => {
    it('should create ledger entry and update customer balance + lifetime', async () => {
      mockDb.customer.findFirst.mockResolvedValue({
        pointsBalance: 50,
        lifetimePoints: 100,
      });

      mockDb.pointsLedger.create.mockResolvedValue({
        id: 'entry-1',
        amount: 25,
        balance: 75,
        type: 'ORDER_EARNED',
        description: 'Purchase reward',
        createdAt: new Date('2026-01-01'),
        expiresAt: null,
        metadata: null,
      });

      // Refactored earn path: atomic { increment } on both balances via update,
      // selecting { pointsBalance, shop } — the shop is a cross-shop write guard.
      mockDb.customer.update.mockResolvedValue({ pointsBalance: 75, shop: TEST_SHOP });

      const result = await earnPoints({
        customerId: TEST_CUSTOMER_ID,
        shop: TEST_SHOP,
        amount: 25,
        type: 'ORDER_EARNED',
        description: 'Purchase reward',
      });

      expect(result.id).toBe('entry-1');
      expect(result.amount).toBe(25);
      expect(result.balance).toBe(75);
      expect(result.type).toBe('ORDER_EARNED');

      // Earn increments both balances atomically at the DB layer (no read-modify-write).
      expect(mockDb.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEST_CUSTOMER_ID },
          data: expect.objectContaining({
            pointsBalance: { increment: 25 },
            lifetimePoints: { increment: 25 },
          }),
        }),
      );
    });

    it('should throw when points system is disabled', async () => {
      (isPointsEnabled as any).mockResolvedValue(false);

      await expect(
        earnPoints({
          customerId: TEST_CUSTOMER_ID,
          shop: TEST_SHOP,
          amount: 100,
          type: 'ORDER_EARNED',
        }),
      ).rejects.toThrow('Points system is not enabled');
    });

    it('should throw when customer not found', async () => {
      // Refactored earn has no pre-read: a missing customer makes `update`
      // throw Prisma P2025, which is caught and surfaced as "Customer not found".
      mockDb.customer.update.mockRejectedValue(
        Object.assign(new Error('No record was found for an update.'), { code: 'P2025' }),
      );
      mockDb.customer.findFirst.mockResolvedValue(null);

      await expect(
        earnPoints({
          customerId: TEST_CUSTOMER_ID,
          shop: TEST_SHOP,
          amount: 100,
          type: 'ORDER_EARNED',
        }),
      ).rejects.toThrow('Customer not found');
    });
  });

  describe('spendPoints', () => {
    it('should create negative ledger entry and update balance', async () => {
      mockDb.customer.findFirst.mockResolvedValue({
        pointsBalance: 100,
      });

      mockDb.pointsLedger.create.mockResolvedValue({
        id: 'entry-2',
        amount: -30,
        balance: 70,
        type: 'RAFFLE_ENTRY',
        description: 'Raffle entry',
        createdAt: new Date('2026-01-01'),
        expiresAt: null,
        metadata: null,
      });

      // Refactored spend path: atomic conditional decrement via updateMany
      // (returns { count }), then read the committed balance via findUnique.
      mockDb.customer.updateMany.mockResolvedValue({ count: 1 });
      mockDb.customer.findUnique.mockResolvedValue({ pointsBalance: 70 });

      const result = await spendPoints({
        customerId: TEST_CUSTOMER_ID,
        shop: TEST_SHOP,
        amount: 30,
        type: 'RAFFLE_ENTRY',
        description: 'Raffle entry',
      });

      expect(result.amount).toBe(-30);
      expect(result.balance).toBe(70);

      // Spend is an atomic conditional decrement guarded by the live balance,
      // and must NEVER touch lifetimePoints — a debit cannot inflate lifetime totals.
      expect(mockDb.customer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pointsBalance: { gte: 30 } }),
          data: { pointsBalance: { decrement: 30 } },
        }),
      );
    });

    it('should throw on insufficient balance', async () => {
      // updateMany matches zero rows when the live balance is below the
      // requested spend (the `gte` guard fails), so count === 0 → the
      // insufficient branch re-reads via findFirst for an accurate message.
      mockDb.customer.updateMany.mockResolvedValue({ count: 0 });
      mockDb.customer.findFirst.mockResolvedValue({
        pointsBalance: 20,
      });

      await expect(
        spendPoints({
          customerId: TEST_CUSTOMER_ID,
          shop: TEST_SHOP,
          amount: 50,
          type: 'RAFFLE_ENTRY',
        }),
      ).rejects.toThrow('Insufficient points balance');
    });
  });

  describe('adjustPoints', () => {
    it('should dispatch positive amounts as earn (MANUAL_CREDIT)', async () => {
      mockDb.customer.findFirst.mockResolvedValue({
        pointsBalance: 0,
        lifetimePoints: 0,
      });

      mockDb.pointsLedger.create.mockResolvedValue({
        id: 'entry-3',
        amount: 100,
        balance: 100,
        type: 'MANUAL_CREDIT',
        description: 'Admin bonus',
        createdAt: new Date('2026-01-01'),
        expiresAt: null,
        metadata: { adjustedBy: 'admin' },
      });

      mockDb.customer.update.mockResolvedValue({ pointsBalance: 100, shop: TEST_SHOP });

      const result = await adjustPoints(TEST_SHOP, TEST_CUSTOMER_ID, 100, 'Admin bonus', 'admin');

      expect(result.type).toBe('MANUAL_CREDIT');
      expect(result.amount).toBe(100);
    });

    it('should dispatch negative amounts as spend (MANUAL_DEBIT)', async () => {
      mockDb.customer.findFirst.mockResolvedValue({
        pointsBalance: 200,
      });

      mockDb.pointsLedger.create.mockResolvedValue({
        id: 'entry-4',
        amount: -50,
        balance: 150,
        type: 'MANUAL_DEBIT',
        description: 'Error correction',
        createdAt: new Date('2026-01-01'),
        expiresAt: null,
        metadata: { adjustedBy: 'admin' },
      });

      // Negative adjust dispatches to spendPoints (atomic conditional decrement).
      mockDb.customer.updateMany.mockResolvedValue({ count: 1 });
      mockDb.customer.findUnique.mockResolvedValue({ pointsBalance: 150 });

      const result = await adjustPoints(TEST_SHOP, TEST_CUSTOMER_ID, -50, 'Error correction', 'admin');

      expect(result.type).toBe('MANUAL_DEBIT');
      expect(result.amount).toBe(-50);
    });
  });

  describe('getPointsBalance', () => {
    it('should return zeros for non-existent customer', async () => {
      mockDb.customer.findFirst.mockResolvedValue(null);

      const balance = await getPointsBalance('nonexistent', TEST_SHOP);

      expect(balance.available).toBe(0);
      expect(balance.lifetime).toBe(0);
      expect(balance.expiringSoon).toBe(0);
    });

    it('should return correct balance breakdown', async () => {
      mockDb.customer.findFirst.mockResolvedValue({
        pointsBalance: 500,
        lifetimePoints: 1000,
      });

      // Expiring entries
      mockDb.pointsLedger.findMany.mockResolvedValue([
        { amount: 50 },
        { amount: 30 },
      ]);

      const balance = await getPointsBalance(TEST_CUSTOMER_ID, TEST_SHOP);

      expect(balance.available).toBe(500);
      expect(balance.lifetime).toBe(1000);
      expect(balance.expiringSoon).toBe(80);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return paginated transactions', async () => {
      const mockEntries = [
        {
          id: 'e1',
          amount: 100,
          balance: 100,
          type: 'ORDER_EARNED',
          description: 'Order #1001',
          createdAt: new Date('2026-01-15'),
          expiresAt: null,
          metadata: null,
        },
        {
          id: 'e2',
          amount: -30,
          balance: 70,
          type: 'RAFFLE_ENTRY',
          description: 'Raffle entry',
          createdAt: new Date('2026-01-16'),
          expiresAt: null,
          metadata: null,
        },
      ];

      mockDb.pointsLedger.findMany.mockResolvedValue(mockEntries);
      mockDb.pointsLedger.count.mockResolvedValue(2);

      const result = await getTransactionHistory(TEST_CUSTOMER_ID, TEST_SHOP, { limit: 25 });

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.transactions[0].id).toBe('e1');
    });

    it('should filter by type', async () => {
      mockDb.pointsLedger.findMany.mockResolvedValue([]);
      mockDb.pointsLedger.count.mockResolvedValue(0);

      await getTransactionHistory(TEST_CUSTOMER_ID, TEST_SHOP, { type: 'ORDER_EARNED' });

      expect(mockDb.pointsLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'ORDER_EARNED' }),
        }),
      );
    });
  });
});
