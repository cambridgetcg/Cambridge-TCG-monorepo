/**
 * Customer Account Challenges API
 *
 * Provides challenge data and progress functionality for the customer account extension.
 *
 * GET: Get active challenges and customer's progress
 * POST: Claim challenge completion rewards
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";
import {
  getCustomerActiveChallenges,
  getCustomerChallengeHistory,
} from "../services/challenge-progress.server";
import { claimChallengeReward } from "../services/challenge-claim.server";
import { unauthenticated } from "../shopify.server";
import db from "../db.server";

const LOG_PREFIX = "[api.customer-account.challenges]";

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Customer-Id",
};

// ============================================
// TYPES
// ============================================

export interface ChallengeObjectiveType {
  type: "SPENDING" | "ORDER_COUNT" | "REFERRAL" | "PRODUCT_PURCHASE" | "REVIEW" | "STREAK";
}

export interface ChallengeReward {
  type: string;
  value: number | string;
  description: string;
}

export interface CustomerChallenge {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  objectiveType: ChallengeObjectiveType["type"];
  targetValue: number;
  currentProgress: number;
  progressPercent: number;
  reward: ChallengeReward | null;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "COMPLETED" | "CLAIMED" | "EXPIRED" | "IN_PROGRESS";
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get objective type icon for display
 */
function getObjectiveIcon(type: string): string {
  switch (type) {
    case "SPENDING": return "💰";
    case "ORDER_COUNT": return "📦";
    case "REFERRAL": return "👥";
    case "PRODUCT_PURCHASE": return "🛍️";
    case "REVIEW": return "⭐";
    case "STREAK": return "🔥";
    default: return "🎯";
  }
}

// ============================================
// LOADER - GET challenges data
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} GET request received`);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("customerId");
    const action = url.searchParams.get("action") || "available";

    if (!shop) {
      return json({ error: "Shop parameter required" }, { status: 400, headers: corsHeaders });
    }

    // Get points config to check if challenges are enabled
    const config = await getPointsConfig(shop);

    if (!config.isEnabled || !config.challengesEnabled) {
      return json({
        enabled: false,
        challenges: [],
        message: "Challenges are not enabled for this store",
      }, { headers: corsHeaders });
    }

    // If no customer, return public info only
    if (!customerId) {
      return json({
        enabled: true,
        authenticated: false,
        challenges: [],
        message: "Sign in to view and participate in challenges",
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Verify customer exists
    const customer = await db.customer.findFirst({
      where: { id: customerId, shop },
      select: { id: true },
    });

    if (!customer) {
      return json({
        enabled: true,
        authenticated: false,
        challenges: [],
        message: "Customer not found",
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Get points balance for display
    const balance = await getPointsBalance(shop, customerId);

    // Handle different actions
    if (action === "history") {
      const history = await getCustomerChallengeHistory(shop, customerId, 20);

      return json({
        enabled: true,
        authenticated: true,
        history: history.map((c) => ({
          id: c.id,
          challengeId: c.challengeId,
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          objectiveType: c.objectiveType,
          objectiveIcon: getObjectiveIcon(c.objectiveType),
          targetValue: c.targetValue,
          currentProgress: c.currentProgress,
          progressPercent: c.progressPercent,
          reward: c.reward,
          status: c.status,
          completedAt: c.completedAt,
          claimedAt: c.claimedAt,
        })),
        pointsBalance: balance.available,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Default: Get active challenges with customer's progress
    const challenges = await getCustomerActiveChallenges(shop, customerId);

    // Sort challenges: COMPLETED first, then IN_PROGRESS, then by progress
    const sortedChallenges = [...challenges].sort((a, b) => {
      const statusOrder = { COMPLETED: 0, IN_PROGRESS: 1, CLAIMED: 2, EXPIRED: 3 };
      const aOrder = statusOrder[a.status] ?? 4;
      const bOrder = statusOrder[b.status] ?? 4;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.progressPercent - a.progressPercent;
    });

    // Transform to API response format
    const formattedChallenges: CustomerChallenge[] = sortedChallenges.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl,
      objectiveType: c.objectiveType as ChallengeObjectiveType["type"],
      objectiveIcon: getObjectiveIcon(c.objectiveType),
      targetValue: c.targetValue,
      currentProgress: c.currentProgress,
      progressPercent: c.progressPercent,
      reward: c.reward,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status: c.status as CustomerChallenge["status"],
      completedAt: c.completedAt,
      claimedAt: c.claimedAt,
    }));

    return json({
      enabled: true,
      authenticated: true,
      challenges: formattedChallenges,
      pointsBalance: balance.available,
      config: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
      },
      message: challenges.length === 0
        ? "No active challenges at the moment. Check back soon!"
        : null,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500, headers: corsHeaders });
  }
};

// ============================================
// ACTION - POST claim challenge reward
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log(`${LOG_PREFIX} POST request received`);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { shop, customerId, challengeId, intent } = body;

    if (!shop || !customerId) {
      return json({ error: "shop and customerId are required" }, { status: 400, headers: corsHeaders });
    }

    // Check if points/challenges are enabled
    const config = await getPointsConfig(shop);
    if (!config.isEnabled || !config.challengesEnabled) {
      return json({
        success: false,
        error: "Challenges are not enabled for this store",
      }, { status: 400, headers: corsHeaders });
    }

    // Claim challenge reward
    if (intent === "claim") {
      if (!challengeId) {
        return json({
          success: false,
          error: "challengeId is required",
        }, { status: 400, headers: corsHeaders });
      }

      // Get admin API for Shopify discount creation
      let admin: any;
      try {
        const unauthResult = await unauthenticated.admin(shop);
        admin = unauthResult.admin;
      } catch (e) {
        console.error(`${LOG_PREFIX} Failed to get admin API (non-fatal):`, e);
      }

      const result = await claimChallengeReward(shop, customerId, challengeId, admin);

      if (!result.success) {
        return json({
          success: false,
          error: result.error,
        }, { status: 400, headers: corsHeaders });
      }

      // Get updated points balance
      const balance = await getPointsBalance(shop, customerId);

      return json({
        success: true,
        rewardType: result.rewardType,
        rewardValue: result.rewardValue,
        newBalance: balance.available,
        message: result.message,
      }, { headers: corsHeaders });
    }

    return json({ error: "Unknown intent" }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return json({
      success: false,
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500, headers: corsHeaders });
  }
};
