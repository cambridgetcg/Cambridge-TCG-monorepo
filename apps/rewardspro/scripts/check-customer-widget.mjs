#!/usr/bin/env node
/**
 * Check Customer Data for Widget Debugging
 *
 * This script fetches customer data to debug why the widget can't find the customer.
 * Usage: node scripts/check-customer-widget.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

const TARGET_SHOPIFY_CUSTOMER_ID = '9440245350739';
const TARGET_EMAIL = 'aaasiadog@gmail.com';

async function main() {
  console.log('='.repeat(80));
  console.log('🔍 Checking Customer Data for Widget');
  console.log('='.repeat(80));
  console.log();

  // Search by Shopify Customer ID
  console.log(`📌 Searching for shopifyCustomerId: ${TARGET_SHOPIFY_CUSTOMER_ID}`);
  const customersByShopifyId = await prisma.customer.findMany({
    where: {
      shopifyCustomerId: TARGET_SHOPIFY_CUSTOMER_ID
    },
    select: {
      id: true,
      shop: true,
      shopifyCustomerId: true,
      email: true,
      firstName: true,
      lastName: true,
      storeCredit: true,
      currentTierId: true,
      currentTier: {
        select: {
          id: true,
          name: true,
          cashbackPercent: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });

  console.log(`Found ${customersByShopifyId.length} customer(s):\n`);

  if (customersByShopifyId.length > 0) {
    customersByShopifyId.forEach((customer, index) => {
      console.log(`Customer #${index + 1}:`);
      console.log('  Internal ID:', customer.id);
      console.log('  Shop:', customer.shop);
      console.log('  Shopify Customer ID:', customer.shopifyCustomerId);
      console.log('  Email:', customer.email);
      console.log('  Name:', `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'N/A');
      console.log('  Store Credit:', customer.storeCredit?.toString() || '0');
      console.log('  Current Tier:', customer.currentTier?.name || 'None');
      if (customer.currentTier) {
        console.log('    - Tier ID:', customer.currentTier.id);
        console.log('    - Cashback:', `${customer.currentTier.cashbackPercent}%`);
      }
      console.log('  Created:', customer.createdAt?.toISOString());
      console.log('  Updated:', customer.updatedAt?.toISOString());
      console.log();
    });
  } else {
    console.log('  ❌ No customers found with this Shopify customer ID');
    console.log();
  }

  // Search by email as backup
  console.log(`📌 Searching for email: ${TARGET_EMAIL}`);
  const customersByEmail = await prisma.customer.findMany({
    where: {
      email: TARGET_EMAIL
    },
    select: {
      id: true,
      shop: true,
      shopifyCustomerId: true,
      email: true,
      storeCredit: true,
      currentTierId: true,
      currentTier: {
        select: {
          name: true
        }
      }
    }
  });

  console.log(`Found ${customersByEmail.length} customer(s):\n`);

  if (customersByEmail.length > 0) {
    customersByEmail.forEach((customer, index) => {
      console.log(`Customer #${index + 1}:`);
      console.log('  Internal ID:', customer.id);
      console.log('  Shop:', customer.shop);
      console.log('  Shopify Customer ID:', customer.shopifyCustomerId);
      console.log('  Email:', customer.email);
      console.log('  Store Credit:', customer.storeCredit?.toString() || '0');
      console.log('  Current Tier:', customer.currentTier?.name || 'None');
      console.log();
    });
  } else {
    console.log('  ❌ No customers found with this email');
    console.log();
  }

  // Get all unique shop domains
  console.log('📌 All shop domains in database:');
  const shops = await prisma.customer.groupBy({
    by: ['shop'],
    _count: {
      shop: true
    },
    orderBy: {
      shop: 'asc'
    }
  });

  console.log(`Found ${shops.length} unique shop(s):\n`);
  shops.forEach((shop) => {
    console.log(`  - ${shop.shop} (${shop._count.shop} customers)`);
  });
  console.log();

  // Summary
  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log();

  if (customersByShopifyId.length > 0) {
    const customer = customersByShopifyId[0];
    console.log('✅ Customer EXISTS in database');
    console.log();
    console.log('Expected shop domain format for app proxy query:');
    console.log(`  shop: "${customer.shop}"`);
    console.log();
    console.log('Expected query:');
    console.log(`  shopifyCustomerId: "${customer.shopifyCustomerId}"`);
    console.log(`  shop: "${customer.shop}"`);
    console.log();
    console.log('Customer Account Extension endpoint finds this customer because:');
    console.log(`  ✓ Queries with: { shopifyCustomerId: "${customer.shopifyCustomerId}", shop: "${customer.shop}" }`);
    console.log();
    console.log('App Proxy endpoint might fail if:');
    console.log('  ✗ session.shop has different format (e.g., missing .myshopify.com)');
    console.log('  ✗ session.shop has extra/missing parts');
    console.log();
  } else {
    console.log('❌ Customer NOT FOUND in database');
    console.log();
    console.log('Possible reasons:');
    console.log('  1. Customer not enrolled in RewardsPro');
    console.log('  2. Shopify customer ID changed or incorrect');
    console.log('  3. Customer exists but with different shopifyCustomerId format');
    console.log();
  }

  console.log('='.repeat(80));
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
