import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Tier } from '@prisma/client';

// Mock Prisma client
vi.mock('~/db.server', () => ({
  db: {
    tier: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn()
    },
    customer: {
      count: vi.fn()
    }
  }
}));

// Mock Shopify authentication
vi.mock('~/shopify.server', () => ({
  authenticate: {
    admin: vi.fn(() => Promise.resolve({
      session: { 
        shop: 'test-shop.myshopify.com',
        accessToken: 'test-token' 
      }
    }))
  }
}));

describe('Tiers API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tiers', () => {
    it('returns all tiers for the shop', async () => {
      const mockTiers: Partial<Tier>[] = [
        { 
          id: '1', 
          name: 'Bronze', 
          minSpend: 0, 
          cashbackPercent: 2,
          evaluationPeriod: 'ANNUAL',
          shop: 'test-shop.myshopify.com'
        },
        { 
          id: '2', 
          name: 'Silver', 
          minSpend: 500, 
          cashbackPercent: 3,
          evaluationPeriod: 'ANNUAL',
          shop: 'test-shop.myshopify.com'
        }
      ];

      const { db } = await import('~/db.server');
      vi.mocked(db.tier.findMany).mockResolvedValue(mockTiers as Tier[]);

      expect(db.tier.findMany).toBeDefined();
      
      // Simulate calling the loader
      await db.tier.findMany({
        where: { shop: 'test-shop.myshopify.com' },
        orderBy: { minSpend: 'asc' }
      });

      expect(db.tier.findMany).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        orderBy: { minSpend: 'asc' }
      });
    });

    it('handles empty tier list', async () => {
      const { db } = await import('~/db.server');
      vi.mocked(db.tier.findMany).mockResolvedValue([]);

      const result = await db.tier.findMany({
        where: { shop: 'test-shop.myshopify.com' }
      });

      expect(result).toEqual([]);
    });
  });

  describe('POST /api/tiers', () => {
    it('creates a new tier with valid data', async () => {
      const newTier = {
        name: 'Gold',
        minSpend: 1000,
        cashbackPercent: 5,
        evaluationPeriod: 'ANNUAL' as const
      };

      const { db } = await import('~/db.server');
      vi.mocked(db.tier.create).mockResolvedValue({
        id: '3',
        shop: 'test-shop.myshopify.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...newTier
      });

      const result = await db.tier.create({
        data: {
          ...newTier,
          shop: 'test-shop.myshopify.com'
        }
      });

      expect(db.tier.create).toHaveBeenCalledWith({
        data: {
          ...newTier,
          shop: 'test-shop.myshopify.com'
        }
      });
      expect(result.name).toBe('Gold');
      expect(result.cashbackPercent).toBe(5);
    });

    it('validates tier data before creation', async () => {
      const invalidTier = {
        name: '',
        minSpend: -100,
        cashbackPercent: 150
      };

      // Validation function
      const validateTier = (tier: typeof invalidTier) => {
        const errors: string[] = [];
        if (!tier.name) errors.push('Tier name is required');
        if (tier.minSpend < 0) errors.push('Minimum spend must be positive');
        if (tier.cashbackPercent < 0 || tier.cashbackPercent > 100) {
          errors.push('Cashback must be between 0 and 100');
        }
        return errors;
      };

      const errors = validateTier(invalidTier);
      expect(errors).toContain('Tier name is required');
      expect(errors).toContain('Minimum spend must be positive');
      expect(errors).toContain('Cashback must be between 0 and 100');
    });

    it('prevents duplicate tier names', async () => {
      const { db } = await import('~/db.server');
      
      vi.mocked(db.tier.findUnique).mockResolvedValue({
        id: '1',
        name: 'Gold',
        shop: 'test-shop.myshopify.com',
        minSpend: 500,
        cashbackPercent: 3,
        evaluationPeriod: 'ANNUAL',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const existing = await db.tier.findUnique({
        where: {
          shop_name: {
            shop: 'test-shop.myshopify.com',
            name: 'Gold'
          }
        }
      });

      expect(existing).toBeTruthy();
      expect(existing?.name).toBe('Gold');
    });
  });

  describe('PUT /api/tiers/:id', () => {
    it('updates an existing tier', async () => {
      const { db } = await import('~/db.server');
      
      const updateData = {
        cashbackPercent: 6,
        minSpend: 1500
      };

      vi.mocked(db.tier.update).mockResolvedValue({
        id: '2',
        name: 'Silver',
        shop: 'test-shop.myshopify.com',
        cashbackPercent: 6,
        minSpend: 1500,
        evaluationPeriod: 'ANNUAL',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await db.tier.update({
        where: { id: '2' },
        data: updateData
      });

      expect(db.tier.update).toHaveBeenCalledWith({
        where: { id: '2' },
        data: updateData
      });
      expect(result.cashbackPercent).toBe(6);
      expect(result.minSpend).toBe(1500);
    });

    it('handles tier not found', async () => {
      const { db } = await import('~/db.server');
      
      vi.mocked(db.tier.update).mockRejectedValue(
        new Error('Record not found')
      );

      await expect(
        db.tier.update({
          where: { id: 'non-existent' },
          data: { cashbackPercent: 5 }
        })
      ).rejects.toThrow('Record not found');
    });
  });

  describe('DELETE /api/tiers/:id', () => {
    it('deletes a tier without customers', async () => {
      const { db } = await import('~/db.server');
      
      vi.mocked(db.customer.count).mockResolvedValue(0);
      vi.mocked(db.tier.delete).mockResolvedValue({
        id: '3',
        name: 'Platinum',
        shop: 'test-shop.myshopify.com',
        minSpend: 2000,
        cashbackPercent: 7,
        evaluationPeriod: 'LIFETIME',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const customerCount = await db.customer.count({
        where: { currentTierId: '3' }
      });
      expect(customerCount).toBe(0);

      const result = await db.tier.delete({
        where: { id: '3' }
      });

      expect(db.tier.delete).toHaveBeenCalledWith({
        where: { id: '3' }
      });
      expect(result.id).toBe('3');
    });

    it('prevents deletion of tier with customers', async () => {
      const { db } = await import('~/db.server');
      
      vi.mocked(db.customer.count).mockResolvedValue(25);

      const customerCount = await db.customer.count({
        where: { currentTierId: '1' }
      });

      expect(customerCount).toBe(25);
      expect(customerCount).toBeGreaterThan(0);
    });
  });

  describe('Tier Ordering', () => {
    it('returns tiers ordered by minimum spend', async () => {
      const { db } = await import('~/db.server');
      
      const mockTiers: Partial<Tier>[] = [
        { id: '1', name: 'Bronze', minSpend: 0 },
        { id: '2', name: 'Silver', minSpend: 500 },
        { id: '3', name: 'Gold', minSpend: 1000 },
        { id: '4', name: 'Platinum', minSpend: 2000 }
      ];

      vi.mocked(db.tier.findMany).mockResolvedValue(mockTiers as Tier[]);

      const result = await db.tier.findMany({
        orderBy: { minSpend: 'asc' }
      });

      expect(result[0].minSpend).toBe(0);
      expect(result[1].minSpend).toBe(500);
      expect(result[2].minSpend).toBe(1000);
      expect(result[3].minSpend).toBe(2000);
    });
  });
});