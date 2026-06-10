/**
 * Add test transaction data to credit ledger
 * Creates 30 realistic transactions with varying amounts
 * Customer: aaasiadog@gmail.com (23893043347801)
 * Shop: rewardspro-dev.myshopify.com
 */

import { createDataAPIPrismaClient } from '../app/utils/prisma-data-api-adapter';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const prisma = createDataAPIPrismaClient();

async function main() {
  const shop = 'rewardspro-dev.myshopify.com';
  const customerId = '23893043347801';

  console.log('Adding test transaction data...');
  console.log('Shop:', shop);
  console.log('Customer ID:', customerId);

  // Find the customer
  const customer = await prisma.customer.findFirst({
    where: {
      shopifyCustomerId: customerId,
      shop
    }
  });

  if (!customer) {
    console.error('❌ Customer not found!');
    process.exit(1);
  }

  console.log('✅ Customer found:', customer.email);

  // Define 30 realistic transactions over the past 6 months
  const today = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;

  const transactions = [
    // Month 1 (6 months ago) - Getting started
    {
      type: 'CASHBACK_EARNED',
      amount: 8.50,
      description: 'Cashback from order #1001',
      metadata: { orderName: '#1001', orderAmount: 170 },
      daysAgo: 180
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 12.00,
      description: 'Cashback from order #1002',
      metadata: { orderName: '#1002', orderAmount: 240 },
      daysAgo: 175
    },
    {
      type: 'ORDER_PAYMENT',
      amount: -10.00,
      description: 'Used for order #1003',
      metadata: { orderName: '#1003' },
      daysAgo: 172
    },

    // Month 2 (5 months ago)
    {
      type: 'CASHBACK_EARNED',
      amount: 15.50,
      description: 'Cashback from order #1004',
      metadata: { orderName: '#1004', orderAmount: 310 },
      daysAgo: 150
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 6.25,
      description: 'Cashback from order #1005',
      metadata: { orderName: '#1005', orderAmount: 125 },
      daysAgo: 145
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 22.00,
      description: 'Cashback from order #1006',
      metadata: { orderName: '#1006', orderAmount: 440 },
      daysAgo: 142
    },

    // Month 3 (4 months ago) - Using credit
    {
      type: 'ORDER_PAYMENT',
      amount: -15.00,
      description: 'Used for order #1007',
      metadata: { orderName: '#1007' },
      daysAgo: 120
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 18.75,
      description: 'Cashback from order #1008',
      metadata: { orderName: '#1008', orderAmount: 375 },
      daysAgo: 118
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 9.00,
      description: 'Cashback from order #1009',
      metadata: { orderName: '#1009', orderAmount: 180 },
      daysAgo: 115
    },
    {
      type: 'MANUAL_ADJUSTMENT',
      amount: 5.00,
      description: 'Bonus reward for review',
      metadata: { reason: 'Product review bonus' },
      daysAgo: 110
    },

    // Month 4 (3 months ago) - Higher activity
    {
      type: 'CASHBACK_EARNED',
      amount: 25.00,
      description: 'Cashback from order #1010',
      metadata: { orderName: '#1010', orderAmount: 500 },
      daysAgo: 90
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 11.25,
      description: 'Cashback from order #1011',
      metadata: { orderName: '#1011', orderAmount: 225 },
      daysAgo: 87
    },
    {
      type: 'ORDER_PAYMENT',
      amount: -20.00,
      description: 'Used for order #1012',
      metadata: { orderName: '#1012' },
      daysAgo: 85
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 16.50,
      description: 'Cashback from order #1013',
      metadata: { orderName: '#1013', orderAmount: 330 },
      daysAgo: 82
    },
    {
      type: 'REFUND_CREDIT',
      amount: 8.00,
      description: 'Refund from order #1010',
      metadata: { orderName: '#1010', refundAmount: 160 },
      daysAgo: 80
    },

    // Month 5 (2 months ago) - Peak activity
    {
      type: 'CASHBACK_EARNED',
      amount: 30.00,
      description: 'Cashback from order #1014',
      metadata: { orderName: '#1014', orderAmount: 600 },
      daysAgo: 60
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 14.00,
      description: 'Cashback from order #1015',
      metadata: { orderName: '#1015', orderAmount: 280 },
      daysAgo: 58
    },
    {
      type: 'ORDER_PAYMENT',
      amount: -25.00,
      description: 'Used for order #1016',
      metadata: { orderName: '#1016' },
      daysAgo: 55
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 19.50,
      description: 'Cashback from order #1017',
      metadata: { orderName: '#1017', orderAmount: 390 },
      daysAgo: 52
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 27.50,
      description: 'Cashback from order #1018',
      metadata: { orderName: '#1018', orderAmount: 550 },
      daysAgo: 50
    },

    // Month 6 (1 month ago) - Recent activity
    {
      type: 'CASHBACK_EARNED',
      amount: 21.00,
      description: 'Cashback from order #1019',
      metadata: { orderName: '#1019', orderAmount: 420 },
      daysAgo: 30
    },
    {
      type: 'ORDER_PAYMENT',
      amount: -18.00,
      description: 'Used for order #1020',
      metadata: { orderName: '#1020' },
      daysAgo: 28
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 13.75,
      description: 'Cashback from order #1021',
      metadata: { orderName: '#1021', orderAmount: 275 },
      daysAgo: 25
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 24.00,
      description: 'Cashback from order #1022',
      metadata: { orderName: '#1022', orderAmount: 480 },
      daysAgo: 22
    },
    {
      type: 'MANUAL_ADJUSTMENT',
      amount: 10.00,
      description: 'Loyalty bonus',
      metadata: { reason: 'Special promotion reward' },
      daysAgo: 20
    },

    // Recent week
    {
      type: 'CASHBACK_EARNED',
      amount: 17.25,
      description: 'Cashback from order #1023',
      metadata: { orderName: '#1023', orderAmount: 345 },
      daysAgo: 7
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 22.50,
      description: 'Cashback from order #1024',
      metadata: { orderName: '#1024', orderAmount: 450 },
      daysAgo: 3
    },
    {
      type: 'ORDER_PAYMENT',
      amount: -12.00,
      description: 'Used for order #1025',
      metadata: { orderName: '#1025' },
      daysAgo: 1
    },

    // Today
    {
      type: 'CASHBACK_EARNED',
      amount: 15.00,
      description: 'Cashback from order #1026',
      metadata: { orderName: '#1026', orderAmount: 300 },
      daysAgo: 0
    },
    {
      type: 'CASHBACK_EARNED',
      amount: 8.25,
      description: 'Cashback from order #1027',
      metadata: { orderName: '#1027', orderAmount: 165 },
      daysAgo: 0
    }
  ];

  console.log(`\nCreating ${transactions.length} test transactions...\n`);

  // Calculate running balance
  let runningBalance = 0;
  let created = 0;

  for (const tx of transactions) {
    runningBalance += tx.amount;

    try {
      await prisma.storeCreditLedger.create({
        data: {
          id: randomUUID(),
          customerId: customer.id,
          shop,
          type: tx.type as any,
          amount: tx.amount,
          balance: runningBalance,
          metadata: tx.metadata,
          createdAt: new Date(today - (tx.daysAgo * dayInMs))
        }
      });
      created++;

      // Progress indicator
      if (created % 5 === 0) {
        console.log(`✅ Created ${created}/${transactions.length} transactions...`);
      }
    } catch (error: any) {
      console.error(`❌ Failed to create transaction:`, error.message);
    }
  }

  console.log(`\n🎉 Successfully created ${created} transactions!`);
  console.log('\nTransaction Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const earned = transactions
    .filter(t => ['CASHBACK_EARNED', 'REFUND_CREDIT', 'MANUAL_ADJUSTMENT'].includes(t.type))
    .reduce((sum, t) => sum + t.amount, 0);

  const spent = transactions
    .filter(t => t.type === 'ORDER_PAYMENT')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  console.log(`Total Earned:    $${earned.toFixed(2)}`);
  console.log(`Total Used:      $${spent.toFixed(2)}`);
  console.log(`Final Balance:   $${runningBalance.toFixed(2)}`);
  console.log(`Transactions:    ${created}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
