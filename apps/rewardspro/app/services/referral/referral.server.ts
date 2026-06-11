/**
 * Referral System - Path Foundation for Viral Growth
 *
 * PURPOSE:
 * Customer referral program with rewards for both referrer and referee.
 * This pattern enables:
 * - Unique referral codes/links per customer
 * - Configurable rewards (points, store credit, discounts)
 * - Referral tracking and conversion attribution
 * - Fraud prevention and limit enforcement
 *
 * USAGE:
 * ```typescript
 * // Generate referral code for customer
 * const code = await referralService.generateReferralCode(shop, customerId);
 *
 * // Track referral signup
 * await referralService.trackReferralSignup(shop, referralCode, newCustomerId);
 *
 * // Process referral conversion (after first order)
 * await referralService.processReferralConversion(shop, referredCustomerId);
 *
 * // Get referral stats
 * const stats = await referralService.getReferralStats(shop, customerId);
 * ```
 *
 * DATABASE SCHEMA (to be added to Prisma):
 * ```prisma
 * model ReferralConfig {
 *   id                    String   @id @default(uuid())
 *   shop                  String   @unique
 *   enabled               Boolean  @default(false)
 *
 *   // Referrer rewards
 *   referrerRewardType    ReferralRewardType @default(POINTS)
 *   referrerRewardAmount  Int      @default(100) // Points or cents
 *   referrerRewardOnSignup Boolean @default(false) // Reward on signup vs conversion
 *
 *   // Referee rewards
 *   refereeRewardType     ReferralRewardType @default(POINTS)
 *   refereeRewardAmount   Int      @default(50)
 *   refereeDiscountCode   String?  // Optional discount for first order
 *   refereeDiscountPercent Int?    // Discount percentage
 *
 *   // Limits
 *   maxReferralsPerCustomer Int @default(50)
 *   minOrderValueForConversion Decimal? @db.Decimal(10, 2)
 *
 *   // Timing
 *   conversionWindowDays  Int      @default(30)
 *
 *   createdAt             DateTime @default(now())
 *   updatedAt             DateTime @updatedAt
 * }
 *
 * model Referral {
 *   id              String   @id @default(uuid())
 *   shop            String
 *
 *   // Referrer (person who shared)
 *   referrerId      String
 *   referrer        Customer @relation("ReferrerRelation", fields: [referrerId], references: [id])
 *   referralCode    String   // Unique code
 *   referralLink    String?  // Full URL
 *
 *   // Referee (person who was referred)
 *   refereeId       String?
 *   referee         Customer? @relation("RefereeRelation", fields: [refereeId], references: [id])
 *   refereeEmail    String?  // Email before account creation
 *
 *   // Status
 *   status          ReferralStatus @default(PENDING)
 *   signedUpAt      DateTime?
 *   convertedAt     DateTime?
 *   convertedOrderId String?
 *
 *   // Rewards
 *   referrerRewarded Boolean @default(false)
 *   referrerRewardAmount Int?
 *   refereeRewarded  Boolean @default(false)
 *   refereeRewardAmount Int?
 *
 *   createdAt       DateTime @default(now())
 *   expiresAt       DateTime?
 *
 *   @@unique([shop, referralCode])
 *   @@index([referrerId])
 *   @@index([refereeId])
 *   @@index([shop, status])
 * }
 *
 * enum ReferralRewardType {
 *   POINTS
 *   STORE_CREDIT
 *   DISCOUNT_CODE
 * }
 *
 * enum ReferralStatus {
 *   PENDING      // Code generated, not used
 *   SIGNED_UP    // Referee signed up
 *   CONVERTED    // Referee made qualifying purchase
 *   EXPIRED      // Past conversion window
 *   CANCELLED    // Manually cancelled
 * }
 * ```
 */

import { db } from "~/db.server";
import { nanoid } from "nanoid";

// ============================================================================
// Types
// ============================================================================

export type ReferralRewardType = 'POINTS' | 'STORE_CREDIT' | 'DISCOUNT_CODE';
export type ReferralStatus = 'PENDING' | 'SIGNED_UP' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';

export interface ReferralConfig {
  shop: string;
  enabled: boolean;

  // Referrer rewards
  referrerRewardType: ReferralRewardType;
  referrerRewardAmount: number;
  referrerRewardOnSignup: boolean;

  // Referee rewards
  refereeRewardType: ReferralRewardType;
  refereeRewardAmount: number;
  refereeDiscountCode?: string;
  refereeDiscountPercent?: number;

