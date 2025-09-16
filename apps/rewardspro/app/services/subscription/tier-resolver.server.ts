/**
 * Tier Resolver Service
 * Manages tier conflicts when customers have multiple tier sources
 * (spending-based vs subscription-based)
 */

import { db } from "~/db.server";
import type { Tier, Customer, TierSubscription } from "@prisma/client";

export interface TierResolutionResult {
  effectiveTier: Tier | null;
  source: 'SUBSCRIPTION' | 'SPENDING' | 'DEFAULT' | 'NONE';
  conflictResolved: boolean;
  details: {
    subscriptionTier?: Tier;
    spendingTier?: Tier;
    defaultTier?: Tier;
    activeSubscriptions: number;
    currentSpending: number;
  };
}

export interface TierConflictStrategy {
  priority: ('SUBSCRIPTION' | 'SPENDING' | 'HIGHEST' | 'CUSTOM')[];
  customResolver?: (customer: any, tiers: any) => Promise<Tier | null>;
}

const DEFAULT_STRATEGY: TierConflictStrategy = {
  priority: ['SUBSCRIPTION', 'HIGHEST', 'SPENDING'],
};

export class TierResolver {
  /**
   * Get the effective tier for a customer considering all sources
   */
  static async getEffectiveTier(
    customerId: string,
    strategy: TierConflictStrategy = DEFAULT_STRATEGY
  ): Promise<TierResolutionResult> {
    // Fetch customer with all tier relationships
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: {
        currentTier: true,
        tierSubscriptions: {
          where: { 
            status: { in: ['ACTIVE', 'PAUSED'] }
          },
          include: { tier: true },
          orderBy: { createdAt: 'desc' }
        },
        creditLedger: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!customer) {
      return {
        effectiveTier: null,
        source: 'NONE',
        conflictResolved: false,
        details: {
          activeSubscriptions: 0,
          currentSpending: 0,
        }
      };
    }

    // Get all possible tiers
    const subscriptionTier = await this.getHighestSubscriptionTier(customer.tierSubscriptions);
    const spendingTier = customer.currentTier;
    const defaultTier = await this.getDefaultTier(customer.shop);

    // Calculate current spending for context
    const currentSpending = await this.calculateCustomerSpending(customerId);

    // Apply resolution strategy
    let effectiveTier: Tier | null = null;
    let source: TierResolutionResult['source'] = 'NONE';

    for (const prioritySource of strategy.priority) {
      switch (prioritySource) {
        case 'SUBSCRIPTION':
          if (subscriptionTier) {
            effectiveTier = subscriptionTier;
            source = 'SUBSCRIPTION';
          }
          break;
        
        case 'SPENDING':
          if (spendingTier) {
            effectiveTier = spendingTier;
            source = 'SPENDING';
          }
          break;
        
        case 'HIGHEST':
          const highest = await this.getHighestTier([subscriptionTier, spendingTier].filter(Boolean) as Tier[]);
          if (highest) {
            effectiveTier = highest;
            source = subscriptionTier === highest ? 'SUBSCRIPTION' : 'SPENDING';
          }
          break;
        
        case 'CUSTOM':
          if (strategy.customResolver) {
            effectiveTier = await strategy.customResolver(customer, {
              subscriptionTier,
              spendingTier,
              defaultTier
            });
            source = 'SPENDING'; // Or determine based on result
          }
          break;
      }

      if (effectiveTier) break;
    }

    // Fallback to default if no tier found
    if (!effectiveTier && defaultTier) {
      effectiveTier = defaultTier;
      source = 'DEFAULT';
    }

    // Check if there was a conflict
    const hasConflict = !!(subscriptionTier && spendingTier && subscriptionTier.id !== spendingTier.id);

    return {
      effectiveTier,
      source,
      conflictResolved: hasConflict,
      details: {
        subscriptionTier: subscriptionTier || undefined,
        spendingTier: spendingTier || undefined,
        defaultTier: defaultTier || undefined,
        activeSubscriptions: customer.tierSubscriptions.filter(s => s.status === 'ACTIVE').length,
        currentSpending,
      }
    };
  }

