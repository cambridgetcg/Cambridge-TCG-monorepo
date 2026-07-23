/**
 * Migration Script: Add tier progress fields to CustomerTierState
 *
 * Run with: npx tsx scripts/run-tier-progress-migration.ts
 */

import "dotenv/config";

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

// Aurora Data API configuration (uses IAM role from environment, no explicit credentials needed)
const client = new RDSDataClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

const resourceArn = process.env.AURORA_RESOURCE_ARN!;
const secretArn = process.env.AURORA_SECRET_ARN!;
const database = process.env.AURORA_DATABASE_NAME || "rewardspro";

async function executeSQL(sql: string, description: string): Promise<boolean> {
  console.log(`\n📦 ${description}...`);
  console.log(`   SQL: ${sql.substring(0, 80)}${sql.length > 80 ? '...' : ''}`);

  try {
    const command = new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
    });

    await client.send(command);
    console.log(`   ✅ Success`);
    return true;
  } catch (error: any) {
    // Check if it's a "already exists" error (which is OK)
    if (error.message?.includes('already exists') ||
        error.message?.includes('duplicate')) {
      console.log(`   ⚠️  Already exists (skipping)`);
      return true;
    }
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function runMigration() {
  console.log("🚀 Starting CustomerTierState Progress Fields Migration");
  console.log("=".repeat(60));

  // Verify environment variables (AWS credentials come from IAM role or env)
  const requiredVars = ['AURORA_RESOURCE_ARN', 'AURORA_SECRET_ARN'];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.error(`\n❌ Missing environment variables: ${missingVars.join(', ')}`);
    console.log("\nMake sure you have these in your .env file:");
    missingVars.forEach(v => console.log(`  ${v}=...`));
    process.exit(1);
  }

  console.log(`\n📊 Database: ${database}`);
  console.log(`📍 Region: ${process.env.AWS_REGION || "eu-north-1"}`);

  const migrations = [
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "progressPercent" INTEGER DEFAULT 0`,
      description: "Adding progressPercent column"
    },
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "nextTierId" TEXT`,
      description: "Adding nextTierId column"
    },
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "nextTierName" TEXT`,
      description: "Adding nextTierName column"
    },
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "nextTierMinSpend" DECIMAL(10, 2)`,
      description: "Adding nextTierMinSpend column"
    },
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "amountToNextTier" DECIMAL(10, 2) DEFAULT 0`,
      description: "Adding amountToNextTier column"
    },
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "isMaxTier" BOOLEAN DEFAULT false`,
      description: "Adding isMaxTier column"
    },
    {
      sql: `ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "progressCalculatedAt" TIMESTAMP`,
      description: "Adding progressCalculatedAt column"
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "CustomerTierState_isMaxTier_idx" ON "CustomerTierState"("isMaxTier")`,
      description: "Creating isMaxTier index"
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS "CustomerTierState_nextTierId_idx" ON "CustomerTierState"("nextTierId")`,
      description: "Creating nextTierId index"
    },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const migration of migrations) {
    const success = await executeSQL(migration.sql, migration.description);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Add foreign key constraint separately (may fail if already exists)
  console.log("\n📦 Adding foreign key constraint...");
  try {
    const fkCommand = new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        ALTER TABLE "CustomerTierState"
        ADD CONSTRAINT "CustomerTierState_nextTierId_fkey"
        FOREIGN KEY ("nextTierId")
        REFERENCES "Tier"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
      `,
    });
    await client.send(fkCommand);
    console.log("   ✅ Foreign key added");
    successCount++;
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
      console.log("   ⚠️  Foreign key already exists (skipping)");
      successCount++;
    } else {
      console.log(`   ⚠️  Foreign key skipped: ${error.message}`);
      // Don't count as failure - FK is optional for functionality
    }
  }

  // Verify columns exist
  console.log("\n🔍 Verifying migration...");
  try {
    const verifyCommand = new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'CustomerTierState'
        AND column_name IN ('progressPercent', 'nextTierId', 'nextTierName', 'nextTierMinSpend', 'amountToNextTier', 'isMaxTier', 'progressCalculatedAt')
      `,
    });
    const result = await client.send(verifyCommand);
    const columns = result.records?.map(r => r[0]?.stringValue) || [];
    console.log(`   Found columns: ${columns.join(', ')}`);

    if (columns.length >= 7) {
      console.log("   ✅ All columns verified!");
    } else {
      console.log(`   ⚠️  Expected 7 columns, found ${columns.length}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Verification query failed: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Migration complete: ${successCount} successful, ${failCount} failed`);

  if (failCount === 0) {
    console.log("\n🎉 All migrations applied successfully!");
    console.log("   The widget should now work correctly.");
  } else {
    console.log("\n⚠️  Some migrations failed. Check errors above.");
  }
}

runMigration().catch(console.error);
