import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function applyEmailMarketingMigration() {
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

  console.log("🚀 Applying Email Marketing Migration to Aurora Database\n");

  // Start transaction for atomicity
  const { transactionId } = await client.send(new BeginTransactionCommand({
    resourceArn,
    secretArn,
    database,
  }));

  try {
    // Execute migration in logical steps
    await executeMigrationSteps(client, resourceArn, secretArn, database, transactionId);

    // Commit if all successful
    await client.send(new CommitTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));

    console.log("\n✅ Migration completed successfully!\n");

  } catch (error) {
    // Rollback on any error
    console.error(`\n❌ Error: ${error.message}\n`);
    await client.send(new RollbackTransactionCommand({
      resourceArn,
      secretArn,
      transactionId,
    }));
    throw error;
  }
}

async function executeMigrationSteps(client, resourceArn, secretArn, database, transactionId) {
  // Step 1: Create EmailTemplate table
  console.log("Step 1: Creating EmailTemplate table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "EmailTemplate" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "type" TEXT NOT NULL,
            "subject" TEXT NOT NULL,
            "content" JSONB NOT NULL,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ EmailTemplate table created");

  // Step 2: Create EmailCampaign table
  console.log("Step 2: Creating EmailCampaign table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "EmailCampaign" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "templateId" TEXT NOT NULL,
            "status" TEXT NOT NULL,
            "segmentRules" JSONB NOT NULL,
            "scheduledFor" TIMESTAMP(3),
            "sentAt" TIMESTAMP(3),
            "metrics" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ EmailCampaign table created");

  // Step 3: Create EmailAutomation table
  console.log("Step 3: Creating EmailAutomation table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "EmailAutomation" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "trigger" TEXT NOT NULL,
            "templateId" TEXT NOT NULL,
            "isEnabled" BOOLEAN NOT NULL DEFAULT true,
            "conditions" JSONB NOT NULL,
            "delayMinutes" INTEGER NOT NULL DEFAULT 0,
            "totalSent" INTEGER NOT NULL DEFAULT 0,
            "totalOpened" INTEGER NOT NULL DEFAULT 0,
            "totalClicked" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ EmailAutomation table created");

  // Step 4: Create EmailSettings table
  console.log("Step 4: Creating EmailSettings table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "EmailSettings" (
            "shop" TEXT NOT NULL,
            "senderName" TEXT NOT NULL DEFAULT 'Store',
            "senderEmail" TEXT NOT NULL,
            "replyToEmail" TEXT,
            "brandColors" JSONB NOT NULL DEFAULT '{"primary":"#5C6AC4","secondary":"#F4F6F8"}',
            "typography" JSONB NOT NULL DEFAULT '{"fontFamily":"Inter"}',
            "headerContent" JSONB,
            "footerContent" JSONB,
            "suppressionList" TEXT[] DEFAULT ARRAY[]::TEXT[],
            "includeUnsubscribe" BOOLEAN NOT NULL DEFAULT true,
            "includePhysicalAddress" BOOLEAN NOT NULL DEFAULT true,
            "gdprEnabled" BOOLEAN NOT NULL DEFAULT true,
            "sendTimePrefs" JSONB NOT NULL DEFAULT '{"preferredTime":"10:00","timezone":"America/New_York","dailyLimit":1000,"hourlyLimit":100}',
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("shop")
          )`,
    transactionId,
  }));
  console.log("  ✓ EmailSettings table created");

  // Step 5: Create EmailEvent table
  console.log("Step 5: Creating EmailEvent table...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE TABLE IF NOT EXISTS "EmailEvent" (
            "id" TEXT NOT NULL,
            "shop" TEXT NOT NULL,
            "campaignId" TEXT,
            "automationId" TEXT,
            "customerId" TEXT,
            "customerEmail" TEXT NOT NULL,
            "eventType" TEXT NOT NULL,
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
          )`,
    transactionId,
  }));
  console.log("  ✓ EmailEvent table created");

  // Step 6: Create indexes for EmailTemplate
  console.log("Step 6: Creating indexes for EmailTemplate...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailTemplate_shop_type_idx"
          ON "EmailTemplate"("shop", "type")`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailTemplate_shop_isActive_idx"
          ON "EmailTemplate"("shop", "isActive")`,
    transactionId,
  }));
  console.log("  ✓ EmailTemplate indexes created");

  // Step 7: Create indexes for EmailCampaign
  console.log("Step 7: Creating indexes for EmailCampaign...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailCampaign_shop_status_idx"
          ON "EmailCampaign"("shop", "status")`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailCampaign_shop_scheduledFor_idx"
          ON "EmailCampaign"("shop", "scheduledFor")`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailCampaign_sentAt_idx"
          ON "EmailCampaign"("sentAt" DESC)`,
    transactionId,
  }));
  console.log("  ✓ EmailCampaign indexes created");

  // Step 8: Create indexes for EmailAutomation
  console.log("Step 8: Creating indexes for EmailAutomation...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailAutomation_shop_trigger_idx"
          ON "EmailAutomation"("shop", "trigger")`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailAutomation_shop_isEnabled_idx"
          ON "EmailAutomation"("shop", "isEnabled")`,
    transactionId,
  }));
  console.log("  ✓ EmailAutomation indexes created");

  // Step 9: Create indexes for EmailEvent
  console.log("Step 9: Creating indexes for EmailEvent...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailEvent_shop_eventType_createdAt_idx"
          ON "EmailEvent"("shop", "eventType", "createdAt" DESC)`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailEvent_campaignId_eventType_idx"
          ON "EmailEvent"("campaignId", "eventType")`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `CREATE INDEX IF NOT EXISTS "EmailEvent_customerEmail_eventType_idx"
          ON "EmailEvent"("customerEmail", "eventType")`,
    transactionId,
  }));
  console.log("  ✓ EmailEvent indexes created");

  // Step 10: Add foreign key constraints
  console.log("Step 10: Adding foreign key constraints...");
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "EmailCampaign"
          ADD CONSTRAINT "EmailCampaign_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id")
          ON DELETE CASCADE ON UPDATE CASCADE`,
    transactionId,
  }));
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `ALTER TABLE "EmailAutomation"
          ADD CONSTRAINT "EmailAutomation_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id")
          ON DELETE CASCADE ON UPDATE CASCADE`,
    transactionId,
  }));
  console.log("  ✓ Foreign key constraints added");

  // Step 11: Record migration in Prisma's tracking table
  console.log("Step 11: Recording migration...");
  const migrationId = crypto.randomBytes(18).toString('hex');
  const migrationName = `${new Date().toISOString().split('T')[0].replace(/-/g, '')}_email_marketing_module`;
  await client.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql: `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES (:id, :checksum, NOW(), :migration_name, NULL, NULL, NOW(), 11)`,
    parameters: [
      { name: "id", value: { stringValue: migrationId }},
      { name: "checksum", value: { stringValue: "email_marketing_v1" }},
      { name: "migration_name", value: { stringValue: migrationName }},
    ],
    transactionId,
  }));
  console.log("  ✓ Migration recorded");
}

applyEmailMarketingMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
