/**
 * Customer Account Mystery Boxes API
 *
 * Provides mystery box data and opening functionality for the customer account extension.
 *
 * GET: Get available mystery boxes and customer's open status
 * POST: Open a mystery box
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";
import {
  getCustomerAvailableBoxes,
  getCustomerOpenHistory,
  openMysteryBox,
} from "../services/mystery-box-open.server";

const LOG_PREFIX = "[api.customer-account.mystery-boxes]";

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Customer-Id",
};

// ============================================
// LOADER - GET mystery boxes data
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

    // Get points config to check if mystery boxes are enabled
    const config = await getPointsConfig(shop);

    if (!config.isEnabled || !config.mysteryBoxEnabled) {
      return json({
        enabled: false,
        boxes: [],
        message: "Mystery boxes are not enabled for this store",
      }, { headers: corsHeaders });
    }

    // If no customer, return public info only
    if (!customerId) {
      // For unauthenticated users, just indicate feature is enabled
      return json({
        enabled: true,
        authenticated: false,
        boxes: [],
        message: "Sign in to view and open mystery boxes",
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Authenticated customer requests
    if (action === "history") {
      // Get customer's mystery box opening history
      const history = await getCustomerOpenHistory(shop, customerId, {
        limit: 20,
      });

      return json({
        enabled: true,
        authenticated: true,
        history: history.map((h) => ({
          ...h,
          openedAt: h.openedAt.toISOString(),
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Default: Get available mystery boxes with customer status
    const boxes = await getCustomerAvailableBoxes(shop, customerId);
    const balance = await getPointsBalance(shop, customerId);

    return json({
      enabled: true,
      authenticated: true,
      boxes: boxes.map((box) => ({
        id: box.boxId,
        name: box.boxName,
        description: box.description,
        imageUrl: box.imageUrl,
        status: box.status,
        openCost: box.openCost,
        customerOpens: box.customerOpens,
        maxOpensPerCustomer: box.maxOpensPerCustomer,
        canOpen: box.canOpen,
        reason: box.reason,
        opensRemaining: box.maxOpensPerCustomer - box.customerOpens,
        startsAt: box.startsAt.toISOString(),
        endsAt: box.endsAt.toISOString(),
        totalOpens: box.totalOpens,
        uniqueOpeners: box.uniqueOpeners,
      })),
      pointsBalance: balance.available,
      config: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
      },
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
// ACTION - POST open mystery box
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
    const { shop, customerId, boxId, intent } = body;

    if (!shop || !customerId) {
      return json({ error: "shop and customerId are required" }, { status: 400, headers: corsHeaders });
    }

    // Check if points/mystery boxes are enabled
    const config = await getPointsConfig(shop);
    if (!config.isEnabled || !config.mysteryBoxEnabled) {
      return json({
        success: false,
        error: "Mystery boxes are not enabled for this store",
      }, { status: 400, headers: corsHeaders });
    }

    // Open mystery box
    if (intent === "open" || !intent) {
      if (!boxId) {
        return json({
          success: false,
          error: "boxId is required",
        }, { status: 400, headers: corsHeaders });
      }

      const result = await openMysteryBox({
        shop,
        customerId,
        boxId,
      });

      if (result.success) {
        return json({
          success: true,
          openId: result.openId,
          winnerId: result.winnerId,
          reward: {
            name: result.rewardName,
            type: result.rewardType,
            value: result.rewardValue,
            rarity: result.rarity,
          },
          pointsSpent: result.pointsSpent,
          newBalance: result.newBalance,
          message: `You won: ${result.rewardName}!`,
        }, { headers: corsHeaders });
      } else {
        return json({
          success: false,
          error: result.error,
        }, { status: 400, headers: corsHeaders });
      }
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
