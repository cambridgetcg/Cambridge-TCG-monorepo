/**
 * Customer Account Raffles API
 *
 * Provides raffle data and entry purchase functionality for the customer account extension.
 * Includes psychology features: streaks, instant wins, activity feed, bonus events.
 *
 * GET:
 *   - ?action=available (default): Get available raffles
 *   - ?action=status&raffleId=X: Get specific raffle status
 *   - ?action=history: Get customer's raffle history
 *   - ?action=psychology&raffleId=X: Get psychology dashboard data
 *   - ?action=streak: Get customer's streak info
 *   - ?action=activity&raffleId=X: Get activity feed
 *   - ?action=bonus-events: Get active bonus events
 *
 * POST:
 *   - intent=purchase: Purchase raffle entries
 *   - intent=free-entry: Claim daily free entry
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";
import {
  getCustomerAvailableRaffles,
  getCustomerRaffleStatus,
  getCustomerRaffleHistory,
  purchaseRaffleEntries,
  claimDailyFreeEntry,
} from "../services/raffle-entry.server";
import {
  getPsychologyDashboard,
  getPsychologyState,
} from "../services/raffle-psychology.server";
import { getRaffleStreakInfo } from "../services/raffle-streak.server";
import { getActivityFeed, getShopActivityFeed } from "../services/raffle-activity-feed.server";

const LOG_PREFIX = "[api.customer-account.raffles]";

/**
 * Get computed bonus events from raffle settings (no separate table needed)
 */
