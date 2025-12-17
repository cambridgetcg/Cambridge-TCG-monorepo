/**
 * TierResolver Service
 * Manages the hybrid tier model - determines effective tier based on both earned and purchased tiers
 * Implements best practices from tier products guide
 *
 * @deprecated This service is being replaced by tier-state.server.ts which uses
 * the CustomerTierState model as a single source of truth. New code should use:
 * - tier-state.server.ts for tier state management
 * - tier-resolution.server.ts for resolution logic
 *
 * This file is kept for backward compatibility during migration.
 * TODO: Migrate remaining usages to tier-state.server.ts and delete this file.
 */

import db from '../db.server';
import { Tier, Customer, TierSubscription, TierPurchase } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';

interface TierWithDetails extends Tier {
  source: 'EARNED' | 'PURCHASED_SUBSCRIPTION' | 'PURCHASED_ONETIME';
  expiresAt?: Date | null;
}

export class TierResolver {
  /**
   * Determine the effective tier for a customer
   * Rules:
   * 1. Check for active purchased tiers (subscriptions or one-time purchases)
   * 2. Check for earned tier based on spending
   * 3. Return the tier with higher benefits (usually higher cashback percentage)
   */
  static async getEffectiveTier(customerId: string): Promise<TierWithDetails | null> {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: {
        currentTier: true,
        currentSubscription: {
          include: { tier: true }
        }
      }
    });

    if (!customer) {
      return null;
    }

    // 1. Check for active subscription-based tier
    const subscriptionTier = await this.getActiveSubscriptionTier(customerId);

    // 2. Check for active one-time purchased tier
    const purchasedTier = await this.getActivePurchasedTier(customerId);

    // 3. Get earned tier based on spending (excluding tier product purchases)
    const earnedTier = await this.getEarnedTier(customer);

    // 4. Compare all available tiers and return the best one
    const tiers: TierWithDetails[] = [];

    if (subscriptionTier) {
      tiers.push({
        ...subscriptionTier.tier,
        source: 'PURCHASED_SUBSCRIPTION',
        expiresAt: subscriptionTier.endDate
      });
    }

    if (purchasedTier) {
      tiers.push({
        ...purchasedTier.tier,
        source: 'PURCHASED_ONETIME',
        expiresAt: purchasedTier.endDate
      });
    }

    if (earnedTier) {
      tiers.push({
        ...earnedTier,
        source: 'EARNED',
        expiresAt: null
      });
    }

    // Return tier with highest cashback percentage (best benefits)
    if (tiers.length === 0) {
      return null;
    }

    return tiers.reduce((best, current) =>
      current.cashbackPercent > best.cashbackPercent ? current : best
    );
  }

  /**
   * Get active subscription-based tier
   */
  private static async getActiveSubscriptionTier(customerId: string) {
    return await db.tierSubscription.findFirst({
      where: {
        customerId,
        status: 'ACTIVE',
        OR: [
          { endDate: null }, // Lifetime subscription
          { endDate: { gte: new Date() } } // Not expired
        ]
      },
      include: { tier: true },
      orderBy: { tier: { cashbackPercent: 'desc' } } // Get best subscription if multiple
    });
  }

  /**
   * Get active one-time purchased tier
   */
  private static async getActivePurchasedTier(customerId: string) {
    return await db.tierPurchase.findFirst({
      where: {
        customerId,
        status: 'ACTIVE',
        OR: [
          { endDate: null }, // Lifetime purchase
          { endDate: { gte: new Date() } } // Not expired
        ]
      },
      include: { tier: true },
      orderBy: { tier: { cashbackPercent: 'desc' } } // Get best purchase if multiple
    });
  }

  /**
   * Calculate earned tier based on spending (excluding tier product purchases)
   * Supports both ANNUAL and LIFETIME evaluation periods
   */
  private static async getEarnedTier(customer: Customer): Promise<Tier | null> {
    const shop = customer.shop;

    // Get all tiers for this shop to check evaluation periods
    const tiers = await db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' }  // Order by lowest spend first (correct order)
    });

    // Check each tier to see if customer qualifies
    let highestQualifyingTier: Tier | null = null;

    for (const tier of tiers) {
      let qualifyingSpend: number;

      if (tier.evaluationPeriod === 'ANNUAL') {
        // Calculate spending in the last 12 months
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const orderStats = await db.order.aggregate({
          where: {
            shop,
            customerId: customer.id,
            financialStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
            cashbackEligible: true, // Exclude tier product orders
            shopifyCreatedAt: { gte: oneYearAgo }
          },
          _sum: {
            totalPrice: true,
            totalRefunded: true
          }
        });

        const totalSpent = orderStats._sum.totalPrice || new Decimal(0);
        const totalRefunded = orderStats._sum.totalRefunded || new Decimal(0);
        qualifyingSpend = new Decimal(totalSpent).minus(totalRefunded).toNumber();
      } else {
        // LIFETIME - use cumulative net spending
        qualifyingSpend = customer.netSpent?.toNumber() || 0;
      }

      // Check if customer qualifies for this tier
      if (qualifyingSpend >= tier.minSpend) {
        // Track the highest tier they qualify for
        if (!highestQualifyingTier || tier.minSpend > highestQualifyingTier.minSpend) {
          highestQualifyingTier = tier;
        }
      }
    }

    return highestQualifyingTier; // Return highest qualifying tier or null
  }

  /**
   * Update customer's effective tier and log any changes
   * Uses transaction for data consistency
   */
  static async updateEffectiveTier(customerId: string): Promise<void> {
    const effectiveTier = await this.getEffectiveTier(customerId);

    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: { currentTier: true }
    });

    if (!customer) {
      return;
    }

    // Check if tier has changed
    if (effectiveTier?.id !== customer.currentTierId) {
      const previousTier = customer.currentTier;

      // Use transaction for atomic updates
      await db.$transaction(async (tx) => {
        // Update customer's current tier
        await tx.customer.update({
          where: { id: customerId },
          data: {
            currentTierId: effectiveTier?.id || null,
            updatedAt: new Date()
          }
        });

        // Log the tier change
        await tx.tierChangeLog.create({
          data: {
            id: uuidv4(),
            customerId,
            shop: customer.shop,
            fromTierId: previousTier?.id || null,
            fromTierName: previousTier?.name || null,
            toTierId: effectiveTier?.id || null,
            toTierName: effectiveTier?.name || null,
            changeType: this.determineChangeType(previousTier, effectiveTier as Tier | null),
            triggerType: this.determineTriggerType(effectiveTier),
            totalSpending: customer.totalSpent,
            periodSpending: customer.netSpent,
            metadata: {
              source: effectiveTier ? (effectiveTier as TierWithDetails).source : null,
              expiresAt: effectiveTier ? (effectiveTier as TierWithDetails).expiresAt : null
            },
            createdAt: new Date()
          }
        });
      });

      // TODO: Send notification email about tier change
      // await this.sendTierChangeNotification(customer, previousTier?.name, effectiveTier?.name);
    }
  }

  /**
   * Handle membership expiration
   */
  static async handleMembershipExpiration(
    subscriptionOrPurchase: TierSubscription | TierPurchase
  ): Promise<void> {
    const customer = await db.customer.findUnique({
      where: { id: subscriptionOrPurchase.customerId }
    });

    if (!customer) {
      return;
    }

    // Mark subscription/purchase as expired
    if ('subscriptionContractId' in subscriptionOrPurchase) {
      await db.tierSubscription.update({
        where: { id: subscriptionOrPurchase.id },
        data: {
          status: 'EXPIRED',
          endDate: new Date()
        }
      });
    } else {
      await db.tierPurchase.update({
        where: { id: subscriptionOrPurchase.id },
        data: {
          status: 'EXPIRED'
        }
      });
    }

    // Update customer's effective tier (will revert to earned tier)
    await this.updateEffectiveTier(subscriptionOrPurchase.customerId);
  }

  /**
   * Validate if a customer can purchase a specific tier
   */
  static async validateTierPurchase(
    customerId: string,
    tierProductId: string
  ): Promise<{
    canPurchase: boolean;
    reason?: string;
    warning?: string;
  }> {
    // Check for existing active subscription
    const existingSubscription = await db.tierSubscription.findFirst({
      where: {
        customerId,
        status: 'ACTIVE'
      },
      include: { tier: true }
    });

    if (existingSubscription) {
      return {
        canPurchase: false,
        reason: 'You already have an active tier membership. Please cancel your current membership before purchasing a new one.'
      };
    }

    // Check for existing active one-time purchase
    const existingPurchase = await db.tierPurchase.findFirst({
      where: {
        customerId,
        status: 'ACTIVE',
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } }
        ]
      },
      include: { tier: true }
    });

    if (existingPurchase) {
      return {
        canPurchase: false,
        reason: 'You already have an active tier membership that has not expired.'
      };
    }

    // Get the tier being purchased
    const tierProduct = await db.tierProduct.findUnique({
      where: { id: tierProductId },
      include: { tier: true }
    });

    if (!tierProduct) {
      return {
        canPurchase: false,
        reason: 'Invalid tier product.'
      };
    }

    // Check if purchasing a lower tier than earned
    const customer = await db.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      return {
        canPurchase: false,
        reason: 'Customer not found.'
      };
    }

    const earnedTier = await this.getEarnedTier(customer);

    if (earnedTier && tierProduct.tier.cashbackPercent < earnedTier.cashbackPercent) {
      return {
        canPurchase: true, // Allow but warn
        warning: `You've already earned ${earnedTier.name} tier with ${earnedTier.cashbackPercent}% cashback through your spending. The ${tierProduct.tier.name} membership offers ${tierProduct.tier.cashbackPercent}% cashback. Your earned tier provides better benefits.`
      };
    }

    return { canPurchase: true };
  }

  /**
   * Helper: Determine change type based on tier benefits
   * Compares cashback percentages to determine if upgrade or downgrade
   */
  private static determineChangeType(
    fromTier: Tier | null,
    toTier: Tier | null
  ): 'INITIAL_ASSIGNMENT' | 'UPGRADE' | 'DOWNGRADE' {
    if (!fromTier && toTier) {
      return 'INITIAL_ASSIGNMENT';
    }

    if (!toTier) {
      return 'DOWNGRADE'; // Lost all tier status
    }

    if (!fromTier) {
      return 'INITIAL_ASSIGNMENT';
    }

    // Compare tier benefits (cashback percentage)
    const fromBenefit = fromTier.cashbackPercent;
    const toBenefit = toTier.cashbackPercent;

    if (toBenefit > fromBenefit) return 'UPGRADE';
    if (toBenefit < fromBenefit) return 'DOWNGRADE';

    // Same benefit level - could be lateral move or same tier
    // Check if it's actually the same tier
    if (fromTier.id === toTier.id) {
      return 'UPGRADE'; // No change, but not a downgrade
    }

    // Different tier but same benefits - treat as lateral
    return 'UPGRADE'; // Or could add 'LATERAL' type if needed
  }

  /**
   * Helper: Determine trigger type based on tier source
   * Returns proper TierTriggerType enum value
   */
  private static determineTriggerType(
    tier: TierWithDetails | null
  ): 'SUBSCRIPTION_CANCELLED' | 'SUBSCRIPTION_STARTED' | 'PRODUCT_PURCHASE' | 'SPENDING_MILESTONE' | 'PERIODIC_REVIEW' {
    if (!tier) {
      return 'SUBSCRIPTION_CANCELLED'; // Lost all tiers
    }

    switch (tier.source) {
      case 'PURCHASED_SUBSCRIPTION':
        return 'SUBSCRIPTION_STARTED';
      case 'PURCHASED_ONETIME':
        return 'PRODUCT_PURCHASE';
      case 'EARNED':
        return 'SPENDING_MILESTONE';
      default:
        return 'PERIODIC_REVIEW';
    }
  }
}

export default TierResolver;