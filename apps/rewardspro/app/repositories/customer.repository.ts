// Customer repository with caching and optimized queries
import { BaseRepository, QueryOptions } from './base.repository';
import type { Customer, Tier, StoreCreditLedger, Prisma } from '@prisma/client';
import db from '~/db.server';
import { v4 as uuidv4 } from 'uuid';

export interface CustomerWithRelations extends Customer {
  currentTier?: Tier | null;
  creditLedger?: StoreCreditLedger[];
}

export interface CreateCustomerInput {
  shopifyCustomerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string;
  storeCredit?: number;
  currentTierId?: string;
}

export interface UpdateCustomerInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string;
  storeCredit?: number;
  currentTierId?: string | null;
}

export class CustomerRepository extends BaseRepository<CustomerWithRelations> {
  constructor(shop: string) {
    super(shop);
    this.cacheTimeout = 3 * 60 * 1000; // 3 minutes for customer data
  }
  
  async findAll(options: QueryOptions = {}): Promise<CustomerWithRelations[]> {
    const cacheKey = this.getCacheKey('findAll', options);
    const cached = this.getFromCache(cacheKey);
    
    if (cached && Array.isArray(cached)) {
      return cached as CustomerWithRelations[];
    }
    
    try {
      const where: Prisma.CustomerWhereInput = {
        shop: this.shop,
        ...options.where,
      };
      
      // Add search query if provided
      if (options.query) {
        where.OR = [
          { email: { contains: options.query, mode: 'insensitive' } },
          { shopifyCustomerId: { contains: options.query, mode: 'insensitive' } },
          { firstName: { contains: options.query, mode: 'insensitive' } },
          { lastName: { contains: options.query, mode: 'insensitive' } },
        ];
      }
      
      const customers = await db.customer.findMany({
        where,
        include: {
          currentTier: true,
        },
        orderBy: options.sortKey ? {
          [options.sortKey]: options.reverse ? 'desc' : 'asc'
        } : { createdAt: 'desc' },
        skip: options.skip,
        take: options.take || options.first || 100,
      });
      
      // Serialize decimals
      const serialized = customers.map(c => ({
        ...c,
        storeCredit: this.serializeDecimal(c.storeCredit),
      })) as CustomerWithRelations[];
      
      this.setCache(cacheKey, serialized);
      return serialized;
    } catch (error) {
      console.error('[CustomerRepository] findAll error:', error);
      throw error;
    }
  }
  