  /**
   * Update customer's effective tier based on resolution
   */
  static async updateEffectiveTier(
    customerId: string,
    strategy?: TierConflictStrategy
  ): Promise<void> {
    const resolution = await this.getEffectiveTier(customerId, strategy);
    
    if (resolution.effectiveTier) {
      await db.customer.update({
        where: { id: customerId },
        data: {
          currentTierId: resolution.effectiveTier.id,
          updatedAt: new Date(),
        }
      });

      // Log the resolution if there was a conflict
      if (resolution.conflictResolved) {
        await db.tierChangeLog.create({
          data: {
            id: crypto.randomUUID(),
            customerId,
            shop: resolution.effectiveTier.shop,
            fromTierId: resolution.details.spendingTier?.id || null,
            toTierId: resolution.effectiveTier.id,
            fromTierName: resolution.details.spendingTier?.name || null,
            toTierName: resolution.effectiveTier.name,
            changeType: 'UPGRADE',
            triggerType: 'MANUAL_ADMIN',
            metadata: {
              conflictResolution: {
                hadConflict: true,
                source: resolution.source,
                subscriptionTier: resolution.details.subscriptionTier?.name,
                spendingTier: resolution.details.spendingTier?.name,
                resolved: resolution.effectiveTier.name,
              }
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        });
      }
    }
  }

  /**
   * Get the highest tier from active subscriptions
   */
  private static async getHighestSubscriptionTier(
    subscriptions: (TierSubscription & { tier: Tier })[]
  ): Promise<Tier | null> {
    if (!subscriptions || subscriptions.length === 0) {
      return null;
    }

    // Filter active subscriptions
    const activeSubscriptions = subscriptions.filter(s => s.status === 'ACTIVE');
    
    if (activeSubscriptions.length === 0) {
      // Check paused subscriptions if configured to maintain access
      const pausedSubscriptions = subscriptions.filter(s => s.status === 'PAUSED');
      if (pausedSubscriptions.length > 0) {
        // Could check configuration here for MAINTAIN_ACCESS_ON_PAUSE
        return pausedSubscriptions[0].tier;
      }
      return null;
    }

    // Return tier with highest benefits (could be cashback percentage or other criteria)
    return activeSubscriptions.reduce((highest, current) => {
      if (!highest) return current.tier;
      
      // Compare by cashback percentage (or other business logic)
      if (current.tier.cashbackPercent > highest.cashbackPercent) {
        return current.tier;
      }
      
      return highest;
    }, null as Tier | null);
  }

  /**
   * Get the highest tier from a list
   */
  private static async getHighestTier(tiers: Tier[]): Promise<Tier | null> {
    if (!tiers || tiers.length === 0) {
      return null;
    }

    return tiers.reduce((highest, current) => {
      if (!highest) return current;
      
      // Compare by cashback percentage
      if (current.cashbackPercent > highest.cashbackPercent) {
        return current;
      }
      
      // If same cashback, prefer the one with lower spending requirement
      if (current.cashbackPercent === highest.cashbackPercent && 
          current.minSpend < highest.minSpend) {
        return current;
      }
      
      return highest;
    });
  }

  /**
   * Get the default tier for a shop
   */
  private static async getDefaultTier(shop: string): Promise<Tier | null> {
    return await db.tier.findFirst({
      where: {
        shop,
        minSpend: 0, // Assuming default tier has 0 minimum spend
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  /**
   * Calculate customer's total spending
   */
  private static async calculateCustomerSpending(
    customerId: string,
    period: 'ANNUAL' | 'LIFETIME' = 'LIFETIME'
  ): Promise<number> {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: {
        creditLedger: {
          where: {
            type: 'CASHBACK_EARNED',
            createdAt: period === 'ANNUAL' ? {
              gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            } : undefined
          }
        }
      }
    });

    if (!customer) return 0;

    // Sum up spending from ledger entries
    // Assuming cashback earned entries contain order amount in metadata
    let totalSpending = 0;
    
    for (const entry of customer.creditLedger) {
      const metadata = entry.metadata as any;
      if (metadata?.orderAmount) {
        totalSpending += parseFloat(metadata.orderAmount);
      }
    }

    return totalSpending;
  }

  /**
   * Resolve conflicts for all customers in a shop
   */
  static async resolveAllConflicts(
    shop: string,
    strategy?: TierConflictStrategy
  ): Promise<{
    processed: number;
    resolved: number;
    errors: string[];
  }> {
    const customers = await db.customer.findMany({
      where: { 
        shop,
        OR: [
          { currentTierId: { not: null } },
          { 
            tierSubscriptions: {
              some: { status: 'ACTIVE' }
            }
          }
        ]
      },
      select: { id: true }
    });

    let processed = 0;
    let resolved = 0;
    const errors: string[] = [];

    for (const customer of customers) {
      try {
        const resolution = await this.getEffectiveTier(customer.id, strategy);
        
        if (resolution.conflictResolved) {
          await this.updateEffectiveTier(customer.id, strategy);
          resolved++;
        }
        
        processed++;
      } catch (error) {
        errors.push(`Failed to resolve tier for customer ${customer.id}: ${error}`);
      }
    }

    return { processed, resolved, errors };
  }

  /**
   * Monitor for tier conflicts and alert
   */
  static async detectConflicts(shop: string): Promise<Array<{
    customerId: string;
    customerEmail: string;
    subscriptionTier: string;
    spendingTier: string;
  }>> {
    const customersWithConflicts = await db.customer.findMany({
      where: {
        shop,
        currentTierId: { not: null },
        tierSubscriptions: {
          some: { status: 'ACTIVE' }
        }
      },
      include: {
        currentTier: true,
        tierSubscriptions: {
          where: { status: 'ACTIVE' },
          include: { tier: true }
        }
      }
    });

    const conflicts = [];

    for (const customer of customersWithConflicts) {
      const subscriptionTier = customer.tierSubscriptions[0]?.tier;
      const spendingTier = customer.currentTier;

      if (subscriptionTier && spendingTier && subscriptionTier.id !== spendingTier.id) {
        conflicts.push({
          customerId: customer.id,
          customerEmail: customer.email,
          subscriptionTier: subscriptionTier.name,
          spendingTier: spendingTier.name,
        });
      }
    }

    return conflicts;
  }
}