#!/usr/bin/env node

/**
 * Script to check Aurora PostgreSQL database version
 */

import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const {
  AURORA_RESOURCE_ARN,
  AURORA_SECRET_ARN,
  AURORA_DATABASE_NAME,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
} = process.env;

// Validate required environment variables
if (!AURORA_RESOURCE_ARN || !AURORA_SECRET_ARN || !AURORA_DATABASE_NAME) {
  console.error('❌ Missing required environment variables:');
  console.error('   AURORA_RESOURCE_ARN, AURORA_SECRET_ARN, AURORA_DATABASE_NAME');
  process.exit(1);
}

// Create RDS Data API client
const client = new RDSDataClient({
  region: AWS_REGION || 'eu-north-1',
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

async function checkDatabaseVersion() {
  console.log('🔍 Checking Aurora PostgreSQL Database Version...\n');
  console.log('📍 Connection Details:');
  console.log(`   Region: ${AWS_REGION || 'eu-north-1'}`);
  console.log(`   Cluster: ${AURORA_RESOURCE_ARN.split(':').pop()}`);
  console.log(`   Database: ${AURORA_DATABASE_NAME}\n`);

  try {
    // Query 1: Get PostgreSQL version
    const versionCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: 'SELECT version()',
    });

    const versionResult = await client.send(versionCommand);
    const versionString = versionResult.records[0][0].stringValue;
    
    console.log('✅ PostgreSQL Version:');
    console.log(`   ${versionString}\n`);

    // Query 2: Get Aurora version
    const auroraVersionCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: "SELECT aurora_version()",
    });

    try {
      const auroraResult = await client.send(auroraVersionCommand);
      const auroraVersion = auroraResult.records[0][0].stringValue;
      console.log('✅ Aurora Version:');
      console.log(`   ${auroraVersion}\n`);
    } catch (error) {
      // aurora_version() might not be available in all configurations
      console.log('ℹ️  Aurora version function not available\n');
    }

    // Query 3: Get server parameters
    const paramsCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `
        SELECT 
          current_setting('server_version') as server_version,
          current_setting('server_version_num') as version_num,
          current_setting('shared_buffers') as shared_buffers,
          current_setting('max_connections') as max_connections,
          current_setting('effective_cache_size') as cache_size
      `,
    });

    const paramsResult = await client.send(paramsCommand);
    const params = paramsResult.records[0];
    
    console.log('📊 Server Configuration:');
    console.log(`   Server Version: ${params[0].stringValue}`);
    console.log(`   Version Number: ${params[1].stringValue}`);
    console.log(`   Shared Buffers: ${params[2].stringValue}`);
    console.log(`   Max Connections: ${params[3].stringValue}`);
    console.log(`   Cache Size: ${params[4].stringValue}\n`);

    // Query 4: Check database size
    const sizeCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as db_size,
          count(*) as table_count
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `,
    });

    const sizeResult = await client.send(sizeCommand);
    const sizeData = sizeResult.records[0];
    
    console.log('💾 Database Statistics:');
    console.log(`   Database Size: ${sizeData[0].stringValue}`);
    console.log(`   Table Count: ${sizeData[1].longValue}\n`);

    // Query 5: Check extensions
    const extensionsCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname NOT IN ('plpgsql')
        ORDER BY extname
      `,
    });

    const extensionsResult = await client.send(extensionsCommand);
    
    if (extensionsResult.records && extensionsResult.records.length > 0) {
      console.log('🔧 Installed Extensions:');
      extensionsResult.records.forEach(record => {
        console.log(`   ${record[0].stringValue}: v${record[1].stringValue}`);
      });
      console.log();
    }

    // Query 6: Check Aurora-specific features
    const featuresCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `
        SELECT 
          name,
          setting,
          unit
        FROM pg_settings
        WHERE name IN (
          'rds.force_ssl',
          'rds.log_retention_period',
          'shared_preload_libraries',
          'track_activity_query_size',
          'log_statement'
        )
        ORDER BY name
      `,
    });

    const featuresResult = await client.send(featuresCommand);
    
    if (featuresResult.records && featuresResult.records.length > 0) {
      console.log('⚙️  Aurora Settings:');
      featuresResult.records.forEach(record => {
        const unit = record[2].stringValue || '';
        console.log(`   ${record[0].stringValue}: ${record[1].stringValue}${unit ? ' ' + unit : ''}`);
      });
      console.log();
    }

    // Query 7: Connection info
    const connectionCommand = new ExecuteStatementCommand({
      resourceArn: AURORA_RESOURCE_ARN,
      secretArn: AURORA_SECRET_ARN,
      database: AURORA_DATABASE_NAME,
      sql: `
        SELECT 
          count(*) as active_connections,
          max(state) as connection_states
        FROM pg_stat_activity
        WHERE state IS NOT NULL
      `,
    });

    const connectionResult = await client.send(connectionCommand);
    const connectionData = connectionResult.records[0];
    
    console.log('🔌 Connection Status:');
    console.log(`   Active Connections: ${connectionData[0].longValue}`);
    console.log(`   Connection State: ${connectionData[1].stringValue || 'idle'}\n`);

    console.log('✨ Database version check complete!\n');
    
    // Summary
    console.log('📋 Summary:');
    const majorVersion = versionString.match(/PostgreSQL (\d+\.\d+)/)?.[1] || 'Unknown';
    console.log(`   PostgreSQL Major Version: ${majorVersion}`);
    console.log(`   Aurora Serverless: ${AURORA_RESOURCE_ARN.includes('cluster') ? 'Yes' : 'No'}`);
    console.log(`   Data API Enabled: Yes`);
    console.log(`   Region: ${AWS_REGION || 'eu-north-1'}`);
    
    // Recommendations based on version
    const versionNum = parseFloat(majorVersion);
    if (versionNum < 13) {
      console.log('\n⚠️  Warning: PostgreSQL version is below 13. Consider upgrading for better performance and features.');
    } else if (versionNum < 15) {
      console.log('\n💡 Tip: PostgreSQL 15+ offers improved performance and new features. Consider upgrading when possible.');
    } else {
      console.log('\n✅ You are running a recent version of PostgreSQL!');
    }

  } catch (error) {
    console.error('❌ Error checking database version:', error.message);
    
    if (error.message.includes('ResourceNotFoundException')) {
      console.error('\n🔍 Troubleshooting tips:');
      console.error('   1. Check if the Aurora cluster is running (not paused)');
      console.error('   2. Verify the cluster ARN is correct');
      console.error('   3. Ensure Data API is enabled for the cluster');
    } else if (error.message.includes('AccessDeniedException')) {
      console.error('\n🔐 Permission issue detected:');
      console.error('   1. Check AWS credentials have RDS Data API permissions');
      console.error('   2. Verify secret ARN has proper access permissions');
    }
    
    process.exit(1);
  }
}

// Run the check
checkDatabaseVersion();