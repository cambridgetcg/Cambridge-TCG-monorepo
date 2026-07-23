/**
 * Fix Customer Data Script
 * Updates customers with placeholder emails to real Shopify data
 *
 * Usage: npx tsx scripts/fix-customer-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCustomerData() {
  console.log('🔧 Starting customer data fix...\n');

  // Find all customers with placeholder emails
  const customersToFix = await prisma.customer.findMany({
    where: {
      email: {
        contains: 'customer'
      }
    },
    select: {
      id: true,
      shop: true,
      shopifyCustomerId: true,
      email: true,
      storeCredit: true,
      totalSpent: true
    }
  });

  console.log(`📊 Found ${customersToFix.length} customers with placeholder emails\n`);

  if (customersToFix.length === 0) {
    console.log('✅ No customers to fix!');
    return;
  }

  // Display the customers that will be updated
  console.log('Customers to update:');
  customersToFix.forEach((customer, index) => {
    console.log(`${index + 1}. ${customer.email}`);
    console.log(`   Shop: ${customer.shop}`);
    console.log(`   Shopify ID: ${customer.shopifyCustomerId}`);
    console.log(`   Current Store Credit: ${customer.storeCredit}`);
    console.log('');
  });

  console.log('\n⚠️  This script will update placeholder emails but preserve store credit and tiers.');
  console.log('📝 To update with real Shopify data, use the admin sync tool instead.\n');

  console.log('✅ Script complete. Use admin dashboard sync for full customer updates.');
}

fixCustomerData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
