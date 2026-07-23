#!/usr/bin/env tsx

/**
 * Guarded rollout for the free-first-v1 entitlement catalogue.
 *
 * This command is intentionally dry-run by default. It only touches
 * ShopEntitlements and the current MonthlyOrderUsage period. It never reads or
 * writes customer, points, rewards, order, or ledger data.
 *
 *   npx tsx scripts/backfill-free-first-entitlements.ts
 *   npx tsx scripts/backfill-free-first-entitlements.ts --verify
 *   npx tsx scripts/backfill-free-first-entitlements.ts --apply --expected-shops 123
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { SqlParameter } from "@aws-sdk/client-rds-data";
import {
  getAuroraClient,
  type AuroraDataAPI,
} from "../app/utils/aurora-data-api";
import {
  ENTITLEMENT_BOOLEAN_FIELDS,
  ENTITLEMENT_NUMERIC_FIELDS,
  FREE_FIRST_CATALOG_ID,
  REQUIRED_MONTHLY_USAGE_COLUMNS,
  REQUIRED_SHOP_ENTITLEMENT_COLUMNS,
  assertExpectedShopCount,
  assertRequiredColumns,
  parseBackfillArgs,
  planShopBackfill,
  summarizePlans,
  type CurrentMonthlyUsage,
  type ExistingEntitlements,
  type ShopBackfillInput,
  type ShopBackfillPlan,
} from "./lib/free-first-entitlement-backfill";

type DatabaseRow = Record<string, unknown>;

interface ApplyResult {
  entitlementRowsChanged: number;
  currentUsageRowsChanged: number;
  entitlementCacheShops: string[];
}

const ENTITLEMENT_SELECTS = [
  `se.id AS "ent__id"`,
  `se."effectivePlan" AS "ent__effectivePlan"`,
  `se."planSource"::text AS "ent__planSource"`,
  ...ENTITLEMENT_BOOLEAN_FIELDS.map(
    (field) => `se."${field}" AS "ent__${field}"`,
  ),
  ...ENTITLEMENT_NUMERIC_FIELDS.map(
    (field) => `se."${field}" AS "ent__${field}"`,
  ),
  `se."hasOverride" AS "ent__hasOverride"`,
  `se."overrideExpiry" AS "ent__overrideExpiry"`,
  `se."overrideNote" AS "ent__overrideNote"`,
  `se."overrideBy" AS "ent__overrideBy"`,
  `se."resolvedFrom" AS "ent__resolvedFrom"`,
].join(",\n      ");

const UPSERT_ENTITLEMENTS_SQL = buildUpsertEntitlementsSql();

const UPDATE_CURRENT_USAGE_SQL = `
  UPDATE "MonthlyOrderUsage" AS usage
  SET
    "planLimit" = GREATEST(usage."planLimit", entitlements."limitMaxOrders"),
    "planName" = entitlements."effectivePlan",
    "isLocked" = false,
    "lockedAt" = NULL,
    "lockReason" = NULL,
    "updatedAt" = NOW()
  FROM "ShopEntitlements" AS entitlements
  WHERE usage.shop = :shop
    AND usage.year = :year
    AND usage.month = :month
    AND entitlements.shop = usage.shop
    AND (
      usage."planLimit" < entitlements."limitMaxOrders"
      OR usage."planName" IS DISTINCT FROM entitlements."effectivePlan"
      OR usage."isLocked" IS DISTINCT FROM false
      OR usage."lockedAt" IS NOT NULL
      OR usage."lockReason" IS NOT NULL
    )
`;

async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  assertApplyCacheConfiguration(options.mode);

  const client = getAuroraClient();
  const startedAt = new Date();
  const period = {
    year: startedAt.getUTCFullYear(),
    month: startedAt.getUTCMonth() + 1,
  };

  console.log(
    `[${FREE_FIRST_CATALOG_ID}] mode=${options.mode} currentPeriod=${period.year}-${String(period.month).padStart(2, "0")}`,
  );

  await preflightSchema(client);
  const inputs = await loadShopInputs(client, period);
  assertExpectedShopCount(options, inputs.length);
  const plans = planAllShops(inputs, startedAt);
  const summary = summarizePlans(plans);

  console.log(JSON.stringify({ mode: options.mode, ...summary }, null, 2));

  if (options.mode === "dry-run") {
    reportExamples(plans);
    console.log(
      "Dry run complete. No database rows or cache entries were changed.",
    );
    return;
  }

  if (options.mode === "verify") {
    assertNoDrift(plans);
    console.log(
      `[${FREE_FIRST_CATALOG_ID}] verification passed for ${plans.length} shops`,
    );
    return;
  }

  // Clear both distributed keyspaces before the first write and again after
  // committed changes. The second pass closes the small read/write race; the
  // first keeps a post-commit KV outage from leaving the old projection live.
  await invalidateEntitlementCaches(plans.map((plan) => plan.shop));
  const result = await applyPlans(client, plans, period, options.batchSize);
  await invalidateEntitlementCaches(result.entitlementCacheShops);

  // A direct post-commit read is part of apply, not an optional follow-up.
  const verificationInputs = await loadShopInputs(client, period);
  if (verificationInputs.length !== inputs.length) {
    throw new Error(
      `Post-apply verification refused: source union changed from ${inputs.length} to ${verificationInputs.length} shops during rollout`,
    );
  }
  const verificationPlans = planAllShops(verificationInputs, new Date());
  assertNoDrift(verificationPlans);

  console.log(
    JSON.stringify(
      {
        catalogId: FREE_FIRST_CATALOG_ID,
        appliedShops: plans.length,
        entitlementRowsChanged: result.entitlementRowsChanged,
        currentUsageRowsChanged: result.currentUsageRowsChanged,
        postApplyVerification: "passed",
      },
      null,
      2,
    ),
  );
}

async function preflightSchema(client: AuroraDataAPI): Promise<void> {
  const result = await client.executeStatement<{
    tableName: string;
    columnName: string;
  }>(`
    SELECT
      table_name AS "tableName",
      column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('ShopEntitlements', 'MonthlyOrderUsage')
    ORDER BY table_name, ordinal_position
  `);

  const byTable = new Map<string, string[]>();
  for (const row of result.records) {
    const columns = byTable.get(row.tableName) ?? [];
    columns.push(row.columnName);
    byTable.set(row.tableName, columns);
  }

  assertRequiredColumns(
    "ShopEntitlements",
    byTable.get("ShopEntitlements") ?? [],
    REQUIRED_SHOP_ENTITLEMENT_COLUMNS,
  );
  assertRequiredColumns(
    "MonthlyOrderUsage",
    byTable.get("MonthlyOrderUsage") ?? [],
    REQUIRED_MONTHLY_USAGE_COLUMNS,
  );

  console.log(
    `[${FREE_FIRST_CATALOG_ID}] schema preflight passed (${byTable.get("ShopEntitlements")?.length ?? 0} actual ShopEntitlements columns)`,
  );
}

async function loadShopInputs(
  client: AuroraDataAPI,
  period: { year: number; month: number },
): Promise<ShopBackfillInput[]> {
  const result = await client.executeStatement<DatabaseRow>(
    `
      WITH shops AS (
        SELECT shop FROM "ShopSettings"
        UNION
        SELECT shop FROM "BillingSubscription"
        UNION
        SELECT shop FROM "AppSubscription"
        UNION
        SELECT shop FROM "ShopEntitlements"
      )
      SELECT
        shops.shop AS shop,
        app_subscription.status AS "app__status",
        app_subscription."planName" AS "app__planName",
        billing_subscription."subscriptionStatus" AS "billing__subscriptionStatus",
        billing_subscription.status AS "billing__legacyStatus",
        billing_subscription."planName" AS "billing__planName",
        billing_subscription."planType" AS "billing__planType",
        shop_settings."subscriptionStatus" AS "settings__subscriptionStatus",
        shop_settings."billingStatus" AS "settings__billingStatus",
        shop_settings."currentPlanName" AS "settings__currentPlanName",
        shop_settings."currentPlan" AS "settings__currentPlan",
        ${ENTITLEMENT_SELECTS},
        current_usage."planLimit" AS "usage__planLimit",
        current_usage."planName" AS "usage__planName",
        current_usage."isLocked" AS "usage__isLocked",
        current_usage."lockedAt" AS "usage__lockedAt",
        current_usage."lockReason" AS "usage__lockReason"
      FROM shops
      LEFT JOIN "ShopSettings" AS shop_settings
        ON shop_settings.shop = shops.shop
      LEFT JOIN "BillingSubscription" AS billing_subscription
        ON billing_subscription.shop = shops.shop
      LEFT JOIN "AppSubscription" AS app_subscription
        ON app_subscription.shop = shops.shop
      LEFT JOIN "ShopEntitlements" AS se
        ON se.shop = shops.shop
      LEFT JOIN "MonthlyOrderUsage" AS current_usage
        ON current_usage.shop = shops.shop
        AND current_usage.year = :year
        AND current_usage.month = :month
      WHERE shops.shop IS NOT NULL
        AND BTRIM(shops.shop) <> ''
      ORDER BY shops.shop
    `,
    [parameter("year", period.year), parameter("month", period.month)],
  );

  return result.records.map(rowToShopInput);
}

function rowToShopInput(row: DatabaseRow): ShopBackfillInput {
  const shop = requiredString(row.shop, "shop");
  const billingStatus = firstNonEmptyString(
    row.billing__subscriptionStatus,
    row.billing__legacyStatus,
  );
  const settingsStatus = firstNonEmptyString(
    row.settings__subscriptionStatus,
    row.settings__billingStatus,
  );

  return {
    shop,
    planSignals: [
      {
        source: "AppSubscription",
        status: nullableString(row.app__status),
        planName: nullableString(row.app__planName),
      },
      {
        source: "BillingSubscription",
        status: billingStatus,
        planName: firstNonEmptyString(
          row.billing__planName,
          row.billing__planType,
        ),
      },
      {
        source: "ShopSettings",
        status: settingsStatus,
        planName: firstNonEmptyString(
          row.settings__currentPlanName,
          row.settings__currentPlan,
        ),
      },
    ],
    existing: row.ent__id ? readExistingEntitlements(row) : null,
    currentUsage:
      row.usage__planLimit === null || row.usage__planLimit === undefined
        ? null
        : readCurrentUsage(row),
  };
}

function readExistingEntitlements(row: DatabaseRow): ExistingEntitlements {
  const values: Partial<ExistingEntitlements> = {
    id: requiredString(row.ent__id, "ShopEntitlements.id"),
    effectivePlan: requiredString(
      row.ent__effectivePlan,
      "ShopEntitlements.effectivePlan",
    ),
    planSource: requiredPlanSource(row.ent__planSource),
    hasOverride: requiredBoolean(
      row.ent__hasOverride,
      "ShopEntitlements.hasOverride",
    ),
    overrideExpiry: nullableDateValue(row.ent__overrideExpiry),
    overrideNote: nullableString(row.ent__overrideNote),
    overrideBy: nullableString(row.ent__overrideBy),
    resolvedFrom: nullableString(row.ent__resolvedFrom),
  };

  for (const field of ENTITLEMENT_BOOLEAN_FIELDS) {
    values[field] = requiredBoolean(
      row[`ent__${field}`],
      `ShopEntitlements.${field}`,
    );
  }
  for (const field of ENTITLEMENT_NUMERIC_FIELDS) {
    values[field] = requiredNumber(
      row[`ent__${field}`],
      `ShopEntitlements.${field}`,
    );
  }

  return values as ExistingEntitlements;
}

function readCurrentUsage(row: DatabaseRow): CurrentMonthlyUsage {
  return {
    planLimit: requiredNumber(
      row.usage__planLimit,
      "MonthlyOrderUsage.planLimit",
    ),
    planName: requiredString(
      row.usage__planName,
      "MonthlyOrderUsage.planName",
    ),
    isLocked: requiredBoolean(
      row.usage__isLocked,
      "MonthlyOrderUsage.isLocked",
    ),
    lockedAt: nullableDateValue(row.usage__lockedAt),
    lockReason: nullableString(row.usage__lockReason),
  };
}

function planAllShops(
  inputs: ShopBackfillInput[],
  now: Date,
): ShopBackfillPlan[] {
  return inputs.map((input) => {
    try {
      return planShopBackfill(input, now);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Plan resolution aborted for ${input.shop}: ${detail}`);
    }
  });
}

async function applyPlans(
  client: AuroraDataAPI,
  plans: ShopBackfillPlan[],
  period: { year: number; month: number },
  batchSize: number,
): Promise<ApplyResult> {
  let entitlementRowsChanged = 0;
  let currentUsageRowsChanged = 0;
  const entitlementCacheShops = new Set<string>();

  for (let offset = 0; offset < plans.length; offset += batchSize) {
    const batch = plans.slice(offset, offset + batchSize);
    const batchResult = await client.executeTransaction(async (execute) => {
      let entitlementsChanged = 0;
      let usageChanged = 0;
      const changedShops: string[] = [];

      for (const plan of batch) {
        if (plan.entitlementAction !== "preserve-active-override") {
          const upsertResult = await execute(
            UPSERT_ENTITLEMENTS_SQL,
            entitlementParameters(plan),
          );
          if ((upsertResult.numberOfRecordsUpdated ?? 0) > 0) {
            entitlementsChanged += upsertResult.numberOfRecordsUpdated ?? 0;
            changedShops.push(plan.shop);
          }
        }

        const usageResult = await execute(UPDATE_CURRENT_USAGE_SQL, [
          parameter("shop", plan.shop),
          parameter("year", period.year),
          parameter("month", period.month),
        ]);
        usageChanged += usageResult.numberOfRecordsUpdated ?? 0;
      }

      return { entitlementsChanged, usageChanged, changedShops };
    });

    entitlementRowsChanged += batchResult.entitlementsChanged;
    currentUsageRowsChanged += batchResult.usageChanged;
    batchResult.changedShops.forEach((shop) =>
      entitlementCacheShops.add(shop),
    );
    console.log(
      `[${FREE_FIRST_CATALOG_ID}] committed ${Math.min(offset + batch.length, plans.length)}/${plans.length} shops`,
    );
  }

  return {
    entitlementRowsChanged,
    currentUsageRowsChanged,
    entitlementCacheShops: [...entitlementCacheShops],
  };
}

function entitlementParameters(plan: ShopBackfillPlan): SqlParameter[] {
  const parameters: SqlParameter[] = [
    parameter("id", randomUUID()),
    parameter("shop", plan.shop),
    parameter("effectivePlan", plan.effectivePlan),
    parameter("planSource", plan.resolved.planSource),
    parameter("resolvedFrom", plan.resolved.resolvedFrom),
  ];
  for (const field of ENTITLEMENT_BOOLEAN_FIELDS) {
    parameters.push(parameter(field, plan.entitlements[field]));
  }
  for (const field of ENTITLEMENT_NUMERIC_FIELDS) {
    parameters.push(parameter(field, plan.entitlements[field]));
  }
  return parameters;
}

async function invalidateEntitlementCaches(shops: string[]): Promise<void> {
  if (shops.length === 0) {
    console.log(
      `[${FREE_FIRST_CATALOG_ID}] no entitlement cache invalidation needed`,
    );
    return;
  }

  const kvConfigured = Boolean(
    process.env.KV_REST_API_URL?.trim() &&
      process.env.KV_REST_API_TOKEN?.trim(),
  );
  if (!kvConfigured) {
    throw new Error(
      `[${FREE_FIRST_CATALOG_ID}] cache invalidation refused: KV_REST_API_URL and KV_REST_API_TOKEN are required for --apply`,
    );
  }

  const { kv } = await import("@vercel/kv");
  for (let offset = 0; offset < shops.length; offset += 50) {
    const batch = shops.slice(offset, offset + 50);
    await Promise.all(
      batch.map((shop) =>
        kv.del(`entitlements:${shop}`, `shop:${shop}:entitlements`),
      ),
    );
  }
  console.log(
    `[${FREE_FIRST_CATALOG_ID}] invalidated both entitlement cache keyspaces for ${shops.length} shops`,
  );
}

function assertApplyCacheConfiguration(mode: "dry-run" | "apply" | "verify") {
  if (mode !== "apply") return;
  if (
    !process.env.KV_REST_API_URL?.trim() ||
    !process.env.KV_REST_API_TOKEN?.trim()
  ) {
    throw new Error(
      "--apply requires KV_REST_API_URL and KV_REST_API_TOKEN so both entitlement cache keyspaces can be invalidated",
    );
  }
}

function assertNoDrift(plans: ShopBackfillPlan[]): void {
  const drift = plans.filter(
    (plan) =>
      plan.entitlementAction === "create" ||
      plan.entitlementAction === "update" ||
      plan.usageAction === "update-and-unlock",
  );
  if (drift.length === 0) return;

  const examples = drift
    .slice(0, 10)
    .map(
      (plan) =>
        `${plan.shop}[entitlements=${plan.entitlementAction},usage=${plan.usageAction}]`,
    )
    .join(", ");
  throw new Error(
    `${FREE_FIRST_CATALOG_ID} verification found ${drift.length} shops with drift. Examples: ${examples}`,
  );
}

function reportExamples(plans: ShopBackfillPlan[]): void {
  const changes = plans
    .filter(
      (plan) =>
        plan.entitlementAction !== "none" ||
        plan.usageAction !== "none",
    )
    .slice(0, 10)
    .map((plan) => ({
      shop: plan.shop,
      effectivePlan: plan.effectivePlan,
      entitlements: plan.entitlementAction,
      currentUsage: plan.usageAction,
    }));
  if (changes.length > 0) {
    console.log("First planned changes:");
    console.log(JSON.stringify(changes, null, 2));
  }
}

function buildUpsertEntitlementsSql(): string {
  const valueColumns = [
    "id",
    "shop",
    "effectivePlan",
    "planSource",
    ...ENTITLEMENT_BOOLEAN_FIELDS,
    ...ENTITLEMENT_NUMERIC_FIELDS,
    "hasOverride",
    "overrideExpiry",
    "overrideNote",
    "overrideBy",
    "lastResolvedAt",
    "resolvedFrom",
    "createdAt",
    "updatedAt",
  ];
  const insertValues = [
    ":id",
    ":shop",
    ":effectivePlan",
    `:planSource::"EntitlementSource"`,
    ...ENTITLEMENT_BOOLEAN_FIELDS.map((field) => `:${field}`),
    ...ENTITLEMENT_NUMERIC_FIELDS.map((field) => `:${field}`),
    "false",
    "NULL",
    "NULL",
    "NULL",
    "NOW()",
    ":resolvedFrom",
    "NOW()",
    "NOW()",
  ];
  const updates = [
    `"effectivePlan" = EXCLUDED."effectivePlan"`,
    `"planSource" = EXCLUDED."planSource"`,
    ...ENTITLEMENT_BOOLEAN_FIELDS.map(
      (field) =>
        `"${field}" = COALESCE(current_entitlements."${field}", false) OR EXCLUDED."${field}"`,
    ),
    ...ENTITLEMENT_NUMERIC_FIELDS.map(
      (field) =>
        `"${field}" = GREATEST(COALESCE(current_entitlements."${field}", 0), EXCLUDED."${field}")`,
    ),
    `"hasOverride" = false`,
    `"overrideExpiry" = NULL`,
    `"overrideNote" = NULL`,
    `"overrideBy" = NULL`,
    `"lastResolvedAt" = NOW()`,
    `"resolvedFrom" = EXCLUDED."resolvedFrom"`,
    `"updatedAt" = NOW()`,
  ];
  const differences = [
    `current_entitlements."effectivePlan" IS DISTINCT FROM EXCLUDED."effectivePlan"`,
    `current_entitlements."planSource" IS DISTINCT FROM EXCLUDED."planSource"`,
    `current_entitlements."resolvedFrom" IS DISTINCT FROM EXCLUDED."resolvedFrom"`,
    `current_entitlements."hasOverride" IS DISTINCT FROM false`,
    `current_entitlements."overrideExpiry" IS NOT NULL`,
    `current_entitlements."overrideNote" IS NOT NULL`,
    `current_entitlements."overrideBy" IS NOT NULL`,
    ...ENTITLEMENT_BOOLEAN_FIELDS.map(
      (field) =>
        `COALESCE(current_entitlements."${field}", false) IS DISTINCT FROM (COALESCE(current_entitlements."${field}", false) OR EXCLUDED."${field}")`,
    ),
    ...ENTITLEMENT_NUMERIC_FIELDS.map(
      (field) =>
        `COALESCE(current_entitlements."${field}", 0) IS DISTINCT FROM GREATEST(COALESCE(current_entitlements."${field}", 0), EXCLUDED."${field}")`,
    ),
  ];

  return `
    INSERT INTO "ShopEntitlements" AS current_entitlements (
      ${valueColumns.map((column) => `"${column}"`).join(", ")}
    )
    VALUES (${insertValues.join(", ")})
    ON CONFLICT ("shop") DO UPDATE SET
      ${updates.join(",\n      ")}
    WHERE NOT (
      current_entitlements."hasOverride" = true
      AND (
        current_entitlements."overrideExpiry" IS NULL
        OR current_entitlements."overrideExpiry" > NOW()
      )
    )
    AND (${differences.join("\n      OR ")})
  `;
}

function parameter(name: string, value: string | number | boolean): SqlParameter {
  if (typeof value === "string") {
    return { name, value: { stringValue: value } };
  }
  if (typeof value === "boolean") {
    return { name, value: { booleanValue: value } };
  }
  return { name, value: { longValue: value } };
}

function firstNonEmptyString(
  primary: unknown,
  fallback: unknown,
): string | null {
  return nullableString(primary)?.trim() || nullableString(fallback)?.trim() || null;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function requiredString(value: unknown, label: string): string {
  const result = nullableString(value)?.trim();
  if (!result) throw new Error(`${label} must be a non-empty string`);
  return result;
}

function requiredNumber(value: unknown, label: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result) || !Number.isInteger(result) || result < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return result;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be a boolean`);
}

function nullableDateValue(value: unknown): Date | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string") return value;
  throw new Error(`Expected nullable timestamp, received ${typeof value}`);
}

function requiredPlanSource(
  value: unknown,
): ExistingEntitlements["planSource"] {
  const source = requiredString(value, "ShopEntitlements.planSource");
  if (
    source === "DEFAULT" ||
    source === "SUBSCRIPTION" ||
    source === "OVERRIDE" ||
    source === "LEGACY"
  ) {
    return source;
  }
  throw new Error(`Unknown ShopEntitlements.planSource: ${source}`);
}

function printHelp(): void {
  console.log(`
RewardsPro ${FREE_FIRST_CATALOG_ID} entitlement backfill

Usage:
  npx tsx scripts/backfill-free-first-entitlements.ts [--dry-run]
  npx tsx scripts/backfill-free-first-entitlements.ts --verify
  npx tsx scripts/backfill-free-first-entitlements.ts --apply --expected-shops <exact-count>

Options:
  --dry-run                 Read, preflight, and report only (default)
  --verify                  Fail if entitlement or current-period lock drift exists
  --apply                   Apply in guarded Data API transactions
  --expected-shops <count>  Required with --apply; must equal the union shop count
  --batch-size <1-100>      Shops per transaction (default: 50)
  --help                    Show this help without connecting to the database

Apply also requires KV_REST_API_URL and KV_REST_API_TOKEN so both entitlement
cache keyspaces can be invalidated before and after database writes.
`.trim());
}

main().catch((error) => {
  console.error(
    `[${FREE_FIRST_CATALOG_ID}] aborted:`,
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
