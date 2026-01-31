import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { AuroraDataAPI } from "~/utils/aurora-data-api.server";

/**
 * Protected endpoint to run the psychology models migration.
 * Requires CRON_SECRET for authentication.
 *
 * Usage: POST /api/admin/run-migration
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * DELETE THIS FILE AFTER MIGRATION IS COMPLETE.
 */

const MIGRATION_SQL = `
-- Add Raffle and Mystery Box Psychology Models

-- ENUMS
CREATE TYPE "RaffleActivityType" AS ENUM (
    'ENTRY_PURCHASED', 'INSTANT_WIN', 'GRAND_WINNER',
    'STREAK_MILESTONE', 'EARLY_BIRD', 'LUCKY_NUMBER'
);

CREATE TYPE "RaffleBonusEventType" AS ENUM (
    'HAPPY_HOUR', 'FLASH_BONUS', 'EARLY_BIRD', 'LAST_CHANCE', 'MILESTONE'
);

CREATE TYPE "MysteryBoxActivityType" AS ENUM (
    'BOX_OPENED', 'RARE_WIN', 'EPIC_WIN', 'LEGENDARY_WIN',
    'STREAK_MILESTONE', 'PITY_TRIGGERED', 'LUCKY_STREAK', 'FREE_OPEN_CLAIMED'
);

CREATE TYPE "MysteryBoxBonusEventType" AS ENUM (
    'HAPPY_HOUR', 'FLASH_DISCOUNT', 'DOUBLE_REWARDS', 'LUCKY_HOUR', 'LAST_CHANCE'
);

-- RAFFLE TABLES
CREATE TABLE "RaffleStreak" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastEntryDate" TIMESTAMP(3),
    "streakStartDate" TIMESTAMP(3),
    "freeEntriesUsedToday" INTEGER NOT NULL DEFAULT 0,
    "freeEntryLastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RaffleStreak_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleInstantWin" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "prizeType" "RafflePrizeType" NOT NULL,
    "prizeValue" JSONB NOT NULL,
    "winChancePercent" DECIMAL(7,6) NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "maxWinsTotal" INTEGER,
    "maxWinsPerCustomer" INTEGER NOT NULL DEFAULT 1,
    "currentWinsTotal" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RaffleInstantWin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleInstantWinLog" (
    "id" TEXT NOT NULL,
    "instantWinId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "raffleEntryId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "deliveryData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaffleInstantWinLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleActivity" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "activityType" "RaffleActivityType" NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaffleActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleBonusEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "raffleId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "RaffleBonusEventType" NOT NULL,
    "bonusMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
    "bonusEntriesFlat" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringDays" JSONB,
    "recurringHours" JSONB,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerCustomer" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RaffleBonusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleBonusEventUsage" (
    "id" TEXT NOT NULL,
    "bonusEventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RaffleBonusEventUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleLuckyNumber" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "luckyNumber" INTEGER NOT NULL,
    "bonusType" TEXT NOT NULL,
    "bonusEntries" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaffleLuckyNumber_pkey" PRIMARY KEY ("id")
);

-- MYSTERY BOX TABLES
CREATE TABLE "MysteryBoxStreak" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastOpenDate" TIMESTAMP(3),
    "streakStartDate" TIMESTAMP(3),
    "freeOpensUsedToday" INTEGER NOT NULL DEFAULT 0,
    "freeOpenLastUsedAt" TIMESTAMP(3),
    "luckyStreakCount" INTEGER NOT NULL DEFAULT 0,
    "luckyStreakUpdatedAt" TIMESTAMP(3),
    "commonsSinceRare" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MysteryBoxStreak_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MysteryBoxActivity" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "activityType" "MysteryBoxActivityType" NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MysteryBoxActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MysteryBoxBonusEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "boxId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "MysteryBoxBonusEventType" NOT NULL,
    "discountPercent" SMALLINT NOT NULL DEFAULT 0,
    "bonusMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "extraRewardChance" SMALLINT NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringDays" JSONB,
    "recurringHours" JSONB,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerCustomer" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MysteryBoxBonusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MysteryBoxBonusEventUsage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MysteryBoxBonusEventUsage_pkey" PRIMARY KEY ("id")
);

-- UNIQUE CONSTRAINTS
CREATE UNIQUE INDEX "RaffleStreak_customerId_key" ON "RaffleStreak"("customerId");
CREATE UNIQUE INDEX "RaffleBonusEventUsage_bonusEventId_customerId_key" ON "RaffleBonusEventUsage"("bonusEventId", "customerId");
CREATE UNIQUE INDEX "MysteryBoxStreak_customerId_key" ON "MysteryBoxStreak"("customerId");

-- INDEXES
CREATE INDEX "RaffleStreak_shop_customerId_idx" ON "RaffleStreak"("shop", "customerId");
CREATE INDEX "RaffleStreak_shop_currentStreak_idx" ON "RaffleStreak"("shop", "currentStreak");
CREATE INDEX "RaffleStreak_lastEntryDate_idx" ON "RaffleStreak"("lastEntryDate");
CREATE INDEX "RaffleInstantWin_raffleId_isActive_idx" ON "RaffleInstantWin"("raffleId", "isActive");
CREATE INDEX "RaffleInstantWin_shop_idx" ON "RaffleInstantWin"("shop");
CREATE INDEX "RaffleInstantWinLog_instantWinId_idx" ON "RaffleInstantWinLog"("instantWinId");
CREATE INDEX "RaffleInstantWinLog_customerId_idx" ON "RaffleInstantWinLog"("customerId");
CREATE INDEX "RaffleInstantWinLog_raffleEntryId_idx" ON "RaffleInstantWinLog"("raffleEntryId");
CREATE INDEX "RaffleInstantWinLog_shop_createdAt_idx" ON "RaffleInstantWinLog"("shop", "createdAt");
CREATE INDEX "RaffleActivity_raffleId_createdAt_idx" ON "RaffleActivity"("raffleId", "createdAt");
CREATE INDEX "RaffleActivity_shop_createdAt_idx" ON "RaffleActivity"("shop", "createdAt");
CREATE INDEX "RaffleActivity_activityType_idx" ON "RaffleActivity"("activityType");
CREATE INDEX "RaffleBonusEvent_shop_isActive_idx" ON "RaffleBonusEvent"("shop", "isActive");
CREATE INDEX "RaffleBonusEvent_startsAt_endsAt_idx" ON "RaffleBonusEvent"("startsAt", "endsAt");
CREATE INDEX "RaffleBonusEvent_raffleId_idx" ON "RaffleBonusEvent"("raffleId");
CREATE INDEX "RaffleBonusEventUsage_customerId_idx" ON "RaffleBonusEventUsage"("customerId");
CREATE INDEX "RaffleLuckyNumber_raffleId_idx" ON "RaffleLuckyNumber"("raffleId");
CREATE INDEX "RaffleLuckyNumber_customerId_idx" ON "RaffleLuckyNumber"("customerId");
CREATE INDEX "RaffleLuckyNumber_shop_createdAt_idx" ON "RaffleLuckyNumber"("shop", "createdAt");
CREATE INDEX "MysteryBoxStreak_shop_customerId_idx" ON "MysteryBoxStreak"("shop", "customerId");
CREATE INDEX "MysteryBoxActivity_boxId_createdAt_idx" ON "MysteryBoxActivity"("boxId", "createdAt");
CREATE INDEX "MysteryBoxActivity_shop_createdAt_idx" ON "MysteryBoxActivity"("shop", "createdAt");
CREATE INDEX "MysteryBoxBonusEvent_shop_isActive_idx" ON "MysteryBoxBonusEvent"("shop", "isActive");
CREATE INDEX "MysteryBoxBonusEvent_shop_startsAt_endsAt_idx" ON "MysteryBoxBonusEvent"("shop", "startsAt", "endsAt");
CREATE INDEX "MysteryBoxBonusEventUsage_eventId_customerId_idx" ON "MysteryBoxBonusEventUsage"("eventId", "customerId");
CREATE INDEX "MysteryBoxBonusEventUsage_shop_customerId_idx" ON "MysteryBoxBonusEventUsage"("shop", "customerId");

-- FOREIGN KEYS
ALTER TABLE "RaffleStreak" ADD CONSTRAINT "RaffleStreak_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleInstantWin" ADD CONSTRAINT "RaffleInstantWin_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_instantWinId_fkey" FOREIGN KEY ("instantWinId") REFERENCES "RaffleInstantWin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_raffleEntryId_fkey" FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleActivity" ADD CONSTRAINT "RaffleActivity_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleActivity" ADD CONSTRAINT "RaffleActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RaffleBonusEvent" ADD CONSTRAINT "RaffleBonusEvent_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleBonusEventUsage" ADD CONSTRAINT "RaffleBonusEventUsage_bonusEventId_fkey" FOREIGN KEY ("bonusEventId") REFERENCES "RaffleBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleBonusEventUsage" ADD CONSTRAINT "RaffleBonusEventUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleLuckyNumber" ADD CONSTRAINT "RaffleLuckyNumber_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleLuckyNumber" ADD CONSTRAINT "RaffleLuckyNumber_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxStreak" ADD CONSTRAINT "MysteryBoxStreak_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxActivity" ADD CONSTRAINT "MysteryBoxActivity_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxActivity" ADD CONSTRAINT "MysteryBoxActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxBonusEvent" ADD CONSTRAINT "MysteryBoxBonusEvent_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxBonusEventUsage" ADD CONSTRAINT "MysteryBoxBonusEventUsage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MysteryBoxBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxBonusEventUsage" ADD CONSTRAINT "MysteryBoxBonusEventUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

export async function action({ request }: ActionFunctionArgs) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry-run") === "true";

  console.log("[run-migration] Starting psychology models migration...");
  console.log("[run-migration] Dry run:", dryRun);

  try {
    const dataApi = new AuroraDataAPI();

    // Split into individual statements
    const statements = MIGRATION_SQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s && !s.startsWith("--"));

    console.log(`[run-migration] Found ${statements.length} statements`);

    if (dryRun) {
      return json({
        success: true,
        dryRun: true,
        statementCount: statements.length,
        preview: statements.slice(0, 5).map(s => s.substring(0, 80) + "..."),
      });
    }

    const results: { statement: number; status: string; error?: string }[] = [];

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 60).replace(/\n/g, " ");

      try {
        await dataApi.executeStatement(stmt);
        results.push({ statement: i + 1, status: "success" });
        console.log(`[run-migration] [${i + 1}/${statements.length}] ✓ ${preview}...`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        // "already exists" is OK - idempotent
        if (message.includes("already exists")) {
          results.push({ statement: i + 1, status: "skipped", error: "already exists" });
          console.log(`[run-migration] [${i + 1}/${statements.length}] ⏭️ ${preview}... (already exists)`);
        } else {
          results.push({ statement: i + 1, status: "error", error: message });
          console.error(`[run-migration] [${i + 1}/${statements.length}] ❌ ${preview}...`);
          console.error(`[run-migration] Error: ${message}`);
          // Continue with other statements
        }
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    const skippedCount = results.filter(r => r.status === "skipped").length;
    const errorCount = results.filter(r => r.status === "error").length;

    console.log(`[run-migration] Complete: ${successCount} success, ${skippedCount} skipped, ${errorCount} errors`);

    return json({
      success: errorCount === 0,
      summary: {
        total: statements.length,
        success: successCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      errors: results.filter(r => r.status === "error"),
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[run-migration] Fatal error:", message);
    return json({ error: message }, { status: 500 });
  }
}

export async function loader() {
  return json({
    message: "POST to this endpoint with Authorization: Bearer <CRON_SECRET> to run migration",
    usage: "curl -X POST -H 'Authorization: Bearer $CRON_SECRET' https://your-app.vercel.app/api/admin/run-migration"
  });
}
