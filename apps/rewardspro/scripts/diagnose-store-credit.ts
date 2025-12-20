#!/usr/bin/env npx tsx
/**
 * Diagnose Store Credit Discrepancy
 *
 * Traces the exact data flow for store credit to understand
 * why widget shows $9.65 but database has $20.45
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { default: prisma } = await import("../app/db.server");
  const { getAuroraClient } = await import("../app/utils/aurora-data-api");

  const SHOP = '6e824e-a9.myshopify.com';
  const EMAIL = 'aaasiadog@gmail.com';
  const SHOPIFY_CUSTOMER_ID = '7891422871817';

  console.log('='.repeat(80));
  console.log('STORE CREDIT DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log(`Shop: ${SHOP}`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Shopify Customer ID: ${SHOPIFY_CUSTOMER_ID}`);
  console.log();

  // 1. Query via Prisma (same as API uses)
  console.log('1. PRISMA QUERY (by shopifyCustomerId)');
  console.log('-'.repeat(60));
  const prismaCustomer = await prisma.customer.findFirst({
    where: {
      shop: SHOP,
      shopifyCustomerId: SHOPIFY_CUSTOMER_ID
    },
    include: {
      currentTier: true
    }
  });

  if (prismaCustomer) {
    console.log('Customer Found:');
    console.log('  Internal ID:', prismaCustomer.id);
    console.log('  Shopify ID:', prismaCustomer.shopifyCustomerId);
    console.log('  Email:', prismaCustomer.email);
    console.log('  Store Credit:', Number(prismaCustomer.storeCredit));
    console.log('  Store Credit Type:', typeof prismaCustomer.storeCredit);
    console.log('  Store Credit Raw:', prismaCustomer.storeCredit);
    console.log('  Current Tier:', prismaCustomer.currentTier?.name || 'None');
    console.log('  Total Cashback Earned:', Number(prismaCustomer.totalCashbackEarned));
    console.log('  Updated At:', prismaCustomer.updatedAt);
  } else {
    console.log('NOT FOUND via Prisma!');
  }
  console.log();

  // 2. Query via Data API (exact same SQL as API proxy)
  console.log('2. DATA API QUERY (exact API proxy SQL)');
  console.log('-'.repeat(60));
  const dataApi = getAuroraClient();

  const sql = `
    SELECT
      c.id,
      c.shop,
      c."shopifyCustomerId",
      c.email,
      c."firstName",
      c."lastName",
      c."storeCredit",
      c."totalCashbackEarned",
      c."totalSpent",
      c."netSpent",
      c."totalRefunded",
      c."orderCount",
      c."createdAt",
      c."updatedAt",
      c."currentTierId",

      t.id as "tier_id",
      t.shop as "tier_shop",
      t.name as "tier_name",
      t."minSpend" as "tier_minSpend",
      t."cashbackPercent" as "tier_cashbackPercent"

    FROM "Customer" c

    LEFT JOIN "Tier" t
      ON t.id = c."currentTierId"

    WHERE
      c.shop = :shopDomain
      AND c."shopifyCustomerId" = :shopifyCustomerId

    LIMIT 1
  `;

  const result = await dataApi.executeStatement(sql, [
    { name: 'shopDomain', value: { stringValue: SHOP } },
    { name: 'shopifyCustomerId', value: { stringValue: SHOPIFY_CUSTOMER_ID } }
  ]);

  if (result.records && result.records.length > 0) {
    const row = result.records[0];
    console.log('Customer Found:');
    console.log('  Internal ID:', row.id);
    console.log('  Shopify ID:', row.shopifyCustomerId);
    console.log('  Email:', row.email);
    console.log('  Store Credit:', row.storeCredit);
    console.log('  Store Credit Type:', typeof row.storeCredit);
    console.log('  Current Tier ID:', row.currentTierId);
    console.log('  Tier Name:', row.tier_name || 'None');
    console.log('  Total Cashback Earned:', row.totalCashbackEarned);
    console.log('  Updated At:', row.updatedAt);
  } else {
    console.log('NOT FOUND via Data API!');
  }
  console.log();

  // 3. Check all customers with this email in this shop
  console.log('3. ALL CUSTOMERS WITH EMAIL IN SHOP');
  console.log('-'.repeat(60));
  const allCustomers = await prisma.customer.findMany({
    where: {
      shop: SHOP,
      email: EMAIL
    },
    include: {
      currentTier: true
    }
  });

  console.log(`Found ${allCustomers.length} customer(s):`);
  for (const c of allCustomers) {
    console.log();
    console.log(`  Customer: ${c.id}`);
    console.log(`    Shopify ID: ${c.shopifyCustomerId}`);
    console.log(`    Email: ${c.email}`);
    console.log(`    Store Credit: ${Number(c.storeCredit)}`);
    console.log(`    Tier: ${c.currentTier?.name || 'None'}`);
    console.log(`    Updated: ${c.updatedAt}`);
  }
  console.log();

  // 4. Check store credit ledger
  console.log('4. STORE CREDIT LEDGER (Last 10 entries)');
  console.log('-'.repeat(60));
  if (prismaCustomer) {
    const ledger = await prisma.storeCreditLedger.findMany({
      where: { customerId: prismaCustomer.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`Found ${ledger.length} ledger entries:`);
    for (const entry of ledger) {
      console.log();
      console.log(`  Entry: ${entry.id}`);
      console.log(`    Type: ${entry.entryType}`);
      console.log(`    Amount: ${Number(entry.amount)}`);
      console.log(`    Running Balance: ${Number(entry.runningBalance)}`);
      console.log(`    Description: ${entry.description}`);
      console.log(`    Created: ${entry.createdAt}`);
    }
  }
  console.log();

  // 5. What the API would return
  console.log('5. SIMULATED API RESPONSE');
  console.log('-'.repeat(60));
  if (prismaCustomer) {
    const apiResponse = {
      balance: {
        storeCredit: Number(prismaCustomer.storeCredit || 0),
        totalEarned: Number(prismaCustomer.totalCashbackEarned || 0),
      }
    };
    console.log('balance.storeCredit:', apiResponse.balance.storeCredit);
    console.log('balance.totalEarned:', apiResponse.balance.totalEarned);
  }
  console.log();

  // 6. Check if there's any discrepancy between Prisma and raw values
  console.log('6. VALUE ANALYSIS');
  console.log('-'.repeat(60));
  if (prismaCustomer) {
    const storeCreditDecimal = prismaCustomer.storeCredit;
    console.log('Raw Prisma storeCredit:', storeCreditDecimal);
    console.log('  .toString():', storeCreditDecimal?.toString());
    console.log('  Number():', Number(storeCreditDecimal));
    console.log('  parseFloat():', parseFloat(String(storeCreditDecimal)));

    // Check if it's a Decimal type
    console.log('  Constructor name:', storeCreditDecimal?.constructor?.name);
    console.log('  JSON.stringify:', JSON.stringify(storeCreditDecimal));
  }

  console.log();
  console.log('='.repeat(80));
  console.log('EXPECTED: Store Credit = $20.45');
  console.log('ACTUAL (Widget): Store Credit = $9.65');
  console.log('='.repeat(80));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  process.exit(1);
});
