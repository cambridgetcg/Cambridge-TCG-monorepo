#!/usr/bin/env node

/**
 * Query TierProduct table to diagnose why Platinum tier product not recognized
 *
 * Expected to find:
 * - shopifyProductId: '10152964915539'
 * - shopifyVariantId: '51929965199699'
 * - sku: 'TESTST-PLATI-T-MON-2509-UUF'
 */

import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

const client = new RDSDataClient({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const shop = 'teststore12062025.myshopify.com';

async function query(sql, description) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${description}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`SQL: ${sql.replace(/\s+/g, ' ').trim()}\n`);

  try {
    const command = new ExecuteStatementCommand({
      resourceArn: process.env.AURORA_RESOURCE_ARN,
      secretArn: process.env.AURORA_SECRET_ARN,
      database: process.env.AURORA_DATABASE_NAME || 'rewardspro',
      sql,
      formatRecordsAs: 'JSON',
    });

    const response = await client.send(command);

    if (response.formattedRecords) {
      const records = JSON.parse(response.formattedRecords);
      console.log(`Found ${records.length} record(s):\n`);
      console.log(JSON.stringify(records, null, 2));
    } else {
      console.log('No records found or empty result set.');
    }
  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

async function main() {
  console.log(`\n🔍 TIER PRODUCT INVESTIGATION`);
  console.log(`Shop: ${shop}`);
  console.log(`Looking for Platinum Tier Membership - Monthly`);
  console.log(`  - Product ID: 10152964915539`);
  console.log(`  - Variant ID: 51929965199699`);
  console.log(`  - SKU: TESTST-PLATI-T-MON-2509-UUF\n`);

  // Query 1: Count total tier products
  await query(
    `SELECT COUNT(*) as total FROM "TierProduct" WHERE shop = '${shop}'`,
    'Query 1: Total TierProducts for this shop'
  );

  // Query 2: Search for Platinum product by any field
  await query(
    `SELECT
      id,
      "tierId",
      "shopifyProductId",
      "shopifyVariantId",
      sku,
      "purchaseType",
      duration,
      price,
      "oneTimePrice"
    FROM "TierProduct"
    WHERE shop = '${shop}'
      AND (
        "shopifyProductId" LIKE '%10152964915539%'
        OR "shopifyVariantId" LIKE '%51929965199699%'
        OR sku LIKE '%PLATI%'
        OR sku LIKE '%TESTST%'
      )`,
    'Query 2: Search for Platinum tier product by ID/SKU'
  );

  // Query 3: Get ALL tier products
  await query(
    `SELECT
      id,
      "tierId",
      "shopifyProductId",
      "shopifyVariantId",
      sku,
      "purchaseType",
      duration,
      price,
      "oneTimePrice"
    FROM "TierProduct"
    WHERE shop = '${shop}'
    ORDER BY "createdAt" DESC
    LIMIT 20`,
    'Query 3: ALL TierProducts for this shop (last 20)'
  );

  // Query 4: Check exact match (what webhook tries)
  await query(
    `SELECT
      id,
      "tierId",
      "shopifyProductId",
      "shopifyVariantId",
      sku,
      "purchaseType"
    FROM "TierProduct"
    WHERE shop = '${shop}'
      AND (
        "shopifyProductId" = '10152964915539'
        OR "shopifyVariantId" = '51929965199699'
        OR sku = 'TESTST-PLATI-T-MON-2509-UUF'
      )
      AND "purchaseType" IN ('ONE_TIME', 'BOTH')`,
    'Query 4: EXACT match (webhook query)'
  );

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Investigation complete.`);
  console.log(`${'='.repeat(80)}\n`);
}

main().catch(console.error);
