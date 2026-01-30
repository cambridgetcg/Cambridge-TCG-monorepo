/**
 * Customer Account Mystery Boxes API
 *
 * Provides mystery box data and opening functionality for the customer account extension.
 *
 * GET Actions:
 * - available (default): Get available mystery boxes with customer status
 * - history: Get customer's opening history
 * - psychology: Get full psychology state (streak, pity, bonuses, activity feed)
 * - streak: Get streak info only
 * - activity: Get activity feed only
 * - bonus-events: Get active bonus events
 *
 * POST Intents:
 * - open: Open a mystery box (enhanced with psychology)
 * - free-open: Claim a daily free open
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getPointsConfig } from "../services/points-config.server";
import { getPointsBalance } from "../services/points-ledger.server";
import {
  getCustomerAvailableBoxes,
  getCustomerOpenHistory,
  openMysteryBoxEnhanced,
} from "../services/mystery-box-open.server";
import {
  getPsychologyDashboard,
  calculatePreOpenBonuses,
  processFreeOpen,
  type PsychologyContext,
} from "../services/mystery-box-psychology.server";
import {
  getMysteryBoxStreak,
  canClaimFreeOpen,
} from "../services/mystery-box-streak.server";
import { getActivityFeed, getRecentWinners } from "../services/mystery-box-activity-feed.server";
import { getActiveBonusEvents, getBestBonusEvent } from "../services/mystery-box-bonus-events.server";
import db from "../db.server";

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

    if (!config.isEnabled || !config.mysteryBoxesEnabled) {
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

    // Psychology: Get full psychology dashboard
    if (action === "psychology") {
      const boxId = url.searchParams.get("boxId") || undefined;

      // Get box-specific config if boxId provided
      let pityThreshold = 10;
      if (boxId) {
        const box = await db.mysteryBox.findFirst({
          where: { id: boxId, shop },
          select: { pityThreshold: true },
        });
        if (box) {
          pityThreshold = box.pityThreshold;
        }
      }

      const dashboard = await getPsychologyDashboard({
        shop,
        customerId,
        boxId,
        pityThreshold,
      });

      return json({
        enabled: true,
        authenticated: true,
        psychology: {
          streak: {
            currentStreak: dashboard.streak.currentStreak,
            longestStreak: dashboard.streak.longestStreak,
            bonusPercent: dashboard.streak.bonusPercent,
            bonusMultiplier: dashboard.streak.bonusMultiplier,
            lastOpenDate: dashboard.streak.lastOpenDate?.toISOString() || null,
            streakEmoji: dashboard.streak.streakEmoji,
            streakLabel: dashboard.streak.streakLabel,
            hoursUntilStreakLoss: dashboard.streak.hoursUntilStreakLoss,
            freeOpensAvailable: dashboard.streak.freeOpensAvailable,
            canClaimFreeOpen: dashboard.streak.canClaimFreeOpen,
          },
          luckyStreak: dashboard.luckyStreak,
          pity: {
            commonsSinceRare: dashboard.pity.commonsSinceRare,
            threshold: dashboard.pity.threshold,
            progress: dashboard.pity.progress,
            willTrigger: dashboard.pity.willTrigger,
            minimumRarity: dashboard.pity.minimumRarity,
          },
          bonusEvents: dashboard.bonusEvents.map((e) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            eventType: e.eventType,
            discountPercent: e.discountPercent,
            bonusMultiplier: e.bonusMultiplier,
            endsAt: e.endsAt.toISOString(),
            timeRemaining: e.timeRemaining,
            secondsRemaining: e.secondsRemaining,
          })),
          bestBonusEvent: dashboard.bestBonusEvent
            ? {
                id: dashboard.bestBonusEvent.id,
                name: dashboard.bestBonusEvent.name,
                discountPercent: dashboard.bestBonusEvent.discountPercent,
                bonusMultiplier: dashboard.bestBonusEvent.bonusMultiplier,
                timeRemaining: dashboard.bestBonusEvent.timeRemaining,
              }
            : null,
          activities: dashboard.activities.map((a) => ({
            id: a.id,
            activityType: a.activityType,
            displayName: a.displayName,
            data: a.data,
            timeAgo: a.timeAgo,
            emoji: a.emoji,
            createdAt: a.createdAt.toISOString(),
          })),
        },
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Streak: Get streak info only
    if (action === "streak") {
      const streakInfo = await getMysteryBoxStreak(shop, customerId);

      // Check if free open is available (need to get a box for dailyFreeOpens config)
      const boxes = await db.mysteryBox.findMany({
        where: { shop, status: "ACTIVE", isPublic: true },
        select: { dailyFreeOpens: true },
        take: 1,
      });
      const dailyFreeOpens = boxes[0]?.dailyFreeOpens || 0;
      const canClaimFree = await canClaimFreeOpen(customerId, dailyFreeOpens);

      return json({
        enabled: true,
        authenticated: true,
        streak: {
          currentStreak: streakInfo.currentStreak,
          longestStreak: streakInfo.longestStreak,
          bonusPercent: streakInfo.bonusPercent,
          bonusMultiplier: streakInfo.bonusMultiplier,
          lastOpenDate: streakInfo.lastOpenDate?.toISOString() || null,
          streakEmoji: streakInfo.streakEmoji,
          streakLabel: streakInfo.streakLabel,
          hoursUntilStreakLoss: streakInfo.hoursUntilStreakLoss,
          freeOpensAvailable: streakInfo.freeOpensAvailable,
          canClaimFreeOpen: canClaimFree,
        },
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Activity: Get activity feed only
    if (action === "activity") {
      const boxId = url.searchParams.get("boxId") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "10", 10);

      const activities = await getActivityFeed({ shop, boxId, limit });

      return json({
        enabled: true,
        authenticated: true,
        activities: activities.map((a) => ({
          id: a.id,
          activityType: a.activityType,
          displayName: a.displayName,
          data: a.data,
          timeAgo: a.timeAgo,
          emoji: a.emoji,
          createdAt: a.createdAt.toISOString(),
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Bonus events: Get active bonus events
    if (action === "bonus-events") {
      const boxId = url.searchParams.get("boxId") || undefined;

      const [events, bestEvent] = await Promise.all([
        getActiveBonusEvents({ shop, boxId }),
        getBestBonusEvent({ shop, boxId, customerId }),
      ]);

      return json({
        enabled: true,
        authenticated: true,
        bonusEvents: events.map((e) => ({
          id: e.id,
          name: e.name,
          description: e.description,
          eventType: e.eventType,
          discountPercent: e.discountPercent,
          bonusMultiplier: e.bonusMultiplier,
          endsAt: e.endsAt.toISOString(),
          timeRemaining: e.timeRemaining,
          secondsRemaining: e.secondsRemaining,
        })),
        bestBonusEvent: bestEvent.event
          ? {
              id: bestEvent.event.id,
              name: bestEvent.event.name,
              discountPercent: bestEvent.discountPercent,
              bonusMultiplier: bestEvent.bonusMultiplier,
              timeRemaining: bestEvent.event.timeRemaining,
            }
          : null,
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Pre-open: Calculate bonuses before opening (for UI preview)
    if (action === "pre-open") {
      const boxId = url.searchParams.get("boxId");
      if (!boxId) {
        return json({ error: "boxId is required for pre-open" }, { status: 400, headers: corsHeaders });
      }

      const box = await db.mysteryBox.findFirst({
        where: { id: boxId, shop },
      });

      if (!box) {
        return json({ error: "Mystery box not found" }, { status: 404, headers: corsHeaders });
      }

      const customer = await db.customer.findUnique({
        where: { id: customerId },
        select: { firstName: true, lastName: true },
      });

      const context: PsychologyContext = {
        shop,
        customerId,
        boxId,
        boxName: box.name,
        firstName: customer?.firstName || null,
        lastName: customer?.lastName || null,
        originalCost: box.openCost,
        dailyFreeOpens: box.dailyFreeOpens,
        pityThreshold: box.pityThreshold,
        enableStreakBonuses: box.enableStreakBonuses,
        enablePitySystem: box.enablePitySystem,
        enableLuckyStreak: box.enableLuckyStreak,
        enableActivityFeed: box.enableActivityFeed,
      };

      const preOpen = await calculatePreOpenBonuses(context);
      const canClaimFree = await canClaimFreeOpen(customerId, box.dailyFreeOpens);

      return json({
        enabled: true,
        authenticated: true,
        preOpen: {
          originalCost: box.openCost,
          discountedCost: preOpen.discountedCost,
          discountPercent: preOpen.discountPercent,
          bonusMultiplier: preOpen.bonusMultiplier,
          streakBonus: preOpen.streakBonus,
          luckyStreakBonus: preOpen.luckyStreakBonus,
          eventBonus: preOpen.eventBonus
            ? {
                id: preOpen.eventBonus.id,
                name: preOpen.eventBonus.name,
                discountPercent: preOpen.eventBonus.discountPercent,
                timeRemaining: preOpen.eventBonus.timeRemaining,
              }
            : null,
          pityWillTrigger: preOpen.pityWillTrigger,
          minimumRarity: preOpen.minimumRarity,
          canClaimFreeOpen: canClaimFree,
        },
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Recent winners: Get recent winners for social proof
    if (action === "recent-winners") {
      const boxId = url.searchParams.get("boxId");
      if (!boxId) {
        return json({ error: "boxId is required for recent-winners" }, { status: 400, headers: corsHeaders });
      }

      const limit = parseInt(url.searchParams.get("limit") || "5", 10);
      const winners = await getRecentWinners({ boxId, shop, limit });

      return json({
        enabled: true,
        authenticated: true,
        recentWinners: winners.map((w) => ({
          id: w.id,
          activityType: w.activityType,
          displayName: w.displayName,
          data: w.data,
          timeAgo: w.timeAgo,
          emoji: w.emoji,
          createdAt: w.createdAt.toISOString(),
        })),
        config: {
          currencyName: config.currencyName,
          currencyIcon: config.currencyIcon,
        },
      }, { headers: corsHeaders });
    }

    // Default: Get available mystery boxes with customer status (enhanced with psychology)
    const boxes = await getCustomerAvailableBoxes(shop, customerId);
    const balance = await getPointsBalance(shop, customerId);
    const streakInfo = await getMysteryBoxStreak(shop, customerId);

    // Get free open availability based on the first active box's config
    const activeBoxConfigs = await db.mysteryBox.findMany({
      where: { shop, status: "ACTIVE", isPublic: true },
      select: { id: true, dailyFreeOpens: true },
    });
    const dailyFreeOpens = activeBoxConfigs[0]?.dailyFreeOpens || 0;
    const canClaimFree = dailyFreeOpens > 0 ? await canClaimFreeOpen(customerId, dailyFreeOpens) : false;

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
      streak: {
        currentStreak: streakInfo.currentStreak,
        bonusPercent: streakInfo.bonusPercent,
        streakEmoji: streakInfo.streakEmoji,
        streakLabel: streakInfo.streakLabel,
        freeOpensAvailable: streakInfo.freeOpensAvailable,
        canClaimFreeOpen: canClaimFree,
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
    if (!config.isEnabled || !config.mysteryBoxesEnabled) {
      return json({
        success: false,
        error: "Mystery boxes are not enabled for this store",
      }, { status: 400, headers: corsHeaders });
    }

    // Free open: Claim a daily free mystery box open
    if (intent === "free-open") {
      if (!boxId) {
        return json({
          success: false,
          error: "boxId is required for free-open",
        }, { status: 400, headers: corsHeaders });
      }

      // Get box configuration
      const box = await db.mysteryBox.findFirst({
        where: { id: boxId, shop },
      });

      if (!box) {
        return json({
          success: false,
          error: "Mystery box not found",
        }, { status: 404, headers: corsHeaders });
      }

      if (box.dailyFreeOpens <= 0) {
        return json({
          success: false,
          error: "This mystery box does not offer free opens",
        }, { status: 400, headers: corsHeaders });
      }

      // Check eligibility for free open
      const canClaim = await canClaimFreeOpen(customerId, box.dailyFreeOpens);
      if (!canClaim) {
        return json({
          success: false,
          error: "No free opens available today. Come back tomorrow!",
        }, { status: 400, headers: corsHeaders });
      }

      // Process the free open using enhanced function
      const result = await openMysteryBoxEnhanced({
        shop,
        customerId,
        boxId,
        isFreeOpen: true,
      });

      if (result.success) {
        return json({
          success: true,
          openId: result.openId,
          winnerId: result.winnerId,
          reward: result.reward,
          pointsSpent: 0,
          originalCost: result.originalCost,
          discountApplied: result.originalCost, // Full discount for free open
          newBalance: result.newBalance,
          bonuses: result.bonuses,
          nearMiss: result.nearMiss,
          pityProgress: result.pityProgress,
          celebrations: result.celebrations,
          isFreeOpen: true,
          message: `Free open! You won: ${result.reward?.name}!`,
        }, { headers: corsHeaders });
      } else {
        return json({
          success: false,
          error: result.error,
        }, { status: 400, headers: corsHeaders });
      }
    }

    // Open mystery box (enhanced with psychology)
    if (intent === "open" || !intent) {
      if (!boxId) {
        return json({
          success: false,
          error: "boxId is required",
        }, { status: 400, headers: corsHeaders });
      }

      const result = await openMysteryBoxEnhanced({
        shop,
        customerId,
        boxId,
        isFreeOpen: false,
      });

      if (result.success) {
        return json({
          success: true,
          openId: result.openId,
          winnerId: result.winnerId,
          reward: result.reward,
          pointsSpent: result.pointsSpent,
          originalCost: result.originalCost,
          discountApplied: result.discountApplied,
          newBalance: result.newBalance,
          bonuses: result.bonuses,
          nearMiss: result.nearMiss,
          pityProgress: result.pityProgress,
          celebrations: result.celebrations,
          isFreeOpen: result.isFreeOpen,
          message: `You won: ${result.reward?.name}!`,
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
