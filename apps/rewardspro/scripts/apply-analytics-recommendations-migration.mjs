/**
 * Apply Analytics Recommendations Migration to Aurora Database via Data API
 *
 * This script creates the AnalyticsRecommendation table to support
 * analytics-to-marketing integration with persistent recommendations.
 *
 * Migration: add_analytics_recommendations
 * Date: 2025-01-30
 */

import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyAnalyticsRecommendationsMigration() {
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

  console.log("🚀 Applying Analytics Recommendations Migration to Aurora Database\n");
  console.log("Migration: add_analytics_recommendations");
  console.log("Purpose: Create AnalyticsRecommendation table for marketing integration\n");

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Execute migration steps
    await executeMigrationSteps(client, resourceArn, secretArn, database, transactionId);

    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Next steps:");
    console.log("  1. Deploy updated application code");
    console.log("  2. Test smart campaign creator");
    console.log("  3. Generate initial recommendations\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    console.log("Rolling back transaction...");

    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.error("❌ Transaction rolled back. No changes were made to the database.\n");
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  // Step 1: Create AnalyticsRecommendation table
  console.log("Step 1: Creating AnalyticsRecommendation table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "AnalyticsRecommendation" (
      "id" TEXT NOT NULL,
      "shop" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "segmentPayload" JSONB NOT NULL,
      "metadata" JSONB,
      "predictedRevenue" DOUBLE PRECISION,
      "affectedCount" INTEGER NOT NULL,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "appliedAt" TIMESTAMP(3),
      "dismissedAt" TIMESTAMP(3),
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,

      CONSTRAINT "AnalyticsRecommendation_pkey" PRIMARY KEY ("id")
    )`,
    transactionId,
  }));
  console.log("  ✓ Table created");

  // Step 2: Create unique constraint on shop + slug
  console.log("Step 2: Creating unique constraint on shop + slug...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsRecommendation_shop_slug_key"
          ON "AnalyticsRecommendation"("shop", "slug")`,
    transactionId,
  }));
  console.log("  ✓ Unique constraint created");

  // Step 3: Create index on shop + status for efficient queries
  console.log("Step 3: Creating index on shop + status...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "AnalyticsRecommendation_shop_status_idx"
          ON "AnalyticsRecommendation"("shop", "status")`,
    transactionId,
  }));
  console.log("  ✓ Index created");

  // Step 4: Create index on shop + expiresAt for cleanup queries
  console.log("Step 4: Creating index on shop + expiresAt...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "AnalyticsRecommendation_shop_expiresAt_idx"
          ON "AnalyticsRecommendation"("shop", "expiresAt")`,
    transactionId,
  }));
  console.log("  ✓ Index created");

  // Step 5: Record migration in Prisma's tracking table
  console.log("Step 5: Recording migration in _prisma_migrations...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const migrationName = `${timestamp}_add_analytics_recommendations`;

  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 4)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "analytics_recommendations_v1" }},
      { name: "name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log(`  ✓ Migration recorded: ${migrationName}`);

  console.log("\n  ✓ All steps completed successfully");
}

// Run the migration
applyAnalyticsRecommendationsMigration().catch(error => {
  console.error("\n💥 Fatal error:", error);
  process.exit(1);
});
