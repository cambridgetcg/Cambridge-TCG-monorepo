/**
 * Klaviyo API Service
 *
 * Core service for interacting with the Klaviyo API.
 * Handles profiles, events, lists, and campaigns.
 *
 * @see https://developers.klaviyo.com/en/reference/api_overview
 */

import {
  ApiKeySession,
  ProfilesApi,
  EventsApi,
  ListsApi,
  type ProfileEnum,
} from "klaviyo-api";
import db from "~/db.server";
import type { Customer, Tier } from "@prisma/client";
import crypto from "crypto";

// ============================================
// TYPES
// ============================================

export interface KlaviyoConfig {
  apiKey: string;
  publicKey?: string;
  defaultListId?: string;
}

export interface ProfileData {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  externalId?: string;
  properties?: Record<string, unknown>;
}

export interface EventData {
  metricName: string;
  email: string;
  properties: Record<string, unknown>;
  value?: number;
  uniqueId?: string;
  time?: Date;
}

export interface KlaviyoProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  properties?: Record<string, unknown>;
}

export interface KlaviyoList {
  id: string;
  name: string;
  created?: string;
  updated?: string;
}

// Customer segment type (imported inline to avoid circular deps)
type CustomerSegment =
  | "CHAMPION"
  | "LOYAL"
  | "ENGAGED"
  | "AT_RISK"
  | "LAPSED"
  | "NEW";

// RewardsPro profile properties for Klaviyo
export interface RewardsProProfileProperties {
  // Tier & Status
  rewardspro_tier: string;
  rewardspro_tier_id: string;
  rewardspro_cashback_percent: number;
  rewardspro_is_vip: boolean;
  rewardspro_tier_rank: number;

  // Balances
  rewardspro_cashback_balance: number;
  rewardspro_points_balance: number;
  rewardspro_has_redeemable_balance: boolean;

  // Spending & Activity
  rewardspro_lifetime_spend: number;
  rewardspro_orders_count: number;
  rewardspro_average_order_value: number;
  rewardspro_last_order_date: string | null;
  rewardspro_days_since_last_order: number | null;

  // Cashback Metrics
  rewardspro_total_cashback_earned: number;
  rewardspro_total_cashback_redeemed: number;

  // Tier Progress
  rewardspro_next_tier: string | null;
  rewardspro_spend_to_next_tier: number | null;
  rewardspro_progress_to_next_tier: number | null;

  // Dates
  rewardspro_enrolled_date: string;
  rewardspro_days_as_member: number;

  // Phase 1 Gap Fill: Customer Segment
  rewardspro_customer_segment: CustomerSegment;

  // Phase 1 Gap Fill: Birthday Properties
  rewardspro_birthday: string | null;
  rewardspro_birthday_month: number | null;
  rewardspro_birthday_day: number | null;

  // ============================================
  // Rewards Engagement Properties (Marketing Integration)
  // ============================================

  // Points Activity
  rewardspro_lifetime_points: number;
  rewardspro_points_earned_30d: number;
  rewardspro_points_spent_30d: number;

  // Raffle Engagement
  rewardspro_total_raffle_entries: number;
  rewardspro_total_raffle_wins: number;
  rewardspro_active_raffle_entries: number;
  rewardspro_last_raffle_entry_date: string | null;

  // Mystery Box Engagement
  rewardspro_total_mystery_box_opens: number;
  rewardspro_total_mystery_box_wins: number;
  rewardspro_last_mystery_box_date: string | null;

  // Engagement Score & Activity
  rewardspro_rewards_engagement_score: number; // 0-100 composite score
  rewardspro_is_rewards_active: boolean; // Activity in last 30 days
  rewardspro_days_since_rewards_activity: number | null;
  rewardspro_engagement_level: "HIGH" | "MEDIUM" | "LOW" | "DORMANT";

  // Shop
  shop: string;
}

// ============================================
// KLAVIYO SERVICE CLASS
// ============================================

