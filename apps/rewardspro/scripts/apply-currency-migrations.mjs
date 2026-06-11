/**
 * Apply Currency System Migrations via AWS Data API
 *
 * This script applies the currency-related migrations:
 * 1. Add CHECK constraints to validate currency values
 * 2. Convert currency columns to enum type
 * 3. Add ExchangeRate and SystemAlert tables
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const client = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const resourceArn = process.env.AURORA_RESOURCE_ARN;
const secretArn = process.env.AURORA_SECRET_ARN;
const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

async function executeStep(sql, transactionId, stepName) {
  console.log(`  ${stepName}...`);
  try {
    const result = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      transactionId,
    }));
    console.log(`    ✓ ${stepName} completed`);
    return result;
  } catch (error) {
    console.error(`    ✗ ${stepName} failed:`, error.message);
    throw error;
  }
}

async function checkTableExists(tableName, transactionId) {
  const result = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = :tableName
    )`,
    parameters: [
      { name: "tableName", value: { stringValue: tableName }}
    ],
    transactionId,
  }));

  return result.records?.[0]?.[0]?.booleanValue || false;
}

async function checkColumnExists(tableName, columnName, transactionId) {
  const result = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = :tableName AND column_name = :columnName
    )`,
    parameters: [
      { name: "tableName", value: { stringValue: tableName }},
      { name: "columnName", value: { stringValue: columnName }}
    ],
    transactionId,
  }));

  return result.records?.[0]?.[0]?.booleanValue || false;
}

async function applyPhase1CheckConstraints(transactionId) {
  console.log("\n📋 Phase 1: Adding CHECK constraints for currency validation");

  // Check if Order table exists and has currency column
  const orderExists = await checkTableExists('Order', transactionId);
  if (orderExists) {
    const hasCurrency = await checkColumnExists('Order', 'currency', transactionId);
    if (hasCurrency) {
      await executeStep(
        `ALTER TABLE "Order"
         ADD CONSTRAINT currency_check CHECK (
           currency IS NULL OR currency IN (
             'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
             'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
             'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
             'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
           )
         ) NOT VALID`,
        transactionId,
        "Add CHECK constraint to Order table"
      );

      await executeStep(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_currency ON "Order"(currency)`,
        transactionId,
        "Create index on Order.currency"
      );
    } else {
      console.log("    ℹ Order.currency column doesn't exist, skipping");
    }
  } else {
    console.log("    ℹ Order table doesn't exist, skipping");
  }

  // Check if OrderRefund table exists and has currency column
  const refundExists = await checkTableExists('OrderRefund', transactionId);
  if (refundExists) {
    const hasCurrency = await checkColumnExists('OrderRefund', 'currency', transactionId);
    if (hasCurrency) {
      await executeStep(
        `ALTER TABLE "OrderRefund"
         ADD CONSTRAINT currency_check CHECK (
           currency IS NULL OR currency IN (
             'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
             'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
             'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
             'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
           )
         ) NOT VALID`,
        transactionId,
        "Add CHECK constraint to OrderRefund table"
      );
    } else {
      console.log("    ℹ OrderRefund.currency column doesn't exist, skipping");
    }
  } else {
    console.log("    ℹ OrderRefund table doesn't exist, skipping");
  }
}

async function applyPhase2EnumConversion(transactionId) {
  console.log("\n🔄 Phase 2: Converting currency columns to enum type");

  // First, check if the Currency enum type already exists
  const enumCheckResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = 'Currency'
    )`,
    transactionId,
  }));

  const enumExists = enumCheckResult.records?.[0]?.[0]?.booleanValue || false;

  if (!enumExists) {
    await executeStep(
      `CREATE TYPE "Currency" AS ENUM (
        'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
        'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
        'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
        'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
      )`,
      transactionId,
      "Create Currency enum type"
    );
  } else {
    console.log("    ℹ Currency enum already exists");
  }

  // Convert Order.currency column if it exists
  const orderExists = await checkTableExists('Order', transactionId);
  if (orderExists) {
    const hasCurrency = await checkColumnExists('Order', 'currency', transactionId);
    if (hasCurrency) {
      // Check current column type
      const typeCheckResult = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT data_type FROM information_schema.columns
              WHERE table_name = 'Order' AND column_name = 'currency'`,
        transactionId,
      }));

      const currentType = typeCheckResult.records?.[0]?.[0]?.stringValue;
      if (currentType !== 'USER-DEFINED') { // Not already an enum
        await executeStep(
          `ALTER TABLE "Order"
           ALTER COLUMN currency TYPE "Currency"
           USING currency::"Currency"`,
          transactionId,
          "Convert Order.currency to enum"
        );

        await executeStep(
          `ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS currency_check`,
          transactionId,
          "Remove temporary CHECK constraint from Order"
        );
      } else {
        console.log("    ℹ Order.currency is already an enum");
      }
    }
  }

  // Convert OrderRefund.currency column if it exists
  const refundExists = await checkTableExists('OrderRefund', transactionId);
  if (refundExists) {
    const hasCurrency = await checkColumnExists('OrderRefund', 'currency', transactionId);
    if (hasCurrency) {
      // Check current column type
      const typeCheckResult = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `SELECT data_type FROM information_schema.columns
              WHERE table_name = 'OrderRefund' AND column_name = 'currency'`,
        transactionId,
      }));

      const currentType = typeCheckResult.records?.[0]?.[0]?.stringValue;
      if (currentType !== 'USER-DEFINED') { // Not already an enum
        await executeStep(
          `ALTER TABLE "OrderRefund"
           ALTER COLUMN currency TYPE "Currency"
           USING currency::"Currency"`,
          transactionId,
          "Convert OrderRefund.currency to enum"
        );

        await executeStep(
          `ALTER TABLE "OrderRefund" DROP CONSTRAINT IF EXISTS currency_check`,
          transactionId,
          "Remove temporary CHECK constraint from OrderRefund"
        );
      } else {
        console.log("    ℹ OrderRefund.currency is already an enum");
      }
    }
  }
}

async function applyPhase3ExchangeRateTables(transactionId) {
  console.log("\n💱 Phase 3: Creating ExchangeRate and SystemAlert tables");

  // Check if ExchangeRate table already exists
  const exchangeRateExists = await checkTableExists('ExchangeRate', transactionId);
  if (!exchangeRateExists) {
    await executeStep(
      `CREATE TABLE "ExchangeRate" (
        "id" TEXT NOT NULL,
        "baseCurrency" "Currency" NOT NULL DEFAULT 'USD',
        "rates" JSONB NOT NULL,
        "provider" TEXT NOT NULL,
        "fetchedAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "metadata" JSONB,
        CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
      )`,
      transactionId,
      "Create ExchangeRate table"
    );

    await executeStep(
      `CREATE INDEX "ExchangeRate_baseCurrency_fetchedAt_idx"
       ON "ExchangeRate"("baseCurrency", "fetchedAt" DESC)`,
      transactionId,
      "Create ExchangeRate indexes"
    );

    await executeStep(
      `CREATE INDEX "ExchangeRate_createdAt_idx"
       ON "ExchangeRate"("createdAt" DESC)`,
      transactionId,
      "Create ExchangeRate createdAt index"
    );
  } else {
    console.log("    ℹ ExchangeRate table already exists");
  }

  // Check if SystemAlert table already exists
  const systemAlertExists = await checkTableExists('SystemAlert', transactionId);
  if (!systemAlertExists) {
    await executeStep(
      `CREATE TABLE "SystemAlert" (
        "id" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "details" JSONB NOT NULL,
        "resolved" BOOLEAN NOT NULL DEFAULT false,
        "resolvedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
      )`,
      transactionId,
      "Create SystemAlert table"
    );

    await executeStep(
      `CREATE INDEX "SystemAlert_type_resolved_idx"
       ON "SystemAlert"("type", "resolved")`,
      transactionId,
      "Create SystemAlert indexes"
    );

    await executeStep(
      `CREATE INDEX "SystemAlert_severity_createdAt_idx"
       ON "SystemAlert"("severity", "createdAt" DESC)`,
      transactionId,
      "Create SystemAlert severity index"
    );
  } else {
    console.log("    ℹ SystemAlert table already exists");
  }
}

async function recordMigrations(transactionId) {
  console.log("\n📝 Recording migrations in _prisma_migrations table");

  // Check if _prisma_migrations table exists
  const migrationsTableExists = await checkTableExists('_prisma_migrations', transactionId);
  if (!migrationsTableExists) {
    console.log("    ℹ _prisma_migrations table doesn't exist, skipping recording");
    return;
  }

  const migrations = [
    { name: '20250922192750_add_currency_check_constraint', checksum: 'currency_check_v1' },
    { name: '20250922192851_convert_currency_to_enum', checksum: 'currency_enum_v1' },
    { name: '20250922192952_add_exchange_rate_models', checksum: 'exchange_rate_v1' },
  ];

  for (const migration of migrations) {
    const migrationId = crypto.randomBytes(18).toString('hex');

    // Check if migration already exists
    const existsResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = :name
      )`,
      parameters: [
        { name: "name", value: { stringValue: migration.name }}
      ],
      transactionId,
    }));

    const exists = existsResult.records?.[0]?.[0]?.booleanValue || false;

    if (!exists) {
      await executeStep(
        `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 1)`,
        transactionId,
        `Record migration: ${migration.name}`,
        [
          { name: "id", value: { stringValue: migrationId }},
          { name: "checksum", value: { stringValue: migration.checksum }},
          { name: "name", value: { stringValue: migration.name }},
        ]
      );
    } else {
      console.log(`    ℹ Migration ${migration.name} already recorded`);
    }
  }
}

async function applyMigrations() {
  console.log("🚀 Applying Currency System Migrations to Aurora Database\n");
  console.log("Configuration:");
  console.log(`  Database: ${database}`);
  console.log(`  Region: ${process.env.AWS_REGION || "eu-north-1"}`);
  console.log(`  Resource ARN: ${resourceArn?.substring(0, 50)}...`);

  // Start transaction
  console.log("\n🔐 Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));
  console.log("  ✓ Transaction started");

  try {
    // Apply migrations in phases
    await applyPhase1CheckConstraints(transactionId);
    await applyPhase2EnumConversion(transactionId);
    await applyPhase3ExchangeRateTables(transactionId);
    await recordMigrations(transactionId);

    // Commit transaction
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("\n✅ Currency migrations completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Run 'npx prisma generate' to update the Prisma client");
    console.log("  2. Test the application with the new currency system");
    console.log("  3. Set up the exchange rate update cron job");

  } catch (error) {
    console.error("\n❌ Error during migration:", error.message);
    console.log("\n🔙 Rolling back transaction...");

    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("  ✓ Transaction rolled back");
    process.exit(1);
  }
}

// Run the migration
applyMigrations().catch(error => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});