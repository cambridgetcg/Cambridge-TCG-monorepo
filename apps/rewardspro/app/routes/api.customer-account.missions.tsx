/**
 * Customer Account Missions API
 *
 * Provides gamified missions data and functionality for the customer account extension.
 *
 * GET: Get missions with player stats (XP, level, streak, combo)
 * POST: Claim mission rewards, acknowledge events
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";
import {
  getMissionsForCustomer,
  getPlayerStats,
} from "../services/mission-stats.server";
import {
  acknowledgeEvents,
} from "../services/mission-events.server";
import { claimChallengeReward } from "../services/challenge-claim.server";
import db from "../db.server";

const LOG_PREFIX = "[api.customer-account.missions]";

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Customer-Id",
};

// ============================================
// LOADER - GET missions data with player stats
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
    const action = url.searchParams.get("action") || "missions";

    if (!shop) {
      return json({ error: "Shop parameter required" }, { status: 400, headers: corsHeaders });
    }

    // Get points config to check if missions are enabled
    const config = await getPointsConfig(shop);

    if (!config.isEnabled || !config.missionsEnabled) {
      return json({
        success: true,
        enabled: false,
        missions: { daily: [], weekly: [], monthly: [], special: [] },
        player: null,
        pendingEvents: [],
        message: "Missions are not enabled for this store",
      }, { headers: corsHeaders });
    }

    // If no customer, return public info only
    if (!customerId) {
      return json({
        success: true,
        enabled: true,
        authenticated: false,
        missions: { daily: [], weekly: [], monthly: [], special: [] },
        player: null,
        pendingEvents: [],
        message: "Sign in to view and participate in missions",
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
        success: true,
        enabled: true,
        authenticated: false,
        missions: { daily: [], weekly: [], monthly: [], special: [] },
        player: null,
        pendingEvents: [],
        message: "Customer not found",
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Handle different actions
    if (action === "player") {
      // Lightweight player stats only
      const player = await getPlayerStats(shop, customerId);

      return json({
        success: true,
        enabled: true,
        authenticated: true,
        player,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Default: Get full missions data with player stats
    const missionsData = await getMissionsForCustomer(shop, customerId);

    return json({
      success: true,
      enabled: true,
      authenticated: true,
      player: missionsData.player,
      missions: missionsData.missions,
      pendingEvents: missionsData.pendingEvents,
      config: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
      },
      message: null,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    return json({
      success: false,
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500, headers: corsHeaders });
  }
};

// ============================================
// ACTION - POST claim mission reward, acknowledge events
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
    const { shop, customerId, intent } = body;

    if (!shop || !customerId) {
      return json({ error: "shop and customerId are required" }, { status: 400, headers: corsHeaders });
    }

    // Check if missions are enabled
    const config = await getPointsConfig(shop);
    if (!config.isEnabled || !config.missionsEnabled) {
      return json({
        success: false,
        error: "Missions are not enabled for this store",
      }, { status: 400, headers: corsHeaders });
    }

    // Claim mission reward
    if (intent === "claim") {
      const { missionId } = body;

      if (!missionId) {
        return json({
          success: false,
          error: "missionId is required",
        }, { status: 400, headers: corsHeaders });
      }

      // Use the challenge claim service (missions are challenges under the hood)
      const result = await claimChallengeReward(shop, customerId, missionId);

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

    // Acknowledge events
    if (intent === "acknowledge") {
      const { eventIds } = body;

      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        return json({
          success: false,
          error: "eventIds array is required",
        }, { status: 400, headers: corsHeaders });
      }

      await acknowledgeEvents(shop, customerId, eventIds);

      return json({
        success: true,
        acknowledged: eventIds.length,
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
