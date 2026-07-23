/**
 * Script to add multiple mock customers to the database via Aurora Data API
 * Usage: node --import tsx/esm --env-file=.env scripts/add-bulk-mock-customers.ts [count]
 *
 * Requires: DATABASE_URL environment variable
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';

import db from '../app/db.server';

const SHOP = 'themetester222.myshopify.com';
const COUNT = parseInt(process.argv[2] || '100');

const FIRST_NAMES = [
  'John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Jessica',
  'William', 'Ashley', 'James', 'Emma', 'Christopher', 'Olivia', 'Daniel',
  'Sophia', 'Matthew', 'Isabella', 'Joseph', 'Mia', 'Andrew', 'Charlotte',
  'Ryan', 'Amelia', 'Joshua', 'Harper', 'Nicholas', 'Evelyn', 'Alexander', 'Abigail'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
];

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDecimal(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

async function addBulkMockCustomers() {
  console.log('🔄 Starting bulk mock customer creation...');
  console.log(`📍 Shop: ${SHOP}`);
  console.log(`📊 Count: ${COUNT} customers`);

  try {
    // Get available tiers
    const tiers = await db.tier.findMany({
      where: { shop: SHOP },
      orderBy: { minSpend: 'asc' }
    });

    if (tiers.length === 0) {
      console.error('❌ No tiers found for this shop. Please create tiers first.');
      return;
    }

    console.log(`✅ Found ${tiers.length} tier(s): ${tiers.map(t => t.name).join(', ')}`);
    console.log('\n🚀 Creating customers...\n');

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < COUNT; i++) {
      try {
        const firstName = randomElement(FIRST_NAMES);
        const lastName = randomElement(LAST_NAMES);
        const timestamp = Date.now();
        const randomSuffix = randomNumber(1000, 9999);

        // Generate varied spending amounts for different tiers
        const tierIndex = Math.floor(Math.random() * tiers.length);
        const tier = tiers[tierIndex];

        // Generate spending amounts based on tier
        let totalSpent: number;
        if (tierIndex === 0) {
          // Lower tier: 0-500
          totalSpent = randomDecimal(0, 500);
        } else if (tierIndex === tiers.length - 1) {
          // Highest tier: tier minSpend + extra
          totalSpent = tier.minSpend + randomDecimal(0, 1000);
        } else {
          // Mid tiers: around tier minSpend
          totalSpent = tier.minSpend + randomDecimal(-100, 300);
        }

        const annualSpent = randomDecimal(totalSpent * 0.6, totalSpent);
        const orderCount = randomNumber(1, 20);
        const totalCashbackEarned = randomDecimal(totalSpent * 0.01, totalSpent * 0.05);
        const totalRefunded = randomDecimal(0, totalSpent * 0.1);
        const netSpent = totalSpent - totalRefunded;
        const storeCredit = randomDecimal(0, totalCashbackEarned);
        const pointsBalance = randomDecimal(0, 500);
        const lifetimePoints = pointsBalance + randomDecimal(100, 1000);

        const shopifyCustomerId = `gid://shopify/Customer/${randomNumber(100000000000, 999999999999)}`;
        const customerId = randomUUID();
        const now = new Date();

        // Create customer
        await db.customer.create({
          data: {
            id: customerId,
            shop: SHOP,
            shopifyCustomerId: shopifyCustomerId,
            email: `mock.${firstName.toLowerCase()}.${lastName.toLowerCase()}.${timestamp}.${randomSuffix}@example.com`,
            firstName: firstName,
            lastName: lastName,
            tags: 'mock-data, test-customer',
            storeCredit: storeCredit,
            pointsBalance: pointsBalance,
            lifetimePoints: lifetimePoints,
            totalSpent: totalSpent,
            annualSpent: annualSpent,
            totalCashbackEarned: totalCashbackEarned,
            totalRefunded: totalRefunded,
            netSpent: netSpent,
            orderCount: orderCount,
            lastOrderDate: new Date(Date.now() - randomNumber(1, 90) * 24 * 60 * 60 * 1000),
            currentTierId: tier.id,
            hasActiveSubscription: false,
            subscriptionTier: null,
            shopifyCustomerMetafieldId: null,
            createdAt: now,
            updatedAt: now,
          }
        });

        // Create 1-3 ledger entries for some variety
        const ledgerCount = randomNumber(1, 3);
        for (let j = 0; j < ledgerCount; j++) {
          const amount = randomDecimal(5, 50);
          await db.storeCreditLedger.create({
            data: {
              id: randomUUID(),
              customerId: customerId,
              shop: SHOP,
              amount: j === ledgerCount - 1 && Math.random() > 0.7 ? -amount : amount,
              balance: j === 0 ? amount : randomDecimal(0, storeCredit),
              type: j === ledgerCount - 1 && Math.random() > 0.7 ? 'ORDER_PAYMENT' : 'CASHBACK_EARNED',
              metadata: { description: `Mock transaction ${j + 1}` },
              shopifyOrderId: null,
              orderId: null,
            }
          });
        }

        successCount++;

        // Progress indicator
        if ((i + 1) % 10 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = (i + 1) / elapsed;
          const remaining = (COUNT - (i + 1)) / rate;
          console.log(`✅ Progress: ${i + 1}/${COUNT} customers created (${rate.toFixed(1)}/sec, ~${Math.ceil(remaining)}s remaining)`);
        }

      } catch (error) {
        errorCount++;
        console.error(`❌ Error creating customer ${i + 1}:`, error);
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Bulk customer creation completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Successfully created: ${successCount} customers`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⏱️  Total time: ${elapsed.toFixed(2)}s`);
    console.log(`📈 Average rate: ${(successCount / elapsed).toFixed(2)} customers/sec`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ Error in bulk creation:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the script
addBulkMockCustomers()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