async function getComputedBonusEvents(shop: string, raffleId?: string) {
  const where = raffleId
    ? { id: raffleId, shop }
    : { shop, status: "ACTIVE" as const };

  const raffles = await prisma.raffle.findMany({
    where,
    select: {
      id: true,
      name: true,
      totalEntries: true,
      earlyBirdBonusPercent: true,
      earlyBirdEntryLimit: true,
      dailyFreeEntries: true,
      enableStreakBonuses: true,
    },
  });

  const bonusEvents: Array<{
    id: string;
    name: string;
    description: string;
    eventType: string;
    bonusMultiplier: number;
    bonusEntriesFlat: number;
    isCurrentlyActive: boolean;
    timeRemaining: string | null;
    raffleId: string;
    raffleName: string;
  }> = [];

  for (const raffle of raffles) {
    // Early bird bonus
    if (raffle.earlyBirdBonusPercent > 0 && raffle.earlyBirdEntryLimit > 0) {
      const isActive = raffle.totalEntries < raffle.earlyBirdEntryLimit;
      const remaining = raffle.earlyBirdEntryLimit - raffle.totalEntries;

      if (isActive) {
        bonusEvents.push({
          id: `early-bird-${raffle.id}`,
          name: `Early Bird Bonus`,
          description: `Get ${raffle.earlyBirdBonusPercent}% extra entries! ${remaining} spots left.`,
          eventType: "EARLY_BIRD",
          bonusMultiplier: 1 + raffle.earlyBirdBonusPercent / 100,
          bonusEntriesFlat: 0,
          isCurrentlyActive: true,
          timeRemaining: `${remaining} entries remaining`,
          raffleId: raffle.id,
          raffleName: raffle.name,
        });
      }
    }

    // Daily free entries info
    if (raffle.dailyFreeEntries > 0) {
      bonusEvents.push({
        id: `free-entries-${raffle.id}`,
        name: `Daily Free Entries`,
        description: `Claim ${raffle.dailyFreeEntries} free ${raffle.dailyFreeEntries === 1 ? "entry" : "entries"} every day!`,
        eventType: "FREE_ENTRY",
        bonusMultiplier: 1,
        bonusEntriesFlat: raffle.dailyFreeEntries,
        isCurrentlyActive: true,
        timeRemaining: "Resets daily",
        raffleId: raffle.id,
        raffleName: raffle.name,
      });
    }

    // Streak bonus info
    if (raffle.enableStreakBonuses) {
      bonusEvents.push({
        id: `streak-bonus-${raffle.id}`,
        name: `Streak Bonus`,
        description: `Enter multiple days in a row for bonus entries!`,
        eventType: "STREAK",
        bonusMultiplier: 1,
        bonusEntriesFlat: 0,
        isCurrentlyActive: true,
        timeRemaining: null,
        raffleId: raffle.id,
        raffleName: raffle.name,
      });
    }
  }

  return bonusEvents;
}

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
      const publicRaffles = await prisma.raffle.findMany({
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
      // Get customer's raffle history (includes prize details for winners)
      const history = await getCustomerRaffleHistory(shop, customerId, {
        limit: 20,
        includeCompleted: true,
      });

      return json({
        enabled: true,
        authenticated: true,
        history: history.map((h) => ({
          id: h.entryId,
          raffleName: h.raffleName,
          entriesCount: h.entriesCount,
          pointsSpent: h.pointsSpent,
          enteredAt: h.createdAt.toISOString(),
          raffleStatus: h.raffleStatus,
          isWinner: h.isWinner,
          // Enhanced prize details for winners
          prize: h.prize
            ? {
                ...h.prize,
                deliveredAt: h.prize.deliveredAt?.toISOString() || null,
              }
            : null,
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // ============================================
    // PSYCHOLOGY ACTIONS
    // ============================================

    if (action === "psychology") {
      // Get full psychology dashboard data
      const dashboard = await getPsychologyDashboard(shop, customerId, raffleId || undefined);
      const balance = await getPointsBalance(shop, customerId);

      return json({
        enabled: true,
        authenticated: true,
        psychology: {
          streak: dashboard.streak,
          activeBonusEvents: dashboard.activeBonusEvents.map((e) => ({
            ...e,
            startsAt: e.startsAt.toISOString(),
            endsAt: e.endsAt.toISOString(),
          })),
          activityFeed: dashboard.activityFeed.map((a) => ({
            ...a,
            createdAt: a.createdAt.toISOString(),
          })),
          upcomingMilestones: dashboard.upcomingMilestones,
        },
        pointsBalance: balance,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    if (action === "streak") {
      // Get customer's streak info
      const streakInfo = await getRaffleStreakInfo(shop, customerId);

      return json({
        enabled: true,
        authenticated: true,
        streak: streakInfo,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    if (action === "activity") {
      // Get activity feed (for specific raffle or shop-wide)
      const activities = raffleId
        ? await getActivityFeed(raffleId, 20)
        : await getShopActivityFeed(shop, 20);

      return json({
        enabled: true,
        authenticated: true,
        activities: activities.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    if (action === "bonus-events") {
      // Get computed bonus events from raffle settings
      const events = await getComputedBonusEvents(shop, raffleId || undefined);

      return json({
        enabled: true,
        authenticated: true,
        bonusEvents: events,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Default: Get available raffles with customer status and psychology state
    const [raffles, balance, psychologyState] = await Promise.all([
      getCustomerAvailableRaffles(shop, customerId),
      getPointsBalance(shop, customerId),
      getPsychologyState(shop, customerId),
    ]);

    return json({
      enabled: true,
      authenticated: true,
      raffles: raffles.map((r) => ({
        ...r,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
      })),
      pointsBalance: balance,
      // Include psychology state for quick access
      psychology: {
        streak: psychologyState.streak,
        hasActiveBonusEvents: psychologyState.hasActiveBonusEvents,
        bestBonusEvent: psychologyState.bestBonusEvent
          ? {
              ...psychologyState.bestBonusEvent,
              startsAt: psychologyState.bestBonusEvent.startsAt.toISOString(),
              endsAt: psychologyState.bestBonusEvent.endsAt.toISOString(),
            }
          : null,
      },
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
        const customer = await prisma.customer.findFirst({
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
        // Build message with bonus info
        let message = `Successfully purchased ${result.entriesCount} ${result.entriesCount === 1 ? "entry" : "entries"}!`;
        if (result.finalEntries && result.finalEntries > result.entriesCount!) {
          message += ` +${result.finalEntries - result.entriesCount!} bonus entries!`;
        }

        return json({
          success: true,
          entryId: result.entryId,
          entriesCount: result.entriesCount,
          totalEntriesCount: result.totalEntriesCount,
          pointsSpent: result.pointsSpent,
          newBalance: result.newBalance,
          message,
          // Psychology data
          finalEntries: result.finalEntries,
          bonuses: result.bonuses,
          instantWins: result.instantWins?.map((w) => ({
            won: w.won,
            prize: w.prize
              ? {
                  name: w.prize.name,
                  rarity: w.prize.rarity,
                  prizeType: w.prize.prizeType,
                }
              : null,
            nearMiss: w.nearMiss
              ? {
                  name: w.nearMiss.name,
                  rarity: w.nearMiss.rarity,
                }
              : null,
            message: w.message,
          })),
          streakInfo: result.streakInfo,
          celebrations: result.celebrations,
        }, { headers: corsHeaders });
      } else {
        return json({
          success: false,
          error: result.error,
        }, { status: 400, headers: corsHeaders });
      }
    }

    // Claim free entry
    if (intent === "free-entry") {
      if (!raffleId) {
        return json({
          success: false,
          error: "raffleId is required",
        }, { status: 400, headers: corsHeaders });
      }

      const result = await claimDailyFreeEntry(shop, customerId, raffleId);

      if (result.success) {
        return json({
          success: true,
          entryId: result.entryId,
          entriesCount: 1,
          totalEntriesCount: result.totalEntriesCount,
          pointsSpent: 0,
          message: "Free entry claimed!",
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