  // Limits
  maxReferralsPerCustomer: number;
  minOrderValueForConversion?: number;

  // Timing
  conversionWindowDays: number;
}

export interface Referral {
  id: string;
  shop: string;
  referrerId: string;
  referralCode: string;
  referralLink?: string;
  refereeId?: string;
  refereeEmail?: string;
  status: ReferralStatus;
  signedUpAt?: Date;
  convertedAt?: Date;
  convertedOrderId?: string;
  referrerRewarded: boolean;
  referrerRewardAmount?: number;
  refereeRewarded: boolean;
  refereeRewardAmount?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ReferralStats {
  totalReferrals: number;
  pendingReferrals: number;
  signedUpReferrals: number;
  convertedReferrals: number;
  totalPointsEarned: number;
  totalStoreCreditEarned: number;
  conversionRate: number;
}

export interface CreateReferralResult {
  success: boolean;
  referralCode?: string;
  referralLink?: string;
  error?: string;
}

export interface TrackSignupResult {
  success: boolean;
  referralId?: string;
  error?: string;
}

export interface ProcessConversionResult {
  success: boolean;
  referrerReward?: { type: ReferralRewardType; amount: number };
  refereeReward?: { type: ReferralRewardType; amount: number };
  error?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Omit<ReferralConfig, 'shop'> = {
  enabled: false,
  referrerRewardType: 'POINTS',
  referrerRewardAmount: 100,
  referrerRewardOnSignup: false,
  refereeRewardType: 'POINTS',
  refereeRewardAmount: 50,
  maxReferralsPerCustomer: 50,
  conversionWindowDays: 30,
};

// ============================================================================
// Referral Service Class
// ============================================================================

class ReferralService {
  /**
   * Get referral configuration for a shop
   */
  async getConfig(shop: string): Promise<ReferralConfig> {
    // TODO: Fetch from database when ReferralConfig model exists
    // For now, return default config
    return { shop, ...DEFAULT_CONFIG };
  }

  /**
   * Update referral configuration
   */
  async updateConfig(shop: string, updates: Partial<ReferralConfig>): Promise<ReferralConfig> {
    // TODO: Save to database when ReferralConfig model exists
    const current = await this.getConfig(shop);
    const updated = { ...current, ...updates };
    console.log(`[ReferralService] Updated config for ${shop}:`, updated);
    return updated;
  }

  /**
   * Generate a unique referral code for a customer
   */
  async generateReferralCode(
    shop: string,
    customerId: string
  ): Promise<CreateReferralResult> {
    const config = await this.getConfig(shop);

    if (!config.enabled) {
      return { success: false, error: 'Referral program is not enabled' };
    }

    // Check if customer has reached max referrals
    const existingCount = await this.getReferralCount(shop, customerId);
    if (existingCount >= config.maxReferralsPerCustomer) {
      return { success: false, error: 'Maximum referral limit reached' };
    }

    // Check if customer already has an active code
    const existing = await this.getActiveReferralCode(shop, customerId);
    if (existing) {
      return {
        success: true,
        referralCode: existing.referralCode,
        referralLink: existing.referralLink,
      };
    }

    // Generate unique code
    const referralCode = await this.generateUniqueCode(shop);
    const referralLink = this.buildReferralLink(shop, referralCode);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.conversionWindowDays);

    // TODO: Save to database when Referral model exists
    const referral: Referral = {
      id: crypto.randomUUID(),
      shop,
      referrerId: customerId,
      referralCode,
      referralLink,
      status: 'PENDING',
      referrerRewarded: false,
      refereeRewarded: false,
      createdAt: new Date(),
      expiresAt,
    };

    console.log(`[ReferralService] Generated referral code for ${customerId}: ${referralCode}`);

    return {
      success: true,
      referralCode,
      referralLink,
    };
  }

  /**
   * Track when a referred customer signs up
   */
  async trackReferralSignup(
    shop: string,
    referralCode: string,
    newCustomerId: string,
    email?: string
  ): Promise<TrackSignupResult> {
    const referral = await this.getReferralByCode(shop, referralCode);

    if (!referral) {
      return { success: false, error: 'Invalid referral code' };
    }

    if (referral.status !== 'PENDING') {
      return { success: false, error: 'Referral code already used' };
    }

    if (referral.expiresAt && referral.expiresAt < new Date()) {
      return { success: false, error: 'Referral code has expired' };
    }

    // Prevent self-referral
    if (referral.referrerId === newCustomerId) {
      return { success: false, error: 'Cannot refer yourself' };
    }

    // Update referral
    const updatedReferral: Referral = {
      ...referral,
      refereeId: newCustomerId,
      refereeEmail: email,
      status: 'SIGNED_UP',
      signedUpAt: new Date(),
    };

    // TODO: Save to database when Referral model exists

    const config = await this.getConfig(shop);

    // If configured to reward on signup, process referrer reward
    if (config.referrerRewardOnSignup) {
      await this.rewardReferrer(shop, updatedReferral, config);
    }

    // Reward referee immediately
    await this.rewardReferee(shop, updatedReferral, config);

    console.log(`[ReferralService] Tracked signup for referral ${referralCode}`);

    return {
      success: true,
      referralId: updatedReferral.id,
    };
  }