  async findById(id: string): Promise<CustomerWithRelations | null> {
    const cacheKey = this.getCacheKey('findById', { id });
    const cached = this.getFromCache(cacheKey);
    
    if (cached && !Array.isArray(cached)) {
      return cached as CustomerWithRelations;
    }
    
    try {
      const customer = await db.customer.findFirst({
        where: {
          id,
          shop: this.shop,
        },
        include: {
          currentTier: true,
          creditLedger: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
      
      if (!customer) return null;
      
      // Serialize decimals
      const serialized = {
        ...customer,
        storeCredit: this.serializeDecimal(customer.storeCredit),
        creditLedger: customer.creditLedger?.map((entry: any) => ({
          ...entry,
          amount: this.serializeDecimal(entry.amount),
          balance: this.serializeDecimal(entry.balance),
        })),
      } as CustomerWithRelations;
      
      this.setCache(cacheKey, serialized);
      return serialized;
    } catch (error) {
      console.error('[CustomerRepository] findById error:', error);
      throw error;
    }
  }
  
  async findByShopifyId(shopifyCustomerId: string): Promise<CustomerWithRelations | null> {
    const cacheKey = this.getCacheKey('findByShopifyId', { shopifyCustomerId });
    const cached = this.getFromCache(cacheKey);
    
    if (cached && !Array.isArray(cached)) {
      return cached as CustomerWithRelations;
    }
    
    try {
      const customer = await db.customer.findFirst({
        where: {
          shopifyCustomerId,
          shop: this.shop,
        },
        include: {
          currentTier: true,
        },
      });
      
      if (!customer) return null;
      
      const serialized = {
        ...customer,
        storeCredit: this.serializeDecimal(customer.storeCredit),
      } as CustomerWithRelations;
      
      this.setCache(cacheKey, serialized);
      return serialized;
    } catch (error) {
      console.error('[CustomerRepository] findByShopifyId error:', error);
      throw error;
    }
  }
  
  async create(input: Partial<CustomerWithRelations> | CreateCustomerInput): Promise<CustomerWithRelations> {
    try {
      const customer = await db.customer.create({
        data: {
          id: uuidv4(),
          shop: this.shop,
          shopifyCustomerId: input.shopifyCustomerId,
          email: (input.email || '').toLowerCase(),
          firstName: input.firstName || '',
          lastName: input.lastName || '',
          phone: input.phone || '',
          tags: input.tags || '',
          storeCredit: input.storeCredit || 0,
          currentTierId: input.currentTierId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        include: {
          currentTier: true,
        },
      });
      
      // Invalidate list cache
      this.invalidateCache('findAll');
      
      return {
        ...customer,
        storeCredit: this.serializeDecimal(customer.storeCredit),
      } as CustomerWithRelations;
    } catch (error) {
      console.error('[CustomerRepository] create error:', error);
      throw error;
    }
  }
  
  async update(id: string, input: Partial<CustomerWithRelations> | UpdateCustomerInput): Promise<CustomerWithRelations> {
    try {
      // Verify ownership
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error('Customer not found');
      }
      
      const customer = await db.customer.update({
        where: {
          id,
          shop: this.shop, // Extra safety check
        },
        data: {
          ...input,
          email: input.email?.toLowerCase(),
          updatedAt: new Date(),
        },
        include: {
          currentTier: true,
        },
      });
      
      // Invalidate cache for this customer and lists
      this.invalidateCache(id);
      this.invalidateCache('findAll');
      
      return {
        ...customer,
        storeCredit: this.serializeDecimal(customer.storeCredit),
      } as CustomerWithRelations;
    } catch (error) {
      console.error('[CustomerRepository] update error:', error);
      throw error;
    }
  }
  
  async updateStoreCredit(
    id: string,
    amount: number,
    type: string,
    metadata?: any
  ): Promise<CustomerWithRelations> {
    try {
      // Use transaction for consistency
      const result = await db.$transaction(async (tx) => {
        // Get current customer
        const customer = await tx.customer.findFirst({
          where: { id, shop: this.shop },
        });
        
        if (!customer) {
          throw new Error('Customer not found');
        }
        
        const currentBalance = parseFloat(customer.storeCredit.toString());
        const newBalance = currentBalance + amount;
        
        // Update customer balance
        const updated = await tx.customer.update({
          where: { id },
          data: {
            storeCredit: newBalance,
            updatedAt: new Date(),
          },
          include: {
            currentTier: true,
          },
        });
        
        // Create ledger entry
        await tx.storeCreditLedger.create({
          data: {
            id: uuidv4(),
            customerId: id,
            shop: this.shop,
            amount,
            balance: newBalance,
            type: type as any,
            metadata: metadata || {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        
        return updated;
      });
      
      // Invalidate cache
      this.invalidateCache(id);
      
      return {
        ...result,
        storeCredit: this.serializeDecimal(result.storeCredit),
      } as CustomerWithRelations;
    } catch (error) {
      console.error('[CustomerRepository] updateStoreCredit error:', error);
      throw error;
    }
  }
  
  async delete(id: string): Promise<boolean> {
    try {
      // Verify ownership before deletion
      const existing = await this.findById(id);
      if (!existing) {
        return false;
      }
      
      await db.customer.deleteMany({
        where: {
          id,
          shop: this.shop,
        },
      });
      
      // Invalidate all cache
      this.invalidateCache();
      
      return true;
    } catch (error) {
      console.error('[CustomerRepository] delete error:', error);
      throw error;
    }
  }
  
  // Batch operations
  async findByIds(ids: string[]): Promise<CustomerWithRelations[]> {
    try {
      const customers = await db.customer.findMany({
        where: {
          id: { in: ids },
          shop: this.shop,
        },
        include: {
          currentTier: true,
        },
      });
      
      return customers.map(c => ({
        ...c,
        storeCredit: this.serializeDecimal(c.storeCredit),
      })) as CustomerWithRelations[];
    } catch (error) {
      console.error('[CustomerRepository] findByIds error:', error);
      throw error;
    }
  }
  
  /**
   * @deprecated This function bypasses the tier resolution system and should NOT be used.
   *
   * Direct tier updates can override purchased or subscription tiers with spending-based tiers.
   * Use `updateCustomerToEffectiveTier()` from tier-resolution.server.ts instead for each customer.
   *
   * This function is kept for reference but has no callers in the codebase.
   */
  async bulkUpdateTiers(updates: Array<{ id: string; tierId: string | null }>): Promise<void> {
    try {
      // Use transaction for atomic updates
      await db.$transaction(async (tx) => {
        for (const update of updates) {
          await tx.customer.update({
            where: {
              id: update.id,
              shop: this.shop,
            },
            data: {
              currentTierId: update.tierId,
              updatedAt: new Date(),
            },
          });
        }
      });
      
      // Invalidate all cache
      this.invalidateCache();
    } catch (error) {
      console.error('[CustomerRepository] bulkUpdateTiers error:', error);
      throw error;
    }
  }
  
  // Analytics queries
  async getStats(): Promise<{
    total: number;
    withTiers: number;
    withoutTiers: number;
    totalStoreCredit: number;
  }> {
    const cacheKey = this.getCacheKey('getStats', {});
    const cached = this.getFromCache(cacheKey);
    
    if (cached && !Array.isArray(cached)) {
      return cached as any;
    }
    
    try {
      const [total, withTiers, withoutTiers, creditSum] = await Promise.all([
        db.customer.count({ where: { shop: this.shop } }),
        db.customer.count({ where: { shop: this.shop, currentTierId: { not: null } } }),
        db.customer.count({ where: { shop: this.shop, currentTierId: null } }),
        db.customer.aggregate({
          where: { shop: this.shop },
          _sum: { storeCredit: true },
        }),
      ]);
      
      const stats = {
        total,
        withTiers,
        withoutTiers,
        totalStoreCredit: this.serializeDecimal(creditSum._sum.storeCredit),
      };
      
      this.setCache(cacheKey, stats as any);
      return stats;
    } catch (error) {
      console.error('[CustomerRepository] getStats error:', error);
      throw error;
    }
  }
}