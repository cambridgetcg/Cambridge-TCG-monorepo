/**
 * Mission Scheduler Service
 *
 * Generates Challenge instances from MissionTemplate records based on cadence.
 * - DAILY templates generate a new challenge each day
 * - WEEKLY templates generate a new challenge each Monday
 * - MONTHLY templates generate a new challenge on the 1st of each month
 * - SPECIAL templates don't auto-generate (they're one-time or manual)
 */

import db from "~/db.server";
import type { MissionCadence, MissionTemplate, Challenge } from "@prisma/client";
import * as crypto from "crypto";

interface ScheduleResult {
  generated: number;
  skipped: number;
  errors: number;
  details: Array<{
    templateId: string;
    templateName: string;
    shop: string;
    action: "generated" | "skipped" | "error";
    reason?: string;
    challengeId?: string;
  }>;
}

/**
 * Calculate the start and end dates for a mission based on cadence
 */
function calculateDates(cadence: MissionCadence): { startsAt: Date; endsAt: Date } {
  const now = new Date();

  // Start at midnight today in UTC
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  let endsAt: Date;

  switch (cadence) {
    case "DAILY":
      // Ends at 11:59:59.999 PM today
      endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      break;

    case "WEEKLY":
      // Ends at 11:59:59.999 PM on Sunday
      const daysUntilSunday = 7 - now.getUTCDay();
      endsAt = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilSunday,
        23, 59, 59, 999
      ));
      break;

    case "MONTHLY":
      // Ends at 11:59:59.999 PM on last day of month
      const lastDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      endsAt = new Date(Date.UTC(
        lastDayOfMonth.getUTCFullYear(),
        lastDayOfMonth.getUTCMonth(),
        lastDayOfMonth.getUTCDate(),
        23, 59, 59, 999
      ));
      break;

    default:
      // SPECIAL - default to 30 days
      endsAt = new Date(startsAt);
      endsAt.setUTCDate(endsAt.getUTCDate() + 30);
      endsAt.setUTCHours(23, 59, 59, 999);
      break;
  }

  return { startsAt, endsAt };
}

/**
 * Check if we should generate for this cadence today
 */
function shouldGenerateToday(cadence: MissionCadence): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday
  const dayOfMonth = now.getUTCDate();

  switch (cadence) {
    case "DAILY":
      // Always generate for daily
      return true;

    case "WEEKLY":
      // Generate on Monday (day 1)
      return dayOfWeek === 1;

    case "MONTHLY":
      // Generate on the 1st
      return dayOfMonth === 1;

    case "SPECIAL":
      // Never auto-generate SPECIAL missions
      return false;

    default:
      return false;
  }
}

/**
 * Check if a challenge already exists for this template in the current period
 */
async function hasExistingInstance(
  templateId: string,
  shop: string,
  cadence: MissionCadence
): Promise<boolean> {
  const { startsAt, endsAt } = calculateDates(cadence);

  // Look for any challenge from this template that overlaps with the current period
  const existing = await db.challenge.findFirst({
    where: {
      templateId,
      shop,
      // Check for overlapping time period
      OR: [
        // Starts within our period
        { startsAt: { gte: startsAt, lte: endsAt } },
        // Ends within our period
        { endsAt: { gte: startsAt, lte: endsAt } },
        // Encompasses our period
        {
          startsAt: { lte: startsAt },
          endsAt: { gte: endsAt }
        }
      ],
      // Not cancelled
      status: { not: "CANCELLED" }
    }
  });

  return !!existing;
}

/**
 * Generate a Challenge instance from a MissionTemplate
 */