  /**
   * Process referral conversion when referee makes first order
   */
  async processReferralConversion(
    shop: string,
    refereeCustomerId: string,
    orderId: string,
    orderTotal: number
  ): Promise<ProcessConversionResult> {
    // Find referral for this customer
    const referral = await this.getReferralByReferee(shop, refereeCustomerId);

    if (!referral) {
      return { success: false, error: 'No referral found for customer' };
    }

    if (referral.status === 'CONVERTED') {
      return { success: false, error: 'Referral already converted' };
    }

    if (referral.status !== 'SIGNED_UP') {
      return { success: false, error: 'Invalid referral status' };
    }

    const config = await this.getConfig(shop);

    // Check minimum order value
    if (config.minOrderValueForConversion && orderTotal < config.minOrderValueForConversion) {
      return {
        success: false,
        error: `Minimum order value of ${config.minOrderValueForConversion} required`,
      };
    }

    // Update referral to converted
    const updatedReferral: Referral = {
      ...referral,
      status: 'CONVERTED',
      convertedAt: new Date(),
      convertedOrderId: orderId,
    };

    // TODO: Save to database when Referral model exists

    // Process referrer reward (if not already rewarded on signup)
    let referrerReward;
    if (!config.referrerRewardOnSignup && !referral.referrerRewarded) {
      referrerReward = await this.rewardReferrer(shop, updatedReferral, config);
    }

    console.log(`[ReferralService] Processed conversion for referral ${referral.referralCode}`);

    return {
      success: true,
      referrerReward,
    };
  }

  /**
   * Get referral statistics for a customer
   */
  async getReferralStats(shop: string, customerId: string): Promise<ReferralStats> {
    // TODO: Query database when Referral model exists
    // For now, return placeholder stats
    return {
      totalReferrals: 0,
      pendingReferrals: 0,
      signedUpReferrals: 0,
      convertedReferrals: 0,
      totalPointsEarned: 0,
      totalStoreCreditEarned: 0,
      conversionRate: 0,
    };
  }

  /**
   * Get all referrals for a customer
   */
  async getReferrals(
    shop: string,
    customerId: string,
    options: { status?: ReferralStatus; limit?: number } = {}
  ): Promise<Referral[]> {
    // TODO: Query database when Referral model exists
    return [];
  }

  /**
   * Get leaderboard of top referrers
   */
  async getLeaderboard(
    shop: string,
    options: { limit?: number; period?: 'all' | 'month' | 'week' } = {}
  ): Promise<{ customerId: string; referralCount: number; totalEarned: number }[]> {
    // TODO: Query database when Referral model exists
    return [];
  }

