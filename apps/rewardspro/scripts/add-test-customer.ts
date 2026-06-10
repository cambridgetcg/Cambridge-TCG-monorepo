/**
 * Add test customer data for aaasiadog@gmail.com
 * Customer ID: 23893043347801
 * Shop: rewardspro-dev.myshopify.com
 */

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const prisma = createDataAPIPrismaClient();

async function main() {
  const shop = 'rewardspro-dev.myshopify.com';
  const customerId = '23893043347801';
  const email = 'aaasiadog@gmail.com';

  console.log('Adding test customer data...');
  console.log('Shop:', shop);
  console.log('Customer ID:', customerId);
  console.log('Email:', email);

  // Create or find Gold tier (skip shop settings for now)
  let goldTier = await prisma.tier.findFirst({
    where: {
      shop,
      name: 'Gold'
    }
  });

  if (!goldTier) {
    console.log('Creating Gold tier...');
    goldTier = await prisma.tier.create({
      data: {
        id: `tier_gold_${Date.now()}`,
        shop,
        name: 'Gold',
        minSpend: 500,
        cashbackPercent: 5
      }
    });
    console.log('✅ Gold tier created');
  }

  // Find existing customer
  let customer = await prisma.customer.findFirst({
    where: {
      shopifyCustomerId: customerId,
      shop
    }
  });

  if (customer) {
    console.log('Updating existing customer...');
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        email,
        storeCredit: 25.50, // $25.50 balance
        totalSpent: 750.00, // Qualified for Gold tier
        totalCashbackEarned: 37.50,
        netSpent: 750.00,
        orderCount: 2,
        currentTierId: goldTier.id
      }
    });
  } else {
    console.log('Creating new customer...');
    const now = new Date();
    customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        shopifyCustomerId: customerId,
        shop,
        email,
        firstName: 'Test',
        lastName: 'Customer',
        storeCredit: 25.50,
        totalSpent: 750.00,
        totalCashbackEarned: 37.50,
        netSpent: 750.00,
        orderCount: 2,
        currentTierId: goldTier.id,
        createdAt: now,
        updatedAt: now
      }
    });
  }

  console.log('✅ Customer created/updated:', customer.id);

  // Add some test transactions
  // Calculate running balances
  let runningBalance = 0;
  const transactions = [
    {
      id: randomUUID(),
      customerId: customer.id,
      shop,
      type: 'CASHBACK_EARNED',
      amount: 15.00,
      balance: 15.00,
      metadata: { orderName: '#1001', orderAmount: 300 },
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    {
      id: randomUUID(),
      customerId: customer.id,
      shop,
      type: 'CASHBACK_EARNED',
      amount: 22.50,
      balance: 37.50,
      metadata: { orderName: '#1002', orderAmount: 450 },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    {
      id: randomUUID(),
      customerId: customer.id,
      shop,
      type: 'ORDER_PAYMENT',
      amount: -12.00,
      balance: 25.50,
      metadata: { orderName: '#1003' },
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    }
  ];

  console.log('Adding test transactions...');
  for (const tx of transactions) {
    await prisma.storeCreditLedger.create({
      data: tx
    });
  }

  console.log('✅ Added', transactions.length, 'test transactions');
  console.log('\n🎉 Test data created successfully!');
  console.log('\nCustomer Summary:');
  console.log('- Email:', email);
  console.log('- Store Credit Balance: $25.50');
  console.log('- Tier: Gold (5% cashback)');
  console.log('- Total Earned: $37.50');
  console.log('- Recent Transactions: 3');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