export class KlaviyoService {
  private session: ApiKeySession;
  private profilesApi: ProfilesApi;
  private eventsApi: EventsApi;
  private listsApi: ListsApi;
  private defaultListId?: string;

  constructor(config: KlaviyoConfig) {
    this.session = new ApiKeySession(config.apiKey);
    this.profilesApi = new ProfilesApi(this.session);
    this.eventsApi = new EventsApi(this.session);
    this.listsApi = new ListsApi(this.session);
    this.defaultListId = config.defaultListId;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PROFILE OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create or update a profile in Klaviyo
   * Uses email as the identifier
   */
  async createOrUpdateProfile(data: ProfileData): Promise<string> {
    try {
      const response = await this.profilesApi.createOrUpdateProfile({
        data: {
          type: "profile" as ProfileEnum,
          attributes: {
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phone,
            externalId: data.externalId,
            properties: data.properties,
          },
        },
      });

      return response.body.data.id;
    } catch (error) {
      console.error("[Klaviyo] Failed to create/update profile:", error);
      throw error;
    }
  }

  /**
   * Get a profile by email
   */
  async getProfileByEmail(email: string): Promise<KlaviyoProfile | null> {
    try {
      const response = await this.profilesApi.getProfiles({
        filter: `equals(email,"${email}")`,
      });

      const profiles = response.body.data;
      if (!profiles || profiles.length === 0) {
        return null;
      }

      const profile = profiles[0];
      return {
        id: profile.id,
        email: profile.attributes.email || "",
        firstName: profile.attributes.firstName || undefined,
        lastName: profile.attributes.lastName || undefined,
        phone: profile.attributes.phoneNumber || undefined,
        properties: profile.attributes.properties as Record<string, unknown>,
      };
    } catch (error) {
      console.error("[Klaviyo] Failed to get profile by email:", error);
      return null;
    }
  }

  /**
   * Get a profile by ID
   */
  async getProfileById(profileId: string): Promise<KlaviyoProfile | null> {
    try {
      const response = await this.profilesApi.getProfile({
        id: profileId,
      });

      const profile = response.body.data;
      return {
        id: profile.id,
        email: profile.attributes.email || "",
        firstName: profile.attributes.firstName || undefined,
        lastName: profile.attributes.lastName || undefined,
        phone: profile.attributes.phoneNumber || undefined,
        properties: profile.attributes.properties as Record<string, unknown>,
      };
    } catch (error) {
      console.error("[Klaviyo] Failed to get profile by ID:", error);
      return null;
    }
  }

  /**
   * Subscribe profiles to a list
   */
  async subscribeToList(listId: string, emails: string[]): Promise<void> {
    try {
      await this.profilesApi.subscribeProfiles({
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: emails.map((email) => ({
                type: "profile" as ProfileEnum,
                attributes: { email },
              })),
            },
          },
          relationships: {
            list: {
              data: {
                type: "list",
                id: listId,
              },
            },
          },
        },
      });
    } catch (error) {
      console.error("[Klaviyo] Failed to subscribe to list:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // EVENT OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Track a custom event
   */
  async trackEvent(data: EventData): Promise<void> {
    try {
      await this.eventsApi.createEvent({
        data: {
          type: "event",
          attributes: {
            metric: {
              data: {
                type: "metric",
                attributes: {
                  name: data.metricName,
                },
              },
            },
            profile: {
              data: {
                type: "profile" as ProfileEnum,
                attributes: {
                  email: data.email,
                },
              },
            },
            properties: data.properties,
            value: data.value,
            uniqueId: data.uniqueId,
            time: data.time?.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error("[Klaviyo] Failed to track event:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LIST OPERATIONS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Get all lists
   */
  async getLists(): Promise<KlaviyoList[]> {
    try {
      const response = await this.listsApi.getLists({});

      return (response.body.data || []).map((list) => ({
        id: list.id,
        name: list.attributes.name || "",
        created: list.attributes.created,
        updated: list.attributes.updated,
      }));
    } catch (error) {
      console.error("[Klaviyo] Failed to get lists:", error);
      return [];
    }
  }

  /**
   * Create a new list
   */
  async createList(name: string): Promise<string> {
    try {
      const response = await this.listsApi.createList({
        data: {
          type: "list",
          attributes: {
            name,
          },
        },
      });

      return response.body.data.id;
    } catch (error) {
      console.error("[Klaviyo] Failed to create list:", error);
      throw error;
    }
  }

  /**
   * Add profiles to a list
   */
  async addProfilesToList(listId: string, profileIds: string[]): Promise<void> {
    try {
      await this.listsApi.createListRelationships({
        id: listId,
        data: profileIds.map((id) => ({
          type: "profile" as ProfileEnum,
          id,
        })),
      });
    } catch (error) {
      console.error("[Klaviyo] Failed to add profiles to list:", error);
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Validate API key by making a simple API call
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.listsApi.getLists({ pageSize: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get Klaviyo service instance for a shop
 * Supports both OAuth tokens (preferred) and API keys (legacy)
 */
export async function getKlaviyoService(
  shop: string
): Promise<KlaviyoService | null> {
  const settings = await db.emailSettings.findUnique({
    where: { shop },
  });

  if (!settings?.klaviyoEnabled) {
    return null;
  }

  // Prefer OAuth tokens over API key
  if (settings.klaviyoOAuthConnected && settings.klaviyoAccessToken) {
    // Check if token needs refresh
    const { getValidAccessToken } = await import("./klaviyo-oauth.server");
    const accessToken = await getValidAccessToken(shop);

    if (accessToken) {
      return new KlaviyoService({
        apiKey: accessToken, // OAuth access token works like an API key
        publicKey: settings.klaviyoPublicKey || undefined,
        defaultListId: settings.klaviyoDefaultListId || undefined,
      });
    }
  }

  // Fall back to API key if OAuth not connected
  if (settings.klaviyoApiKey) {
    return new KlaviyoService({
      apiKey: settings.klaviyoApiKey,
      publicKey: settings.klaviyoPublicKey || undefined,
      defaultListId: settings.klaviyoDefaultListId || undefined,
    });
  }

  return null;
}

/**
 * Check if Klaviyo is enabled for a shop
 * Returns true if either OAuth is connected or API key is set
 */
export async function isKlaviyoEnabled(shop: string): Promise<boolean> {
  const settings = await db.emailSettings.findUnique({
    where: { shop },
    select: {
      klaviyoEnabled: true,
      klaviyoApiKey: true,
      klaviyoOAuthConnected: true,
    },
  });

  if (!settings?.klaviyoEnabled) {
    return false;
  }

  // Either OAuth connected or API key must be present
  return !!(settings.klaviyoOAuthConnected || settings.klaviyoApiKey);
}

/**
 * Calculate customer segment based on behavior metrics
 * (Duplicated here to avoid circular imports with klaviyo-events.server.ts)
 */
function calculateSegment(
  customer: Customer & { currentTier?: Tier | null },
  tiers?: Tier[]
): CustomerSegment {
  const daysSinceOrder = customer.lastOrderAt
    ? Math.floor(
        (Date.now() - customer.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  // Check if customer is VIP (highest tier)
  const isVip =
    tiers && customer.currentTier
      ? !tiers.some((t) => t.minSpend > customer.currentTier!.minSpend)
      : false;

  // Champion: VIP + active in last 30 days
  if (isVip && daysSinceOrder !== null && daysSinceOrder <= 30) {
    return "CHAMPION";
  }

  // Loyal: 3+ orders + active in last 60 days
  if (
    customer.ordersCount >= 3 &&
    daysSinceOrder !== null &&
    daysSinceOrder <= 60
  ) {
    return "LOYAL";
  }

  // Engaged: Active in last 45 days
  if (daysSinceOrder !== null && daysSinceOrder <= 45) {
    return "ENGAGED";
  }

  // At-Risk: 2+ orders but inactive 45-89 days
  if (
    customer.ordersCount >= 2 &&
    daysSinceOrder !== null &&
    daysSinceOrder >= 45 &&
    daysSinceOrder < 90
  ) {
    return "AT_RISK";
  }

  // Lapsed: Inactive 90+ days
  if (daysSinceOrder !== null && daysSinceOrder >= 90) {
    return "LAPSED";
  }

  // New: Everything else
  return "NEW";
}

/**
 * Build profile properties from a RewardsPro customer
 */
export function buildProfileProperties(
  customer: Customer & { currentTier?: Tier | null; birthday?: Date | null },
  shop: string,
  tiers?: Tier[]
): RewardsProProfileProperties {
  const tier = customer.currentTier;

  // Calculate days since last order
  const daysSinceLastOrder = customer.lastOrderAt
    ? Math.floor(
        (Date.now() - customer.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  // Calculate days as member
  const daysAsMember = Math.floor(
    (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Find next tier
  let nextTier: Tier | null = null;
  let spendToNextTier: number | null = null;
  let progressToNextTier: number | null = null;

  if (tiers && tier) {
    const sortedTiers = [...tiers].sort((a, b) => a.minSpend - b.minSpend);
    const currentIndex = sortedTiers.findIndex((t) => t.id === tier.id);
    if (currentIndex >= 0 && currentIndex < sortedTiers.length - 1) {
      nextTier = sortedTiers[currentIndex + 1];
      spendToNextTier = nextTier.minSpend - customer.lifetimeSpend;
      progressToNextTier = Math.min(
        100,
        Math.round((customer.lifetimeSpend / nextTier.minSpend) * 100)
      );
    }
  }

  // Check if VIP (highest tier)
  const isVip =
    tiers && tier
      ? !tiers.some((t) => t.minSpend > tier.minSpend)
      : false;

  // Get tier rank
  const tierRank = tiers
    ? [...tiers]
        .sort((a, b) => a.minSpend - b.minSpend)
        .findIndex((t) => t.id === tier?.id) + 1
    : 0;

  // Calculate customer segment
  const segment = calculateSegment(customer, tiers);

  // Parse birthday if available
  const birthday = customer.birthday;
  let birthdayStr: string | null = null;
  let birthdayMonth: number | null = null;
  let birthdayDay: number | null = null;

  if (birthday) {
    birthdayStr = birthday.toISOString().split("T")[0];
    birthdayMonth = birthday.getMonth() + 1; // 1-12
    birthdayDay = birthday.getDate();
  }

  return {
    // Tier & Status
    rewardspro_tier: tier?.name || "None",
    rewardspro_tier_id: tier?.id || "",
    rewardspro_cashback_percent: tier?.cashbackPercent || 0,
    rewardspro_is_vip: isVip,
    rewardspro_tier_rank: tierRank,

    // Balances
    rewardspro_cashback_balance: customer.cashbackBalance,
    rewardspro_points_balance: customer.pointsBalance || 0,
    rewardspro_has_redeemable_balance: customer.cashbackBalance > 0,

    // Spending & Activity
    rewardspro_lifetime_spend: customer.lifetimeSpend,
    rewardspro_orders_count: customer.ordersCount,
    rewardspro_average_order_value:
      customer.ordersCount > 0
        ? customer.lifetimeSpend / customer.ordersCount
        : 0,
    rewardspro_last_order_date: customer.lastOrderAt?.toISOString().split("T")[0] || null,
    rewardspro_days_since_last_order: daysSinceLastOrder,

    // Cashback Metrics
    rewardspro_total_cashback_earned: customer.totalCashbackEarned || 0,
    rewardspro_total_cashback_redeemed: customer.totalCashbackRedeemed || 0,

    // Tier Progress
    rewardspro_next_tier: nextTier?.name || null,
    rewardspro_spend_to_next_tier: spendToNextTier,
    rewardspro_progress_to_next_tier: progressToNextTier,

    // Dates
    rewardspro_enrolled_date: customer.createdAt.toISOString().split("T")[0],
    rewardspro_days_as_member: daysAsMember,

    // Phase 1 Gap Fill: Customer Segment
    rewardspro_customer_segment: segment,

    // Phase 1 Gap Fill: Birthday Properties
    rewardspro_birthday: birthdayStr,
    rewardspro_birthday_month: birthdayMonth,
    rewardspro_birthday_day: birthdayDay,

    // ============================================
    // Rewards Engagement Properties (Marketing Integration)
    // ============================================
    // Note: These properties require rewards activity data to be passed in
    // via the rewardsActivity parameter. If not provided, defaults are used.

    // Points Activity
    rewardspro_lifetime_points: customer.lifetimePoints || 0,
    rewardspro_points_earned_30d: 0, // Requires aggregation query
    rewardspro_points_spent_30d: 0, // Requires aggregation query

    // Raffle Engagement (defaults - populate via rewardsActivity if available)
    rewardspro_total_raffle_entries: 0,
    rewardspro_total_raffle_wins: 0,
    rewardspro_active_raffle_entries: 0,
    rewardspro_last_raffle_entry_date: null,

    // Mystery Box Engagement (defaults - populate via rewardsActivity if available)
    rewardspro_total_mystery_box_opens: 0,
    rewardspro_total_mystery_box_wins: 0,
    rewardspro_last_mystery_box_date: null,

    // Engagement Score & Activity (calculated from activity data)
    rewardspro_rewards_engagement_score: calculateEngagementScore(customer, daysSinceLastOrder),
    rewardspro_is_rewards_active: (customer.lifetimePoints || 0) > 0 && daysSinceLastOrder !== null && daysSinceLastOrder < 30,
    rewardspro_days_since_rewards_activity: daysSinceLastOrder, // Use order activity as proxy
    rewardspro_engagement_level: getEngagementLevel(customer, daysSinceLastOrder),

    // Shop
    shop,
  };
}

/**
 * Calculate engagement score (0-100) based on customer activity
 */
function calculateEngagementScore(
  customer: Customer,
  daysSinceLastOrder: number | null
): number {
  let score = 0;

  // Points balance contribution (max 20 points)
  const pointsBalance = customer.pointsBalance || 0;
  score += Math.min(20, Math.floor(pointsBalance / 50));

  // Order frequency (max 30 points)
  if (customer.ordersCount >= 10) score += 30;
  else if (customer.ordersCount >= 5) score += 20;
  else if (customer.ordersCount >= 2) score += 10;

  // Recency (max 30 points)
  if (daysSinceLastOrder !== null) {
    if (daysSinceLastOrder <= 7) score += 30;
    else if (daysSinceLastOrder <= 14) score += 25;
    else if (daysSinceLastOrder <= 30) score += 20;
    else if (daysSinceLastOrder <= 60) score += 10;
  }

  // Lifetime spend (max 20 points)
  if (customer.lifetimeSpend >= 1000) score += 20;
  else if (customer.lifetimeSpend >= 500) score += 15;
  else if (customer.lifetimeSpend >= 100) score += 10;

  return Math.min(100, score);
}

/**
 * Get engagement level based on activity metrics
 */
function getEngagementLevel(
  customer: Customer,
  daysSinceLastOrder: number | null
): "HIGH" | "MEDIUM" | "LOW" | "DORMANT" {
  const hasPoints = (customer.pointsBalance || 0) > 0;
  const hasRecentActivity = daysSinceLastOrder !== null && daysSinceLastOrder <= 30;
  const hasOrders = customer.ordersCount > 0;

  if (hasRecentActivity && hasPoints && customer.ordersCount >= 3) {
    return "HIGH";
  }
  if (hasRecentActivity || (hasPoints && hasOrders)) {
    return "MEDIUM";
  }
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 60) {
    return "DORMANT";
  }
  return "LOW";
}

/**
 * Generate a hash of profile data for change detection
 */
export function hashProfileData(data: Record<string, unknown>): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("md5").update(json).digest("hex");
}

/**
 * Verify Klaviyo webhook signature
 */
export function verifyKlaviyoWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const message = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
