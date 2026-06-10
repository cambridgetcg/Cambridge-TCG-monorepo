#!/usr/bin/env node
/**
 * Investigate Customer Data Discrepancy
 *
 * Deep dive into customer data to understand widget data mismatch
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import * as dotenv from 'dotenv';

dotenv.config();

const SHOP = '6e824e-a9.myshopify.com';
const EMAIL = 'aaasiadog@gmail.com';

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
  console.log('🔍 DEEP INVESTIGATION: Customer Data Discrepancy');
  console.log('='.repeat(80));
  console.log(`Shop: ${SHOP}`);
  console.log(`Email: ${EMAIL}`);
  console.log();

  try {
    // 1. Get complete customer data
    console.log('📌 1. COMPLETE CUSTOMER DATA');
    console.log('-'.repeat(60));
    const customerData = await client.send(new ExecuteStatementCommand({
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
          c."totalSpent",
          c."netSpent",
          c."totalRefunded",
          c."totalCashbackEarned",
          c."orderCount",
          c."currentTierId",
          c."hasActiveSubscription",
          c."subscriptionTier",
          c."createdAt",
          c."updatedAt",
          t.name as "tierName",
          t."minSpend" as "tierMinSpend",
          t."cashbackPercent" as "tierCashbackPercent"
        FROM "Customer" c
        LEFT JOIN "Tier" t ON c."currentTierId" = t.id
        WHERE c.shop = :shop AND c.email = :email
      `,
      parameters: [
        { name: 'shop', value: { stringValue: SHOP } },
        { name: 'email', value: { stringValue: EMAIL } }
      ],
      includeResultMetadata: true
    }));

    if (customerData.records && customerData.records.length > 0) {
      const r = customerData.records[0];
      console.log('Customer ID:', r[0]?.stringValue);
      console.log('Shop:', r[1]?.stringValue);
      console.log('Shopify Customer ID:', r[2]?.stringValue);
      console.log('Email:', r[3]?.stringValue);
      console.log('Name:', `${r[4]?.stringValue || ''} ${r[5]?.stringValue || ''}`.trim() || 'N/A');
      console.log('Store Credit:', r[6]?.doubleValue || r[6]?.stringValue || '0');
      console.log('Total Spent:', r[7]?.doubleValue || r[7]?.stringValue || '0');
      console.log('Net Spent:', r[8]?.doubleValue || r[8]?.stringValue || '0');
      console.log('Total Refunded:', r[9]?.doubleValue || r[9]?.stringValue || '0');
      console.log('Total Cashback Earned:', r[10]?.doubleValue || r[10]?.stringValue || '0');
      console.log('Order Count:', r[11]?.longValue || r[11]?.stringValue || '0');
      console.log('Current Tier ID:', r[12]?.stringValue || 'None');
      console.log('Has Active Subscription:', r[13]?.booleanValue || false);
      console.log('Subscription Tier:', r[14]?.stringValue || 'N/A');
      console.log('Created:', r[15]?.stringValue);
      console.log('Updated:', r[16]?.stringValue);
      console.log('Tier Name:', r[17]?.stringValue || 'None');
      console.log('Tier Min Spend:', r[18]?.doubleValue || r[18]?.stringValue || '0');
      console.log('Tier Cashback %:', r[19]?.doubleValue || r[19]?.stringValue || '0');

      const customerId = r[0]?.stringValue;
      const shopifyCustomerId = r[2]?.stringValue;

      // 2. Check for tier subscriptions
      console.log();
      console.log('📌 2. TIER SUBSCRIPTIONS');
      console.log('-'.repeat(60));
      const subscriptions = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            ts.id,
            ts.status,
            ts."tierId",
            ts."subscriptionContractId",
            ts."currentPeriodStart",
            ts."currentPeriodEnd",
            ts."createdAt",
            t.name as "tierName",
            t."minSpend",
            t."cashbackPercent"
          FROM "TierSubscription" ts
          LEFT JOIN "Tier" t ON ts."tierId" = t.id
          WHERE ts."customerId" = :customerId
          ORDER BY ts."createdAt" DESC
        `,
        parameters: [
          { name: 'customerId', value: { stringValue: customerId } }
        ],
        includeResultMetadata: true
      }));

      if (subscriptions.records && subscriptions.records.length > 0) {
        console.log(`Found ${subscriptions.records.length} subscription(s):`);
        subscriptions.records.forEach((s, i) => {
          console.log(`\nSubscription #${i + 1}:`);
          console.log('  ID:', s[0]?.stringValue);
          console.log('  Status:', s[1]?.stringValue);
          console.log('  Tier ID:', s[2]?.stringValue);
          console.log('  Contract ID:', s[3]?.stringValue);
          console.log('  Period Start:', s[4]?.stringValue);
          console.log('  Period End:', s[5]?.stringValue);
          console.log('  Created:', s[6]?.stringValue);
          console.log('  Tier Name:', s[7]?.stringValue);
          console.log('  Tier Min Spend:', s[8]?.doubleValue || s[8]?.stringValue);
          console.log('  Tier Cashback %:', s[9]?.doubleValue || s[9]?.stringValue);
        });
      } else {
        console.log('No tier subscriptions found');
      }

      // 3. Check for tier purchases
      console.log();
      console.log('📌 3. TIER PURCHASES');
      console.log('-'.repeat(60));
      const purchases = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            tp.id,
            tp.status,
            tp."tierId",
            tp."shopifyOrderId",
            tp."startDate",
            tp."endDate",
            tp."createdAt",
            t.name as "tierName",
            t."minSpend",
            t."cashbackPercent"
          FROM "TierPurchase" tp
          LEFT JOIN "Tier" t ON tp."tierId" = t.id
          WHERE tp."customerId" = :customerId
          ORDER BY tp."createdAt" DESC
        `,
        parameters: [
          { name: 'customerId', value: { stringValue: customerId } }
        ],
        includeResultMetadata: true
      }));

      if (purchases.records && purchases.records.length > 0) {
        console.log(`Found ${purchases.records.length} purchase(s):`);
        purchases.records.forEach((p, i) => {
          console.log(`\nPurchase #${i + 1}:`);
          console.log('  ID:', p[0]?.stringValue);
          console.log('  Status:', p[1]?.stringValue);
          console.log('  Tier ID:', p[2]?.stringValue);
          console.log('  Shopify Order ID:', p[3]?.stringValue);
          console.log('  Start Date:', p[4]?.stringValue);
          console.log('  End Date:', p[5]?.stringValue || 'LIFETIME');
          console.log('  Created:', p[6]?.stringValue);
          console.log('  Tier Name:', p[7]?.stringValue);
          console.log('  Tier Min Spend:', p[8]?.doubleValue || p[8]?.stringValue);
          console.log('  Tier Cashback %:', p[9]?.doubleValue || p[9]?.stringValue);
        });
      } else {
        console.log('No tier purchases found');
      }

      // 4. Check all tiers for this shop
      console.log();
      console.log('📌 4. ALL TIERS FOR SHOP');
      console.log('-'.repeat(60));
      const tiers = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            id,
            name,
            "minSpend",
            "cashbackPercent",
            "createdAt"
          FROM "Tier"
          WHERE shop = :shop
          ORDER BY "minSpend" ASC
        `,
        parameters: [
          { name: 'shop', value: { stringValue: SHOP } }
        ],
        includeResultMetadata: true
      }));

      if (tiers.records && tiers.records.length > 0) {
        console.log(`Found ${tiers.records.length} tier(s):`);
        tiers.records.forEach((t, i) => {
          console.log(`\nTier #${i + 1}:`);
          console.log('  ID:', t[0]?.stringValue);
          console.log('  Name:', t[1]?.stringValue);
          console.log('  Min Spend:', t[2]?.doubleValue || t[2]?.stringValue);
          console.log('  Cashback %:', t[3]?.doubleValue || t[3]?.stringValue);
          console.log('  Created:', t[4]?.stringValue);
        });
      } else {
        console.log('No tiers found for shop');
      }

      // 5. Check tier change log
      console.log();
      console.log('📌 5. TIER CHANGE HISTORY (Last 10)');
      console.log('-'.repeat(60));
      const changeLogs = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            id,
            "fromTierName",
            "toTierName",
            "changeType",
            "triggerType",
            "orderId",
            "subscriptionId",
            metadata,
            "createdAt"
          FROM "TierChangeLog"
          WHERE "customerId" = :customerId
          ORDER BY "createdAt" DESC
          LIMIT 10
        `,
        parameters: [
          { name: 'customerId', value: { stringValue: customerId } }
        ],
        includeResultMetadata: true
      }));

      if (changeLogs.records && changeLogs.records.length > 0) {
        console.log(`Found ${changeLogs.records.length} change log(s):`);
        changeLogs.records.forEach((log, i) => {
          console.log(`\nChange #${i + 1}:`);
          console.log('  ID:', log[0]?.stringValue);
          console.log('  From Tier:', log[1]?.stringValue || 'None');
          console.log('  To Tier:', log[2]?.stringValue || 'None');
          console.log('  Change Type:', log[3]?.stringValue);
          console.log('  Trigger:', log[4]?.stringValue);
          console.log('  Order ID:', log[5]?.stringValue || 'N/A');
          console.log('  Subscription ID:', log[6]?.stringValue || 'N/A');
          console.log('  Created:', log[8]?.stringValue);
        });
      } else {
        console.log('No tier change logs found');
      }

      // 6. Check store credit ledger
      console.log();
      console.log('📌 6. STORE CREDIT LEDGER (Last 10)');
      console.log('-'.repeat(60));
      const ledger = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            id,
            "entryType",
            amount,
            "runningBalance",
            "orderId",
            "orderName",
            description,
            "createdAt"
          FROM "StoreCreditLedger"
          WHERE "customerId" = :customerId
          ORDER BY "createdAt" DESC
          LIMIT 10
        `,
        parameters: [
          { name: 'customerId', value: { stringValue: customerId } }
        ],
        includeResultMetadata: true
      }));

      if (ledger.records && ledger.records.length > 0) {
        console.log(`Found ${ledger.records.length} ledger entries:`);
        ledger.records.forEach((l, i) => {
          console.log(`\nLedger Entry #${i + 1}:`);
          console.log('  ID:', l[0]?.stringValue);
          console.log('  Type:', l[1]?.stringValue);
          console.log('  Amount:', l[2]?.doubleValue || l[2]?.stringValue);
          console.log('  Running Balance:', l[3]?.doubleValue || l[3]?.stringValue);
          console.log('  Order ID:', l[4]?.stringValue || 'N/A');
          console.log('  Order Name:', l[5]?.stringValue || 'N/A');
          console.log('  Description:', l[6]?.stringValue);
          console.log('  Created:', l[7]?.stringValue);
        });
      } else {
        console.log('No ledger entries found');
      }

      // 7. Check if there's a customer with different Shopify ID but same email
      console.log();
      console.log('📌 7. OTHER CUSTOMERS WITH SAME EMAIL IN THIS SHOP');
      console.log('-'.repeat(60));
      const otherCustomers = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            c.id,
            c."shopifyCustomerId",
            c."storeCredit",
            c."currentTierId",
            t.name as "tierName"
          FROM "Customer" c
          LEFT JOIN "Tier" t ON c."currentTierId" = t.id
          WHERE c.shop = :shop AND c.email = :email
          ORDER BY c."createdAt" DESC
        `,
        parameters: [
          { name: 'shop', value: { stringValue: SHOP } },
          { name: 'email', value: { stringValue: EMAIL } }
        ],
        includeResultMetadata: true
      }));

      console.log(`Found ${otherCustomers.records?.length || 0} customer(s) with this email in this shop:`);
      if (otherCustomers.records) {
        otherCustomers.records.forEach((c, i) => {
          console.log(`\nCustomer #${i + 1}:`);
          console.log('  Internal ID:', c[0]?.stringValue);
          console.log('  Shopify Customer ID:', c[1]?.stringValue);
          console.log('  Store Credit:', c[2]?.doubleValue || c[2]?.stringValue);
          console.log('  Current Tier ID:', c[3]?.stringValue);
          console.log('  Tier Name:', c[4]?.stringValue);
        });
      }

      // 8. Check for Platinum tier existence
      console.log();
      console.log('📌 8. CHECKING FOR "PLATINUM" TIER');
      console.log('-'.repeat(60));
      const platinumTier = await client.send(new ExecuteStatementCommand({
        resourceArn,
        secretArn,
        database,
        sql: `
          SELECT
            id,
            name,
            shop,
            "minSpend",
            "cashbackPercent"
          FROM "Tier"
          WHERE LOWER(name) LIKE '%platinum%'
        `,
        includeResultMetadata: true
      }));

      if (platinumTier.records && platinumTier.records.length > 0) {
        console.log(`Found ${platinumTier.records.length} Platinum tier(s):`);
        platinumTier.records.forEach((t, i) => {
          console.log(`\nPlatinum Tier #${i + 1}:`);
          console.log('  ID:', t[0]?.stringValue);
          console.log('  Name:', t[1]?.stringValue);
          console.log('  Shop:', t[2]?.stringValue);
          console.log('  Min Spend:', t[3]?.doubleValue || t[3]?.stringValue);
          console.log('  Cashback %:', t[4]?.doubleValue || t[4]?.stringValue);
        });
      } else {
        console.log('No Platinum tiers found in any shop');
      }

    } else {
      console.log('❌ Customer not found in this shop');
    }

    console.log();
    console.log('='.repeat(80));
    console.log('📊 ANALYSIS COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

main();
