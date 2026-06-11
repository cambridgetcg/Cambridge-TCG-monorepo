import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function createEnumTypes() {
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

  console.log("🚀 Creating enum types in database\n");
  console.log(`Database: ${database}`);
  console.log(`Region: ${process.env.AWS_REGION || "eu-north-1"}\n`);

  // Start transaction for atomicity
  console.log("Starting transaction...");
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Step 1: Create PurchaseType enum if it doesn't exist
    console.log("Step 1: Creating PurchaseType enum...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseType') THEN
                CREATE TYPE "PurchaseType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION', 'BOTH');
              END IF;
            END $$;`,
      transactionId,
    }));
    console.log("  ✓ PurchaseType enum ready");

    // Step 2: Create ProductDuration enum if it doesn't exist
    console.log("Step 2: Creating ProductDuration enum...");
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductDuration') THEN
                CREATE TYPE "ProductDuration" AS ENUM ('MONTHLY', 'ANNUAL', 'LIFETIME');
              END IF;
            END $$;`,
      transactionId,
    }));
    console.log("  ✓ ProductDuration enum ready");

    // Step 3: Record migration in Prisma's tracking table
    console.log("Step 3: Recording migration...");
    const migrationId = crypto.randomBytes(18).toString('hex');
    const migrationName = "20251003_create_enum_types";

    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), 2)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId }},
        { name: "checksum", value: { stringValue: "create_enum_types_v1" }},
        { name: "name", value: { stringValue: migrationName }},
      ],
      transactionId,
    }));
    console.log("  ✓ Migration recorded");

    // Commit if all successful
    console.log("\n💾 Committing transaction...");
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("✅ Migration completed successfully!\n");
    console.log("Summary:");
    console.log("  - Created PurchaseType enum (ONE_TIME, SUBSCRIPTION, BOTH)");
    console.log("  - Created ProductDuration enum (MONTHLY, ANNUAL, LIFETIME)");
    console.log("  - Migration recorded in _prisma_migrations");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    console.log("Rolling back transaction...");
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    console.log("✗ Transaction rolled back");
    throw error;
  }
}

// Run the migration
createEnumTypes()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });