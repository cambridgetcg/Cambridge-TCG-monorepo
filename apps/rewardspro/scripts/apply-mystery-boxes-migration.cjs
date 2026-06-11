#!/usr/bin/env node

/**
 * Apply Mystery Boxes Migration via Aurora Data API
 *
 * This script applies only the mystery boxes migration directly,
 * bypassing the standard Prisma migrate command.
 */

const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Configuration
const MIGRATION_NAME = "20250116_add_mystery_boxes";
const MIGRATION_FILE = path.join(__dirname, "..", "prisma", "migrations", MIGRATION_NAME, "migration.sql");

async function main() {
  console.log("🚀 Applying Mystery Boxes Migration via AWS Data API...\n");

  // Check environment variables
  const required = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AURORA_RESOURCE_ARN', 'AURORA_SECRET_ARN'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

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

  console.log(`📍 Region: ${process.env.AWS_REGION}`);
  console.log(`🗄️  Database: ${database}`);
  console.log(`📦 Migration: ${MIGRATION_NAME}\n`);

  // Check if migration already applied
  try {
    const checkResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = :name`,
      parameters: [{ name: "name", value: { stringValue: MIGRATION_NAME } }],
    }));

    if (checkResult.records && checkResult.records.length > 0) {
      console.log("✅ Migration already applied, skipping.");
      return;
    }
  } catch (error) {
    console.log("⚠️  Could not check migration status:", error.message);
  }

  // Read migration file
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`❌ Migration file not found: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, "utf-8");

  // Remove comment-only lines and parse SQL statements
  const cleanSql = sql
    .split("\n")
    .filter(line => !line.trim().startsWith("--"))
    .join("\n");

  const statements = cleanSql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

  // Execute each statement
  let successCount = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 60).replace(/\n/g, " ");

    try {
      await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: stmt,
      }));
      successCount++;
      console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}...`);
    } catch (error) {
      // Ignore "already exists" errors
      if (error.message && (
        error.message.includes("already exists") ||
        error.message.includes("duplicate key")
      )) {
        console.log(`  ⚠ [${i + 1}/${statements.length}] Already exists, skipping: ${preview}...`);
        successCount++;
      } else {
        console.error(`  ✗ [${i + 1}/${statements.length}] Failed: ${preview}...`);
        console.error(`    Error: ${error.message}`);
      }
    }
  }

  // Record migration in _prisma_migrations table
  const migrationId = crypto.randomUUID();
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");

  try {
    await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), :steps)`,
      parameters: [
        { name: "id", value: { stringValue: migrationId } },
        { name: "checksum", value: { stringValue: checksum } },
        { name: "name", value: { stringValue: MIGRATION_NAME } },
        { name: "steps", value: { longValue: statements.length } },
      ],
    }));
    console.log(`\n✅ Migration recorded in _prisma_migrations table`);
  } catch (error) {
    console.error(`\n⚠️  Could not record migration: ${error.message}`);
  }

  console.log(`\n🎉 Migration complete! ${successCount}/${statements.length} statements executed.`);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
