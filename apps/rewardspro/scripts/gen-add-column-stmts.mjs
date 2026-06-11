#!/usr/bin/env node
/**
 * Generate authoritative ALTER TABLE ADD COLUMN statements for the schema-vs-DB
 * drift, by extracting the column declarations from the full CREATE TABLE
 * statements in /tmp/full-create.sql (output of prisma migrate diff --from-empty).
 *
 * Reads the drift map from /tmp/drift-add.json and emits SQL to stdout.
 */
import { readFileSync } from "fs";

// Models + fields that need ADD COLUMN — derived from drift report. Tables
// that need CREATE (Q1 + Q2) are handled separately.
const ADDS = {
  ShopSettings: [
    "subscriptionStatus", "subscriptionUpdatedAt", "currentPlanName",
    "usageCapReached", "usageCapReachedAt", "reviewBannerDismissed",
    "reviewClickedAt", "emailProvider", "emailLogo", "emailPrimaryColor",
    "emailSecondaryColor", "emailBackgroundColor", "emailContentBgColor",
    "emailLinkColor", "emailFontFamily", "brandKitEnabled",
  ],
  ShopEntitlements: [
    "featureIntegrationKlaviyo", "featureIntegrationSendgrid",
    "featureIntegrationJudgeme", "featureIntegrationSlack",
    "featureIntegrationRecharge", "featureIntegrationGorgias",
    "featureIntegrationZapier", "limitMaxAutomations",
    "limitMaxCustomersSync", "limitMaxTierProducts", "limitMaxHistoricalDays",
  ],
  CustomerTierState:    ["manualOverrideTierId"],
  StoreCreditLedger:    ["shopifyTransactionId", "syncedAt", "syncStatus"],
  MonthlyOrderUsage:    ["isLocked", "lockedAt", "lockReason"],
  TierSubscription:     ["lastPaymentFailure", "pauseReason", "skipCount", "lastSkipDate", "deliveryInterval"],
  SellingPlanGroup:     ["tierProducts", "metadata"],
  SellingPlan:          ["groupId", "shopifyPlanId", "options", "metadata", "basePrice", "currentDiscount", "lastPriceUpdate"],
  BulkOperationLog:     ["report"], // successful, failed, total handled by RENAME
  Order:                ["cashbackPercentAtOrder", "syncedAt", "syncVersion"],
  Raffle: [
    "enableInstantWins", "enableActivityFeed", "enableStreakBonuses",
    "enableLuckyNumbers", "dailyFreeEntries", "earlyBirdBonusPercent",
    "earlyBirdEntryLimit",
  ],
  RaffleEntry: [
    "streakBonusApplied", "earlyBirdBonusApplied", "luckyNumberBonus",
    "bonusEventId", "instantWinsTriggered", "isFreeEntry",
  ],
  MysteryBox: [
    "enableActivityFeed", "enableStreakBonuses", "enablePitySystem",
    "enableLuckyStreak", "dailyFreeOpens", "pityThreshold",
    "luckyStreakMultiplier",
  ],
  MysteryBoxOpen: [
    "streakDay", "streakBonusApplied", "luckyStreakCount", "luckyStreakBonus",
    "bonusEventId", "discountApplied", "isFreeOpen", "pityTriggered",
    "nearMissRewardId",
  ],
  Challenge: [
    // totalParticipants/completedCount/claimedCount/totalRewardsAwarded are RENAMEs
    // (not ADDs) — handled outside this generator.
  ],
  ReconciliationLog: [
    "localState", "shopifyState", "mismatches", "resolution",
    "resolvedAt", "resolvedBy",
  ],
};

const sql = readFileSync("/tmp/full-create.sql", "utf8");

/** Parse a CREATE TABLE statement for a given table; return Map<colName, "TYPE NULL? DEFAULT?"> */
function parseCreateTable(tableName) {
  const re = new RegExp(
    `CREATE TABLE "${tableName}"\\s*\\(([^;]*?)CONSTRAINT`, "s"
  );
  const m = sql.match(re);
  if (!m) return null;
  const body = m[1];
  const cols = new Map();
  // Each column line is roughly: "name" <TYPE> [NOT NULL] [DEFAULT ...] [,]
  // Skip lines that aren't column declarations (constraints etc).
  for (const line of body.split("\n")) {
    const t = line.trim().replace(/,$/, "");
    if (!t) continue;
    const cm = t.match(/^"([^"]+)"\s+(.+)$/);
    if (!cm) continue;
    cols.set(cm[1], cm[2]);
  }
  return cols;
}

const out = [];
for (const [table, fields] of Object.entries(ADDS)) {
  if (fields.length === 0) continue;
  const cols = parseCreateTable(table);
  if (!cols) {
    out.push(`-- WARN: could not parse CREATE TABLE for "${table}"`);
    continue;
  }
  const lines = [`-- ${table}`, `ALTER TABLE "${table}"`];
  const adds = [];
  for (const f of fields) {
    const decl = cols.get(f);
    if (!decl) {
      adds.push(`  -- WARN: field "${f}" not found in CREATE TABLE for ${table}`);
      continue;
    }
    adds.push(`  ADD COLUMN IF NOT EXISTS "${f}" ${decl}`);
  }
  out.push(lines.concat(adds.join(",\n") + ";").join("\n"));
  out.push("");
}

console.log(out.join("\n"));
