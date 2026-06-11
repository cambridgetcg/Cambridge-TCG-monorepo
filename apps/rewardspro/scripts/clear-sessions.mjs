#!/usr/bin/env node
/**
 * Clear Old Sessions
 *
 * Use this when you get "Failed to decrypt data" errors.
 * This happens when SHOPIFY_API_SECRET changes but old encrypted sessions remain.
 *
 * Usage: node scripts/clear-sessions.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

async function clearSessions() {
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

  console.log('🗑️  Clearing old sessions...\n');

  try {
    // Count sessions before deletion
    const countResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `SELECT COUNT(*) FROM "Session"`,
      includeResultMetadata: true
    }));

    const countBefore = countResult.records?.[0]?.[0]?.longValue || 0;
    console.log(`Found ${countBefore} session(s) in database`);

    if (countBefore === 0) {
      console.log('✅ No sessions to clear');
      return;
    }

    // Delete all sessions
    const deleteResult = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `DELETE FROM "Session"`,
      includeResultMetadata: true
    }));

    console.log(`✅ Deleted ${countBefore} session(s)`);
    console.log('\n✨ Sessions cleared successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Refresh your Shopify admin page');
    console.log('   2. The app will re-authenticate automatically');
    console.log('   3. New sessions will be created with the current encryption key\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

clearSessions();
