/**
 * Customer Account Raffles API
 *
 * Provides raffle data and entry purchase functionality for the customer account extension.
 *
 * GET: Get available raffles and customer's entry status
 * POST: Purchase raffle entries
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";
import {
  getCustomerAvailableRaffles,
  getCustomerRaffleStatus,
  getCustomerRaffleHistory,
  purchaseRaffleEntries,
} from "../services/raffle-entry.server";

const LOG_PREFIX = "[api.customer-account.raffles]";

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Customer-Id",
};

// ============================================
// LOADER - GET raffles data
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
    const raffleId = url.searchParams.get("raffleId");
    const action = url.searchParams.get("action") || "available";

    if (!shop) {
      return json({ error: "Shop parameter required" }, { status: 400, headers: corsHeaders });
    }

    // Get points config to check if raffles are enabled
    const config = await getPointsConfig(shop);

    if (!config.isEnabled || !config.rafflesEnabled) {
      return json({
        enabled: false,
        raffles: [],
        message: "Raffles are not enabled for this store",
      }, { headers: corsHeaders });
    }

    // If no customer, return public raffle list
    if (!customerId) {
      const publicRaffles = await db.raffle.findMany({
        where: {
          shop,
          isPublic: true,
          status: { in: ["SCHEDULED", "ACTIVE"] },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          status: true,
          startsAt: true,
          endsAt: true,
          entryCost: true,
          maxEntriesPerCustomer: true,
          totalEntries: true,
          uniqueEntrants: true,
        },
      });

      return json({
        enabled: true,
        authenticated: false,
        raffles: publicRaffles.map((r: any) => ({
          ...r,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Authenticated customer requests
    if (action === "status" && raffleId) {
      // Get specific raffle status
      const status = await getCustomerRaffleStatus(shop, customerId, raffleId);
      const balance = await getPointsBalance(shop, customerId);

      return json({
        enabled: true,
        authenticated: true,
        raffleStatus: status ? {
          ...status,
          startsAt: status.startsAt.toISOString(),
          endsAt: status.endsAt.toISOString(),
        } : null,
        pointsBalance: balance,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    if (action === "history") {
      // Get customer's raffle history
      const history = await getCustomerRaffleHistory(shop, customerId, {
        limit: 20,
        includeCompleted: true,
      });

      return json({
        enabled: true,
        authenticated: true,
        history: history.map((h) => ({
          ...h,
          createdAt: h.createdAt.toISOString(),
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Default: Get available raffles with customer status
    const raffles = await getCustomerAvailableRaffles(shop, customerId);
    const balance = await getPointsBalance(shop, customerId);

    return json({
      enabled: true,
      authenticated: true,
      raffles: raffles.map((r) => ({
        ...r,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
      })),
      pointsBalance: balance,
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
// ACTION - POST purchase entries
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
    const { shop, customerId, raffleId, quantity, intent } = body;

    if (!shop || !customerId) {
      return json({ error: "shop and customerId are required" }, { status: 400, headers: corsHeaders });
    }

    // Check if points/raffles are enabled
    const config = await getPointsConfig(shop);
    if (!config.isEnabled || !config.rafflesEnabled) {
      return json({
        success: false,
        error: "Raffles are not enabled for this store",
      }, { status: 400, headers: corsHeaders });
    }

    // Purchase entries
    if (intent === "purchase" || !intent) {
      if (!raffleId || !quantity || quantity < 1) {
        return json({
          success: false,
          error: "raffleId and quantity (>= 1) are required",
        }, { status: 400, headers: corsHeaders });
      }

      // Get customer's tier multiplier if they have one
      let tierMultiplier = 1.0;
      try {
        const customer = await db.customer.findFirst({
          where: { id: customerId, shop },
          include: { currentTier: true },
        });
        if (customer?.currentTier?.raffleEntryMultiplier) {
          tierMultiplier = Number(customer.currentTier.raffleEntryMultiplier);
        }
      } catch (e) {
        // Ignore tier lookup errors, use default multiplier
      }

      const result = await purchaseRaffleEntries({
        shop,
        customerId,
        raffleId,
        quantity: parseInt(quantity),
        tierMultiplier,
      });

      if (result.success) {
        return json({
          success: true,
          entryId: result.entryId,
          entriesCount: result.entriesCount,
          totalEntriesCount: result.totalEntriesCount,
          pointsSpent: result.pointsSpent,
          newBalance: result.newBalance,
          message: `Successfully purchased ${result.entriesCount} ${result.entriesCount === 1 ? "entry" : "entries"}!`,
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
