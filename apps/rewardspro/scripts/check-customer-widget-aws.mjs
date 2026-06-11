#!/usr/bin/env node
/**
 * Check Customer Data for Widget Debugging (AWS Data API)
 *
 * This script fetches customer data using AWS Data API to debug
 * why the widget can't find the customer.
 *
 * Usage: node scripts/check-customer-widget-aws.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

const TARGET_SHOPIFY_CUSTOMER_ID = '9440245350739';
const TARGET_EMAIL = 'aaasiadog@gmail.com';

async function main() {
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

  console.log('='.repeat(80));
  console.log('🔍 Checking Customer Data for Widget');
  console.log('='.repeat(80));
  console.log();

  try {
    // Search by Shopify Customer ID
    console.log(`📌 Searching for shopifyCustomerId: ${TARGET_SHOPIFY_CUSTOMER_ID}`);
    const customersByShopifyId = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        SELECT
          c.id,
          c.shop,
          c."shopifyCustomerId",
          c.email,
          c."firstName",
          c."lastName",
          c."storeCredit",
          c."currentTierId",
          t.name as "tierName",
          t."cashbackPercent",
          c."createdAt",
          c."updatedAt"
        FROM "Customer" c
        LEFT JOIN "Tier" t ON c."currentTierId" = t.id
        WHERE c."shopifyCustomerId" = :shopifyCustomerId
      `,
      parameters: [
        { name: 'shopifyCustomerId', value: { stringValue: TARGET_SHOPIFY_CUSTOMER_ID } }
      ],
      includeResultMetadata: true
    }));

    console.log(`Found ${customersByShopifyId.records?.length || 0} customer(s):\n`);

    if (customersByShopifyId.records && customersByShopifyId.records.length > 0) {
      customersByShopifyId.records.forEach((record, index) => {
        console.log(`Customer #${index + 1}:`);
        console.log('  Internal ID:', record[0]?.stringValue || 'N/A');
        console.log('  Shop:', record[1]?.stringValue || 'N/A');
        console.log('  Shopify Customer ID:', record[2]?.stringValue || 'N/A');
        console.log('  Email:', record[3]?.stringValue || 'N/A');
        console.log('  Name:', `${record[4]?.stringValue || ''} ${record[5]?.stringValue || ''}`.trim() || 'N/A');
        console.log('  Store Credit:', record[6]?.doubleValue || record[6]?.stringValue || '0');
        console.log('  Current Tier ID:', record[7]?.stringValue || 'None');
        console.log('  Current Tier Name:', record[8]?.stringValue || 'None');
        if (record[9]) {
          console.log('    - Cashback:', `${record[9]?.doubleValue || record[9]?.stringValue}%`);
        }
        console.log('  Created:', record[10]?.stringValue || 'N/A');
        console.log('  Updated:', record[11]?.stringValue || 'N/A');
        console.log();
      });
    } else {
      console.log('  ❌ No customers found with this Shopify customer ID');
      console.log();
    }

    // Search by email as backup
    console.log(`📌 Searching for email: ${TARGET_EMAIL}`);
    const customersByEmail = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        SELECT
          c.id,
          c.shop,
          c."shopifyCustomerId",
          c.email,
          c."storeCredit",
          t.name as "tierName"
        FROM "Customer" c
        LEFT JOIN "Tier" t ON c."currentTierId" = t.id
        WHERE c.email = :email
      `,
      parameters: [
        { name: 'email', value: { stringValue: TARGET_EMAIL } }
      ],
      includeResultMetadata: true
    }));

    console.log(`Found ${customersByEmail.records?.length || 0} customer(s):\n`);

    if (customersByEmail.records && customersByEmail.records.length > 0) {
      customersByEmail.records.forEach((record, index) => {
        console.log(`Customer #${index + 1}:`);
        console.log('  Internal ID:', record[0]?.stringValue || 'N/A');
        console.log('  Shop:', record[1]?.stringValue || 'N/A');
        console.log('  Shopify Customer ID:', record[2]?.stringValue || 'N/A');
        console.log('  Email:', record[3]?.stringValue || 'N/A');
        console.log('  Store Credit:', record[4]?.doubleValue || record[4]?.stringValue || '0');
        console.log('  Current Tier:', record[5]?.stringValue || 'None');
        console.log();
      });
    } else {
      console.log('  ❌ No customers found with this email');
      console.log();
    }

    // Get all unique shop domains
    console.log('📌 All shop domains in database:');
    const shops = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: `
        SELECT shop, COUNT(*) as customer_count
        FROM "Customer"
        GROUP BY shop
        ORDER BY shop
      `,
      includeResultMetadata: true
    }));

    console.log(`Found ${shops.records?.length || 0} unique shop(s):\n`);
    if (shops.records) {
      shops.records.forEach((record) => {
        const shop = record[0]?.stringValue || 'N/A';
        const count = record[1]?.longValue || record[1]?.stringValue || '0';
        console.log(`  - ${shop} (${count} customers)`);
      });
    }
    console.log();

    // Summary
    console.log('='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log();

    if (customersByShopifyId.records && customersByShopifyId.records.length > 0) {
      const record = customersByShopifyId.records[0];
      const shop = record[1]?.stringValue;
      const shopifyCustomerId = record[2]?.stringValue;

      console.log('✅ Customer EXISTS in database');
      console.log();
      console.log('Expected shop domain format for app proxy query:');
      console.log(`  shop: "${shop}"`);
      console.log();
      console.log('Expected query:');
      console.log(`  shopifyCustomerId: "${shopifyCustomerId}"`);
      console.log(`  shop: "${shop}"`);
      console.log();
      console.log('Customer Account Extension endpoint finds this customer because:');
      console.log(`  ✓ Queries with: { shopifyCustomerId: "${shopifyCustomerId}", shop: "${shop}" }`);
      console.log();
      console.log('App Proxy endpoint might fail if:');
      console.log('  ✗ session.shop has different format (e.g., missing .myshopify.com)');
      console.log('  ✗ session.shop has extra/missing parts');
      console.log('  ✗ session.shop uses different casing');
      console.log();
      console.log('🔍 NEXT STEP: Check backend logs from app proxy request');
      console.log('   Look for "[App Proxy] Request:" log to see what shop domain it receives');
      console.log();
    } else {
      console.log('❌ Customer NOT FOUND in database');
      console.log();
      console.log('Possible reasons:');
      console.log('  1. Customer not enrolled in RewardsPro');
      console.log('  2. Shopify customer ID changed or incorrect');
      console.log('  3. Customer exists but with different shopifyCustomerId format');
      console.log();
      console.log('🔍 NEXT STEP: Create the customer record');
      console.log('   - Option 1: Place an order as this customer (webhook will create it)');
      console.log('   - Option 2: Manually create customer via app admin');
      console.log();
    }

    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

main();