  /**
   * Validate a referral code
   */
  async validateReferralCode(
    shop: string,
    referralCode: string
  ): Promise<{ valid: boolean; referrer?: { id: string; name?: string } }> {
    const referral = await this.getReferralByCode(shop, referralCode);

    if (!referral) {
      return { valid: false };
    }

    if (referral.status !== 'PENDING') {
      return { valid: false };
    }

    if (referral.expiresAt && referral.expiresAt < new Date()) {
      return { valid: false };
    }

    // Get referrer info
    const referrer = await db.customer.findUnique({
      where: { id: referral.referrerId },
      select: { id: true, firstName: true, lastName: true },
    });

    return {
      valid: true,
      referrer: referrer ? {
        id: referrer.id,
        name: [referrer.firstName, referrer.lastName].filter(Boolean).join(' ') || undefined,
      } : undefined,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async generateUniqueCode(shop: string): Promise<string> {
    // Generate 8-character alphanumeric code
    let code = nanoid(8).toUpperCase();
    let attempts = 0;

    // Ensure uniqueness
    while (attempts < 10) {
      const existing = await this.getReferralByCode(shop, code);
      if (!existing) break;
      code = nanoid(8).toUpperCase();
      attempts++;
    }

    return code;
  }

  private buildReferralLink(shop: string, code: string): string {
    // Extract store domain from shop identifier
    const domain = shop.replace('.myshopify.com', '');
    return `https://${domain}.myshopify.com?ref=${code}`;
  }

  private async getReferralCount(shop: string, customerId: string): Promise<number> {
    // TODO: Query database when Referral model exists
    return 0;
  }

  private async getActiveReferralCode(shop: string, customerId: string): Promise<Referral | null> {
    // TODO: Query database when Referral model exists
    return null;
  }

  private async getReferralByCode(shop: string, code: string): Promise<Referral | null> {
    // TODO: Query database when Referral model exists
    return null;
  }

  private async getReferralByReferee(shop: string, refereeId: string): Promise<Referral | null> {
    // TODO: Query database when Referral model exists
    return null;
  }

  private async rewardReferrer(
    shop: string,
    referral: Referral,
    config: ReferralConfig
  ): Promise<{ type: ReferralRewardType; amount: number } | undefined> {
    if (referral.referrerRewarded) return;

    try {
      switch (config.referrerRewardType) {
        case 'POINTS':
          const { earnPoints } = await import('~/services/points-ledger.server');
          await earnPoints({
            shop,
            customerId: referral.referrerId,
            amount: config.referrerRewardAmount,
            type: 'REFERRAL_BONUS',
            description: `Referral reward - ${referral.refereeEmail || 'friend'} signed up`,
            metadata: { referenceType: 'REFERRAL', referenceId: referral.id },
          });
          break;

        case 'STORE_CREDIT':
          // TODO: Integrate with store credit service
          console.log(`[ReferralService] Would award ${config.referrerRewardAmount} store credit`);
          break;

        case 'DISCOUNT_CODE':
          // TODO: Generate discount code
          console.log(`[ReferralService] Would generate discount code for referrer`);
          break;
      }

      // Update referral as rewarded
      // TODO: Save to database

      return {
        type: config.referrerRewardType,
        amount: config.referrerRewardAmount,
      };
    } catch (error) {
      console.error('[ReferralService] Error rewarding referrer:', error);
      return undefined;
    }
  }

  private async rewardReferee(
    shop: string,
    referral: Referral,
    config: ReferralConfig
  ): Promise<{ type: ReferralRewardType; amount: number } | undefined> {
    if (referral.refereeRewarded || !referral.refereeId) return;

    try {
      switch (config.refereeRewardType) {
        case 'POINTS':
          const { earnPoints } = await import('~/services/points-ledger.server');
          await earnPoints({
            shop,
            customerId: referral.refereeId,
            amount: config.refereeRewardAmount,
            type: 'REFERRAL_BONUS',
            description: 'Welcome bonus - Referred by a friend',
            metadata: { referenceType: 'REFERRAL', referenceId: referral.id },
          });
          break;

        case 'STORE_CREDIT':
          // TODO: Integrate with store credit service
          console.log(`[ReferralService] Would award ${config.refereeRewardAmount} store credit to referee`);
          break;

        case 'DISCOUNT_CODE':
          // TODO: Send discount code
          console.log(`[ReferralService] Would send discount code to referee`);
          break;
      }

      // Update referral as rewarded
      // TODO: Save to database

      return {
        type: config.refereeRewardType,
        amount: config.refereeRewardAmount,
      };
    } catch (error) {
      console.error('[ReferralService] Error rewarding referee:', error);
      return undefined;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const referralService = new ReferralService();

// ============================================================================
// Integration Hooks
// ============================================================================

/**
 * Hook to call from customer.create webhook
 */
export async function onCustomerCreated(
  shop: string,
  customerId: string,
  email: string,
  referralCode?: string
): Promise<void> {
  if (!referralCode) return;

  const result = await referralService.trackReferralSignup(
    shop,
    referralCode,
    customerId,
    email
  );

  if (result.success) {
    console.log(`[ReferralService] Customer ${email} signed up via referral ${referralCode}`);
  }
}

/**
 * Hook to call from order.paid webhook
 */
export async function onOrderPaid(
  shop: string,
  customerId: string,
  orderId: string,
  orderTotal: number,
  isFirstOrder: boolean
): Promise<void> {
  if (!isFirstOrder) return;

  const result = await referralService.processReferralConversion(
    shop,
    customerId,
    orderId,
    orderTotal
  );

  if (result.success) {
    console.log(`[ReferralService] Referral converted for customer ${customerId}`);
  }
}
