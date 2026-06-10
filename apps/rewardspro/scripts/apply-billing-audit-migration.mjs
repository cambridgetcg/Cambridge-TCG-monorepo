import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyBillingAuditMigration() {
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

  console.log("🚀 Applying BillingAuditLog Migration to Aurora Database\n");

  // Start transaction for atomicity
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    console.log("Starting transaction...");

    // Execute migration in logical steps
    await executeMigrationSteps(client, resourceArn, secretArn, database, transactionId);

    console.log("\n💾 Committing transaction...");

    // Commit if all successful
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("⏮️  Rolling back transaction...");

    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  // Step 1: Create BillingAuditLog table
  console.log("Step 1: Creating BillingAuditLog table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "BillingAuditLog" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "action" TEXT NOT NULL,
            "planName" TEXT,
            "success" BOOLEAN NOT NULL DEFAULT false,
            "errorMessage" TEXT,
            "ipAddress" TEXT,
            "userAgent" TEXT,
            "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "metadata" JSONB,
            CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ BillingAuditLog table created");

  // Step 2: Create index for recent attempts by shop
  console.log("\nStep 2: Creating index for shop and attemptedAt...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "BillingAuditLog_shop_attemptedAt_idx"
          ON "BillingAuditLog"("shop", "attemptedAt" DESC)`,
    transactionId,
  }));
  console.log("  ✓ Index BillingAuditLog_shop_attemptedAt_idx created");

  // Step 3: Create index for shop and planName
  console.log("\nStep 3: Creating index for shop and planName...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "BillingAuditLog_shop_planName_idx"
          ON "BillingAuditLog"("shop", "planName")`,
    transactionId,
  }));
  console.log("  ✓ Index BillingAuditLog_shop_planName_idx created");

  // Step 4: Check if _prisma_migrations table exists
  console.log("\nStep 4: Checking for _prisma_migrations table...");
  const tablesResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '_prisma_migrations'
          ) as exists`,
    transactionId,
    includeResultMetadata: true,
  }));

  const tableExists = tablesResult.records?.[0]?.[0]?.booleanValue;

  if (tableExists) {
    // Step 5: Record migration in Prisma's tracking table
    console.log("\nStep 5: Recording migration in _prisma_migrations...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const timestamp = new Date().toISOString().replace(/[:\-T.]/g, '').slice(0, 14);
    const migrationName = `${timestamp}_add_billing_audit_log`;

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 3)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: crypto.randomBytes(16).toString('hex') }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log(`  ✓ Migration recorded: ${migrationName}`);
  } else {
    console.log("  ℹ️  _prisma_migrations table not found - skipping migration record");
  }

  // Step 6: Verify table was created
  console.log("\nStep 6: Verifying table creation...");
  const verifyResult = await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'BillingAuditLog'
          ORDER BY ordinal_position`,
    transactionId,
    includeResultMetadata: true,
  }));

  if (verifyResult.records && verifyResult.records.length > 0) {
    console.log("  ✓ BillingAuditLog table verified with columns:");
    verifyResult.records.forEach(record => {
      const columnName = record[0]?.stringValue;
      const dataType = record[1]?.stringValue;
      console.log(`    - ${columnName}: ${dataType}`);
    });
  }

  console.log("\n  ✓ All migration steps completed successfully");
}

// Run the migration
applyBillingAuditMigration()
  .then(() => {
    console.log("🎉 BillingAuditLog migration applied successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  });