async function generateFromTemplate(
  template: MissionTemplate
): Promise<Challenge> {
  const { startsAt, endsAt } = calculateDates(template.cadence);
  const now = new Date();

  // Determine initial status
  // If start time is in the past or now, start as ACTIVE
  // If start time is in the future, start as SCHEDULED
  const status = startsAt <= now ? "ACTIVE" : "SCHEDULED";

  const challenge = await db.challenge.create({
    data: {
      id: crypto.randomUUID(),
      shop: template.shop,
      name: template.name,
      description: template.description,
      imageUrl: template.imageUrl,
      status,
      startsAt,
      endsAt,
      objectiveType: template.objectiveType,
      targetValue: template.targetValue,
      objectiveConfig: template.objectiveConfig ?? undefined,
      cadence: template.cadence,
      rarity: template.rarity,
      category: template.category,
      xpReward: template.xpReward,
      rewardType: template.rewardType,
      rewardValue: template.rewardValue,
      rewardDescription: template.rewardDescription,
      iconEmoji: template.iconEmoji,
      tierRestrictions: template.tierRestrictions ?? undefined,
      templateId: template.id,
      isPublic: true,
      comboEligible: true,
      streakEligible: true
    }
  });

  return challenge;
}

/**
 * Generate mission instances from active templates
 *
 * @param options.cadence - Only generate for this cadence (optional)
 * @param options.shop - Only generate for this shop (optional)
 * @param options.dryRun - If true, don't actually create challenges
 * @returns Summary of what was generated
 */
export async function generateMissionInstances(options: {
  cadence?: MissionCadence;
  shop?: string;
  dryRun?: boolean;
} = {}): Promise<ScheduleResult> {
  const { cadence, shop, dryRun = false } = options;

  const result: ScheduleResult = {
    generated: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  // Build where clause for templates
  const where: any = { isActive: true };

  if (cadence) {
    where.cadence = cadence;
  } else {
    // Exclude SPECIAL since they don't auto-generate
    where.cadence = { not: "SPECIAL" };
  }

  if (shop) {
    where.shop = shop;
  }

  // Get all active templates that match criteria
  const templates = await db.missionTemplate.findMany({
    where,
    orderBy: [{ shop: "asc" }, { cadence: "asc" }, { sortOrder: "asc" }]
  });

  for (const template of templates) {
    try {
      // Check if we should generate for this cadence today
      if (!shouldGenerateToday(template.cadence)) {
        result.skipped++;
        result.details.push({
          templateId: template.id,
          templateName: template.name,
          shop: template.shop,
          action: "skipped",
          reason: `Not scheduled for today (cadence: ${template.cadence})`
        });
        continue;
      }

      // Check if instance already exists for this period
      const hasExisting = await hasExistingInstance(template.id, template.shop, template.cadence);
      if (hasExisting) {
        result.skipped++;
        result.details.push({
          templateId: template.id,
          templateName: template.name,
          shop: template.shop,
          action: "skipped",
          reason: "Instance already exists for current period"
        });
        continue;
      }

      // Generate the challenge
      if (!dryRun) {
        const challenge = await generateFromTemplate(template);
        result.generated++;
        result.details.push({
          templateId: template.id,
          templateName: template.name,
          shop: template.shop,
          action: "generated",
          challengeId: challenge.id
        });
      } else {
        // Dry run
        result.generated++;
        result.details.push({
          templateId: template.id,
          templateName: template.name,
          shop: template.shop,
          action: "generated",
          reason: "Dry run - would generate"
        });
      }
    } catch (error: any) {
      result.errors++;
      result.details.push({
        templateId: template.id,
        templateName: template.name,
        shop: template.shop,
        action: "error",
        reason: error.message
      });
    }
  }

  return result;
}

/**
 * Close previous day's daily missions that are still ACTIVE
 * This handles edge cases where the status cron didn't run
 */
export async function closePreviousDailyMissions(shop?: string): Promise<number> {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  const where: any = {
    cadence: "DAILY",
    status: "ACTIVE",
    endsAt: { lt: startOfToday }
  };

  if (shop) {
    where.shop = shop;
  }

  const result = await db.challenge.updateMany({
    where,
    data: { status: "CLOSED" }
  });

  return result.count;
}
