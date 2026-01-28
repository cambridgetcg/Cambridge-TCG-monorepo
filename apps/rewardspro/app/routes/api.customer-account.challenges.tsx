/**
 * Customer Account Challenges API
 *
 * Provides challenge data and progress functionality for the customer account extension.
 *
 * GET: Get active challenges and customer's progress
 * POST: Claim challenge completion rewards
 *
 * NOTE: Challenge backend model is not yet implemented. This API returns
 * placeholder responses and will be populated when services are ready.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";

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
// TYPES (Future implementation)
// ============================================

export interface ChallengeObjectiveType {
  type: "SPENDING" | "ORDER_COUNT" | "REFERRAL" | "PRODUCT_PURCHASE" | "REVIEW" | "STREAK";
}

export interface ChallengeReward {
  type: "POINTS" | "STORE_CREDIT" | "DISCOUNT" | "TIER_UPGRADE";
  value: number;
  description: string;
}

export interface CustomerChallenge {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  objectiveType: ChallengeObjectiveType["type"];
  targetValue: number;
  currentProgress: number;
  progressPercent: number;
  reward: ChallengeReward;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "COMPLETED" | "CLAIMED" | "EXPIRED";
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

    // Get points balance for display
    const balance = await getPointsBalance(shop, customerId);

    // TODO: Replace with actual challenge service calls once Challenge model is implemented
    // const challenges = await getCustomerChallenges(shop, customerId);

    // For now, return empty challenges list (feature is enabled but no challenges created yet)
    return json({
      enabled: true,
      authenticated: true,
      challenges: [] as CustomerChallenge[],
      pointsBalance: balance.available,
      config: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
      },
      // Indicate that the feature is available but no challenges exist yet
      message: "No active challenges at the moment. Check back soon!",
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

      // TODO: Implement claim logic once Challenge model is ready
      // const result = await claimChallengeReward({ shop, customerId, challengeId });

      return json({
        success: false,
        error: "Challenge claiming is not yet available",
      }, { status: 501, headers: corsHeaders });
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
